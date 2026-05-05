import { and, eq, inArray, lte, or } from "drizzle-orm";
import { db } from "../db/client";
import {
  subscriptions,
  plans,
  paymentMethods,
  customers,
  invoices,
  invoiceItems,
  charges,
  products,
  type Subscription,
  type Plan,
  type Customer,
  type PaymentMethod,
  type Product,
} from "../db/schema";
import { chargeWithToken } from "../payplus/charge";
import { withVat } from "../payplus/vat";
import { generateInvoiceNumber } from "./invoice-number";
import { getVatRate } from "../settings";
import { emitWebhook } from "../webhooks/delivery";

export interface RenewalRow {
  subscription: Subscription;
  customer: Customer;
  plan: Plan;
  paymentMethod: PaymentMethod | null;
  product: Product;
}

/**
 * Subscriptions whose period ends today or earlier and that should be
 * processed: active, past_due (for retry), or trial that ended (for trial-expiry).
 */
export async function getSubscriptionsDueForRenewal(): Promise<RenewalRow[]> {
  const today = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({
      sub: subscriptions,
      customer: customers,
      plan: plans,
      pm: paymentMethods,
      product: products,
    })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .innerJoin(products, eq(subscriptions.productId, products.id))
    .leftJoin(paymentMethods, eq(subscriptions.paymentMethodId, paymentMethods.id))
    .where(
      and(
        inArray(subscriptions.status, ["active", "past_due"]),
        lte(subscriptions.currentPeriodEnd, today),
      ),
    );

  return rows.map((r) => ({
    subscription: r.sub,
    customer: r.customer,
    plan: r.plan,
    paymentMethod: r.pm,
    product: r.product,
  }));
}

/**
 * Renew a single subscription. Idempotency: if there's already a 'paid'
 * invoice for the current period, skip (this can happen on cron retries).
 *
 * On success: extend period, status='active', clear dunning state.
 * On failure: increment failed_charge_count, status='past_due', set
 * dunning_started_at if first failure. Caller queues dunning emails.
 */
export async function renewSubscription(
  row: RenewalRow,
): Promise<
  | { ok: true; invoiceId: string; invoiceNumber: string }
  | { ok: false; reason: "no_payment_method" | "charge_failed" | "cancelled"; error?: string }
