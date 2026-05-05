import { and, eq, gt, gte, isNull, lt, lte } from "drizzle-orm";
import { db } from "../db/client";
import {
  customers,
  products,
  subscriptions,
  type Subscription,
  type Customer,
  type Product,
} from "../db/schema";
import { emitWebhook } from "../webhooks/delivery";
import {
  sendTrialCancelledEmail,
  sendTrialEndingSoonEmail,
} from "../email/templates/trial";

interface TrialRow {
  sub: Subscription;
  customer: Customer;
  product: Product;
}

/**
 * Process trials that have ended.
 *  - If trial subscription has no payment_method_id → cancel immediately + email.
 *  - If has payment_method_id → graduate to active and let daily-billing-run
 *    handle the first charge.
 */
export async function expireDueTrials(): Promise<{
  total: number;
  graduated: number;
  cancelled: number;
}> {
  const now = new Date();

  const trials = await db
    .select({ sub: subscriptions, customer: customers, product: products })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .innerJoin(products, eq(subscriptions.productId, products.id))
    .where(
      and(
        eq(subscriptions.status, "trial"),
        lte(subscriptions.trialEndsAt, now),
      ),
    );

  let graduated = 0;
  let cancelled = 0;

  for (const row of trials) {
    if (!row.sub.paymentMethodId) {
      await cancelTrial(row, now);
      cancelled++;
    } else {
      await graduateTrial(row, now);
      graduated++;
    }
  }

  return { total: trials.length, graduated, cancelled };
}

async function cancelTrial(row: TrialRow, now: Date): Promise<void> {
  await db
    .update(subscriptions)
    .set({
      status: "cancelled",
      cancelledAt: now,
      cancellationReason: "trial expired without payment method",
      updatedAt: now,
    })
    .where(eq(subscriptions.id, row.sub.id));

  await emitWebhook({
    productId: row.product.id,
    eventType: "subscription.cancelled",
    payload: {
      subscription_id: row.sub.id,
      customer_id: row.customer.id,
      reason: "trial_expired_no_payment_method",
      cancelled_by: "system_trial_expiry",
    },
  });

  try {
    await sendTrialCancelledEmail({
      to: row.customer.email,
      customerName: row.customer.name ?? row.customer.email,
      productName: row.product.name,
      reactivateUrl: `${row.product.baseUrl?.replace(/\/$/, "") ?? process.env.NEXT_PUBLIC_APP_URL}/billing/reactivate`,
    });
  } catch (err) {
    console.error("[trial-expiry] email failed:", err);
  }
}

async function graduateTrial(row: TrialRow, now: Date): Promise<void> {
  // Period_end becomes today so the next daily-billing-run picks it up
  // for the first real charge.
  await db
    .update(subscriptions)
    .set({
      status: "active",
      currentPeriodEnd: now.toISOString().slice(0, 10),
      updatedAt: now,
    })
    .where(eq(subscriptions.id, row.sub.id));

  await emitWebhook({
    productId: row.product.id,
    eventType: "subscription.updated",
    payload: {
      subscription_id: row.sub.id,
      customer_id: row.customer.id,
      previous_status: "trial",
      new_status: "active",
    },
  });
}

/**
 * Trials ending in N days (default 3). For "trial ending soon" reminder
 * emails. Idempotent: if you call it twice for the same day, the same
 * subs come back — caller should track which emails were already sent
 * (we use a `notified_trial_ending_at` style flag in the future).
 */
export async function getTrialsEndingIn(days: number) {
  const target = new Date();
  target.setUTCDate(target.getUTCDate() + days);
  const dayStart = new Date(target);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(target);
  dayEnd.setUTCHours(23, 59, 59, 999);

  return db
    .select({ sub: subscriptions, customer: customers, product: products })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .innerJoin(products, eq(subscriptions.productId, products.id))
    .where(
      and(
        eq(subscriptions.status, "trial"),
        gte(subscriptions.trialEndsAt, dayStart),
        lt(subscriptions.trialEndsAt, dayEnd),
        isNull(subscriptions.cancelledAt),
      ),
    );
}

/**
 * Send "trial ending in 3 days" reminders.
 * Returns how many emails were sent.
 */
export async function sendTrialEndingReminders(daysAhead = 3): Promise<{
  sent: number;
  failed: number;
}> {
  const rows = await getTrialsEndingIn(daysAhead);
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await sendTrialEndingSoonEmail({
        to: row.customer.email,
        customerName: row.customer.name ?? row.customer.email,
        productName: row.product.name,
        daysRemaining: daysAhead,
        hasPaymentMethod: !!row.sub.paymentMethodId,
        setupPaymentUrl: `${row.product.baseUrl?.replace(/\/$/, "") ?? process.env.NEXT_PUBLIC_APP_URL}/billing/setup`,
      });

      await emitWebhook({
        productId: row.product.id,
        eventType: "subscription.trial_will_end",
        payload: {
          subscription_id: row.sub.id,
          customer_id: row.customer.id,
          trial_ends_at: row.sub.trialEndsAt,
          days_remaining: daysAhead,
          has_payment_method: !!row.sub.paymentMethodId,
        },
      });

      sent++;
    } catch (err) {
      failed++;
      console.error("[trial-reminder] failed for", row.customer.email, err);
    }
  }

  return { sent, failed };
}

void gt; // re-exported for future use
