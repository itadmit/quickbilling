import { and, eq, isNull, lte } from "drizzle-orm";
import { db } from "../db/client";
import { subscriptions } from "../db/schema";

/**
 * Process trials that have ended.
 *  - If trial subscription has no payment_method_id → cancel immediately (per spec).
 *  - If trial subscription has a payment_method_id → graduate to active and
 *    let the daily-billing-run handle the first charge tomorrow.
 *    (Current period extends to trial end, so next renewal happens then.)
 */
export async function expireDueTrials(): Promise<{
  total: number;
  graduated: number;
  cancelled: number;
}> {
  const now = new Date();

  const trials = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "trial"),
        lte(subscriptions.trialEndsAt, now),
      ),
    );

  let graduated = 0;
  let cancelled = 0;

  for (const sub of trials) {
    if (!sub.paymentMethodId) {
      await db
        .update(subscriptions)
        .set({
          status: "cancelled",
          cancelledAt: now,
          cancellationReason: "trial expired without payment method",
          updatedAt: now,
        })
        .where(eq(subscriptions.id, sub.id));
      cancelled++;
    } else {
      // Graduate trial → active. Period_end becomes "today" so the next
      // daily-billing-run picks it up for the first real charge.
      await db
        .update(subscriptions)
        .set({
          status: "active",
          currentPeriodEnd: now.toISOString().slice(0, 10),
          updatedAt: now,
        })
        .where(eq(subscriptions.id, sub.id));
      graduated++;
    }
  }

  return {
    total: trials.length,
    graduated,
    cancelled,
  };
}

/** Trials that end in N days — for "trial ending soon" reminder emails. */
export async function getTrialsEndingIn(days: number) {
  const target = new Date();
  target.setDate(target.getDate() + days);
  const dayStart = new Date(target);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(target);
  dayEnd.setHours(23, 59, 59, 999);

  return db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "trial"),
        lte(subscriptions.trialEndsAt, dayEnd),
        isNull(subscriptions.cancelledAt),
      ),
    );
}