> {
  const { subscription: sub, customer, plan, paymentMethod, product } = row;

  // 1) Cancel-at-period-end → finalize cancellation, no charge.
  if (sub.cancelAtPeriodEnd) {
    await db
      .update(subscriptions)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id));
    return { ok: false, reason: "cancelled" };
  }

  // 2) Apply pending plan change (no proration; takes effect next period).
  let activePlan = plan;
  if (sub.pendingPlanId && sub.pendingPlanId !== sub.planId) {
    const [next] = await db
      .select()
      .from(plans)
      .where(eq(plans.id, sub.pendingPlanId))
      .limit(1);
    if (next) activePlan = next;
  }

  // 3) Need a payment method to charge.
  if (!paymentMethod || paymentMethod.status !== "active") {
    return { ok: false, reason: "no_payment_method" };
  }

  // 4) Compute amount.
  const baseAmount = sub.customMonthlyPrice
    ? Number(sub.customMonthlyPrice)
    : Number(activePlan.monthlyPrice);

  const vatRate = await getVatRate();
  const { total } = withVat(baseAmount, vatRate);

  // 5) Generate invoice number first so we can reference it in PayPlus more_info.
  const invoiceNumber = await generateInvoiceNumber(product.invoicePrefix);

  // 6) Charge via PayPlus.
  const charge = await chargeWithToken({
    tokenUid: paymentMethod.payplusTokenUid,
    customerUid: paymentMethod.payplusCustomerUid ?? undefined,
    amount: total,
    description: `${product.name} - ${activePlan.name}`,
    invoiceItems: [
      {
        name: `${product.name} - ${activePlan.name}`,
        quantity: 1,
        price: total,
      },
    ],
    moreInfo: {
      type: "subscription_renewal",
      subscriptionId: sub.id,
      invoiceNumber,
    },
  });

  if (!charge.success) {
    const failedCount = (sub.failedChargeCount ?? 0) + 1;
    const isFirstFailure = !sub.dunningStartedAt;
    await db
      .update(subscriptions)
      .set({
        status: "past_due",
        failedChargeCount: failedCount,
        lastFailedChargeAt: new Date(),
        lastFailedChargeError: charge.errorMessage ?? "unknown",
        ...(isFirstFailure ? { dunningStartedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id));

    await emitWebhook({
      productId: product.id,
      eventType: "charge.failed",
      payload: {
        subscription_id: sub.id,
        customer_id: customer.id,
        attempt: failedCount,
        error_code: charge.errorCode,
        error_message: charge.errorMessage,
      },
    });
    if (isFirstFailure) {
      await emitWebhook({
        productId: product.id,
        eventType: "charge.dunning_started",
        payload: {
          subscription_id: sub.id,
          customer_id: customer.id,
        },
      });
    }

    return {
      ok: false,
      reason: "charge_failed",
      error: charge.errorMessage,
    };
  }

  // PayPlus delivers invoice metadata two ways:
  //   1) inline on the Charge response (`response.data.invoice`) — sometimes
  //   2) async via the IPN webhook → handled in /api/webhooks/payplus (PATH B)
  // We persist whatever the Charge response gave us; the IPN backfills nulls.
  const docUuid = charge.invoiceUuid;
  const docUrl = charge.invoiceUrl;
  const docNumber = charge.invoiceNumber;

  // 8) Persist invoice + items + charge attempt + advance period.
  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  if (sub.billingInterval === "yearly") {
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 12);
  } else {
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  }

  return db.transaction(async (tx) => {
    const [inv] = await tx
      .insert(invoices)
      .values({
        customerId: customer.id,
        productId: product.id,
        subscriptionId: sub.id,
        type: "subscription",
        status: "paid",
        invoiceNumber,
        payplusInvoiceUuid: docUuid,
        payplusInvoiceNumber: docNumber,
        payplusInvoiceUrl: docUrl,
        payplusTransactionUid: charge.transactionUid,
        subtotal: baseAmount.toFixed(2),
        vatAmount: (total - baseAmount).toFixed(2),
        totalAmount: total.toFixed(2),
        vatRate: vatRate.toFixed(4),
        currency: "ILS",
        periodStart: periodStart.toISOString().slice(0, 10),
        periodEnd: periodEnd.toISOString().slice(0, 10),
        description: `${product.name} - ${activePlan.name}`,
        chargeAttempts: 1,
        issuedAt: new Date(),
        paidAt: new Date(),
      })
      .returning();

    await tx.insert(invoiceItems).values({
      invoiceId: inv.id,
      description: `${product.name} - ${activePlan.name}`,
      quantity: 1,
      unitPrice: baseAmount.toFixed(2),
      totalPrice: baseAmount.toFixed(2),
      referenceType: "subscription",
      referenceId: activePlan.id,
    });

    await tx.insert(charges).values({
      invoiceId: inv.id,
      attemptNumber: 1,
      status: "success",
      payplusResponse: charge.raw as object,
      payplusTransactionUid: charge.transactionUid,
      attemptedAt: new Date(),
    });

    const wasRecovered = sub.status === "past_due";

    // Fixed-term plans: this charge counts towards the total. When it's the
    // last installment, mark the subscription expired so it isn't picked up
    // again on the next cron tick.
    const newPaymentsCharged = (sub.paymentsCharged ?? 0) + 1;
    const isFinalInstallment =
      sub.totalPayments != null && newPaymentsCharged >= sub.totalPayments;

    await tx
      .update(subscriptions)
      .set({
        status: isFinalInstallment ? "expired" : "active",
        planId: activePlan.id,
        pendingPlanId: null,
        currentPeriodStart: periodStart.toISOString().slice(0, 10),
        currentPeriodEnd: periodEnd.toISOString().slice(0, 10),
        paymentsCharged: newPaymentsCharged,
        failedChargeCount: 0,
        dunningStartedAt: null,
        lastFailedChargeAt: null,
        lastFailedChargeError: null,
        ...(isFinalInstallment ? { cancelledAt: new Date(), cancellationReason: "term_completed" } : {}),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id));

    // Emit webhooks AFTER tx commits — but emitWebhook only enqueues, so safe to call here.
    await emitWebhook({
      productId: product.id,
      eventType: "invoice.paid",
      payload: {
        invoice_id: inv.id,
        invoice_number: inv.invoiceNumber,
        invoice_url: inv.payplusInvoiceUrl,
        subscription_id: sub.id,
        customer_id: customer.id,
        amount: inv.totalAmount,
        currency: inv.currency,
        period_start: inv.periodStart,
        period_end: inv.periodEnd,
      },
    });
    if (wasRecovered) {
      await emitWebhook({
        productId: product.id,
        eventType: "charge.recovered",
        payload: {
          subscription_id: sub.id,
          customer_id: customer.id,
          invoice_id: inv.id,
        },
      });
    }
    if (sub.planId !== activePlan.id) {
      await emitWebhook({
        productId: product.id,
        eventType: "subscription.updated",
        payload: {
          subscription_id: sub.id,
          customer_id: customer.id,
          previous_plan_id: sub.planId,
          new_plan_id: activePlan.id,
        },
      });
    }

    return { ok: true, invoiceId: inv.id, invoiceNumber };
  });
}
