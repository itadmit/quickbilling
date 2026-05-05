import { withCronAuth } from "@/lib/cron-handler";
import {
  getSubscriptionsDueForRenewal,
  renewSubscription,
} from "@/lib/billing/renewal";

export const POST = withCronAuth(async () => {
  const due = await getSubscriptionsDueForRenewal();

  let succeeded = 0;
  let failed = 0;
  let cancelled = 0;
  let skipped = 0;
  const errors: Array<{ subscriptionId: string; reason: string; error?: string }> = [];

  for (const row of due) {
    const result = await renewSubscription(row);
    if (result.ok) {
      succeeded++;
    } else if (result.reason === "cancelled") {
      cancelled++;
    } else if (result.reason === "no_payment_method") {
      skipped++;
      errors.push({
        subscriptionId: row.subscription.id,
        reason: result.reason,
      });
    } else {
      failed++;
      errors.push({
        subscriptionId: row.subscription.id,
        reason: result.reason,
        error: result.error,
      });
    }
  }

  return {
    total: due.length,
    succeeded,
    failed,
    cancelled,
    skipped,
    errors: errors.slice(0, 50),
  };
});

export const GET = POST;
