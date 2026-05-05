import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  subscriptions,
  customers,
  plans,
  paymentMethods,
  products,
  type Subscription,
} from "../db/schema";
import { renewSubscription, type RenewalRow } from "./renewal";
import { getDunningIntervals, getMaxDunningAttempts } from "../settings";

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
    .where(
      and(
        inArray(subscriptions.status, ["past_due"]),
      ),
    );

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
}

/**
 * Process all past_due subscriptions whose retry window has arrived.
 * On exhaustion of attempts, cancel the subscription.
 */
export async function runDunning(): Promise<DunningRunResult> {
  const candidates = await getSubscriptionsDueForDunning();
  const max = await getMaxDunningAttempts();
  let recovered = 0;
  let retriedFailed = 0;
  let cancelled = 0;

  for (const c of candidates) {
    if (c.attemptNumber > max) {
      await markCancelled(c.subscription, "dunning exhausted");
      cancelled++;
      continue;
    }

    const result = await renewSubscription(c);
    if (result.ok) {
      recovered++;
    } else if (result.reason === "charge_failed") {
      retriedFailed++;
      // After this retry the failedChargeCount has been incremented; if it
      // now exceeds max, cancel on the next pass (kept simple — single pass).
      const updated = await db
        .select({ count: subscriptions.failedChargeCount })
        .from(subscriptions)
        .where(eq(subscriptions.id, c.subscription.id))
        .limit(1);
      if (updated[0] && updated[0].count >= max) {
        await markCancelled(c.subscription, "dunning exhausted");
        cancelled++;
      }
    }
  }

  return {
    total: candidates.length,
    recovered,
    retriedFailed,
    cancelled,
  };
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
