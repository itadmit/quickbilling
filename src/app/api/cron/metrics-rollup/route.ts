import { and, eq, gte, sql } from "drizzle-orm";
import { withCronAuth } from "@/lib/cron-handler";
import { db } from "@/lib/db/client";
import { invoices, subscriptions, plans, products } from "@/lib/db/schema";
import { updateSetting } from "@/lib/settings";

/**
 * Rolls up MRR / ARR / churn / failed-charges metrics per product and stores
 * them in platform_settings under key 'metrics_rollup_v1'. Cheap to run
 * daily; the dashboard reads the cached snapshot.
 */
export const POST = withCronAuth(async () => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const productRows = await db.select().from(products).where(eq(products.active, true));

  const perProduct = await Promise.all(
    productRows.map(async (p) => {
      const [active] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.productId, p.id),
            eq(subscriptions.status, "active"),
          ),
        );

      const [trial] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.productId, p.id),
            eq(subscriptions.status, "trial"),
          ),
        );

      const [pastDue] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.productId, p.id),
            eq(subscriptions.status, "past_due"),
          ),
        );

      // MRR = sum(plan.monthly_price OR custom_monthly_price) for active subs
      const [mrr] = await db
        .select({
          mrr: sql<string>`COALESCE(SUM(COALESCE(${subscriptions.customMonthlyPrice}, ${plans.monthlyPrice})), 0)::text`,
        })
        .from(subscriptions)
        .innerJoin(plans, eq(subscriptions.planId, plans.id))
        .where(
          and(
            eq(subscriptions.productId, p.id),
            eq(subscriptions.status, "active"),
          ),
        );

      const [revMonth] = await db
        .select({
          revenue: sql<string>`COALESCE(SUM(${invoices.totalAmount}), 0)::text`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.productId, p.id),
            eq(invoices.status, "paid"),
            gte(invoices.paidAt, monthStart),
          ),
        );

      return {
        product_id: p.id,
        product_slug: p.slug,
        active_count: active.count,
        trial_count: trial.count,
        past_due_count: pastDue.count,
        mrr: parseFloat(mrr.mrr),
        arr: parseFloat(mrr.mrr) * 12,
        revenue_this_month: parseFloat(revMonth.revenue),
      };
    }),
  );

  const totalMrr = perProduct.reduce((s, p) => s + p.mrr, 0);
  const totalActive = perProduct.reduce((s, p) => s + p.active_count, 0);

  const snapshot = {
    generated_at: now.toISOString(),
    total: {
      mrr: totalMrr,
      arr: totalMrr * 12,
      active_subscriptions: totalActive,
    },
    per_product: perProduct,
  };

  await updateSetting("metrics_rollup_v1", snapshot, {
    category: "metrics",
    description: "Daily MRR/ARR/churn snapshot per product",
  });

  return snapshot;
});

export const GET = POST;
