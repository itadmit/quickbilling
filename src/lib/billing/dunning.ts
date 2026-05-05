import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  subscriptions,
  customers,
  plans,
  paymentMethods,
  products,
  type Subscription,
  type Product,
} from "../db/schema";
import { renewSubscription, type RenewalRow } from "./renewal";
import { getDunningIntervals, getMaxDunningAttempts } from "../settings";
import { emitWebhook } from "../webhooks/delivery";
import {
  sendDunningEmail,
  sendSubscriptionCancelledEmail,
} from "../email/templates/dunning";

export interface DunningCandidate extends RenewalRow {
  daysSinceFirstFailure: number;
  attemptNumber: number;
}

/** Whether enough time has passed since the last failure to retry now. */
export async function isDueForRetry(
  failedChargeCount: number,
  lastFailedAt: Date | null,
): Promise<boolean> {
  if (!lastFailedAt || failedChargeCount === 0) return false;
  const intervals = await getDunningIntervals();
  const idx = Math.min(failedChargeCount - 1, intervals.length - 1);
  const requiredDelayDays = intervals[idx];
  const elapsedDays =
    (Date.now() - lastFailedAt.getTime()) / (1000 * 60 * 60 * 24);
  return elapsedDays >= requiredDelayDays;
}

export async function getSubscriptionsDueForDunning(): Promise<
  DunningCandidate[]
> {
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
    .where(and(inArray(subscriptions.status, ["past_due"])));

  const candidates: DunningCandidate[] = [];
  for (const r of rows) {
    if (await isDueForRetry(r.sub.failedChargeCount, r.sub.lastFailedChargeAt)) {
      const days = r.sub.dunningStartedAt
        ? Math.floor(
            (Date.now() - r.sub.dunningStartedAt.getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : 0;
      candidates.push({
        subscription: r.sub,
        customer: r.customer,
        plan: r.plan,
        paymentMethod: r.pm,
        product: r.product,
        daysSinceFirstFailure: days,
        attemptNumber: r.sub.failedChargeCount + 1,
      });
    }
  }
  return candidates;
}

export interface DunningRunResult {
  total: number;
  recovered: number;
  retriedFailed: number;
  cancelled: number;
  emailsSent: number;
}

/**
 * Process all past_due subscriptions whose retry window has arrived.
 * - Retries the charge.
 * - On final failure (max attempts), cancels and emails the customer.
 * - On retry failure (not last), emails the customer with how many tries left.
 * - On success, no email (success email is the invoice PDF).
 */
export async function runDunning(): Promise<DunningRunResult> {
  const candidates = await getSubscriptionsDueForDunning();
  const max = await getMaxDunningAttempts();
  const intervals = await getDunningIntervals();

  let recovered = 0;
  let retriedFailed = 0;
  let cancelled = 0;
  let emailsSent = 0;

  for (const c of candidates) {
    if (c.attemptNumber > max) {
      await cancelDueToDunning(c, "dunning exhausted");
      cancelled++;
      emailsSent++;
      continue;
    }

    const result = await renewSubscription(c);

    if (result.ok) {
      recovered++;
      continue;
    }

    if (result.reason === "charge_failed") {
      retriedFailed++;

      // Re-read the failed count after the renewal pipeline incremented it.
      const [latest] = await db
        .select({ count: subscriptions.failedChargeCount })
        .from(subscriptions)
        .where(eq(subscriptions.id, c.subscription.id))
        .limit(1);
      const newCount = latest?.count ?? c.attemptNumber;

      if (newCount >= max) {
        await cancelDueToDunning(c, "dunning exhausted");
        cancelled++;
        emailsSent++;
        continue;
      }

      // Send "still trying" email — how many days until next attempt and total cancel.
      const nextDelay = intervals[Math.min(newCount, intervals.length - 1)] ?? 7;
      const daysUntilCancellation = Math.max(
        0,
        intervals.slice(newCount).reduce((s, n) => s + n, 0),
      );

      try {
        await sendDunningEmail({
          to: c.customer.email,
          customerName: c.customer.name ?? c.customer.email,
          productName: c.product.name,
          attemptNumber: newCount,
          totalAttempts: max,
          daysUntilCancellation: daysUntilCancellation || nextDelay,
          errorMessage: result.error,
          updatePaymentUrl: paymentUpdateUrl(c.product, c.customer.email),
        });
        emailsSent++;
      } catch (err) {
        console.error("[dunning] email send failed:", err);
      }
    }
  }

  return {
    total: candidates.length,
    recovered,
    retriedFailed,
    cancelled,
    emailsSent,
  };
}

async function cancelDueToDunning(
  c: DunningCandidate,
  reason: string,
): Promise<void> {
  await markCancelled(c.subscription, reason);

  await emitWebhook({
    productId: c.product.id,
    eventType: "subscription.cancelled",
    payload: {
      subscription_id: c.subscription.id,
      customer_id: c.customer.id,
      reason,
      cancelled_by: "system_dunning",
    },
  });

  try {
    await sendSubscriptionCancelledEmail({
      to: c.customer.email,
      customerName: c.customer.name ?? c.customer.email,
      productName: c.product.name,
      reactivateUrl: reactivateUrl(c.product, c.customer.email),
    });
  } catch (err) {
    console.error("[dunning] cancellation email failed:", err);
  }
}

async function markCancelled(sub: Subscription, reason: string) {
  await db
    .update(subscriptions)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancellationReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, sub.id));
}

/**
 * Build a "update payment method" URL on the product's site.
 * Each product knows how to handle this — we just point them to base_url
 * and let them route. If base_url is missing, fall back to our domain.
 */
function paymentUpdateUrl(product: Product, email: string): string {
  const base =
    product.baseUrl?.replace(/\/$/, "") ??
    `${process.env.NEXT_PUBLIC_APP_URL}`;
  return `${base}/billing/update-card?email=${encodeURIComponent(email)}`;
}

function reactivateUrl(product: Product, email: string): string {
  const base =
    product.baseUrl?.replace(/\/$/, "") ??
    `${process.env.NEXT_PUBLIC_APP_URL}`;
  return `${base}/billing/reactivate?email=${encodeURIComponent(email)}`;
}
