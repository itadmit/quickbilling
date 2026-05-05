import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withProductAuth } from "@/lib/auth/handler";
import { db } from "@/lib/db/client";
import { subscriptions } from "@/lib/db/schema";
import { emitWebhook } from "@/lib/webhooks/delivery";

const schema = z.object({
  reason: z.string().optional(),
  /** When true (default): cancel at end of current period. False = cancel immediately. */
  at_period_end: z.boolean().default(true),
});

export const POST = withProductAuth(async (ctx, params) => {
  const parsed = schema.safeParse(ctx.parsedBody ?? {});
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "VALIDATION_ERROR", details: parsed.error.issues },
    };
  }

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(eq(subscriptions.id, params.id), eq(subscriptions.productId, ctx.product.id)),
    )
    .limit(1);
  if (!sub) return { status: 404, body: { error: "NOT_FOUND" } };

  if (sub.status === "cancelled" || sub.status === "expired") {
    return {
      status: 200,
      body: { id: sub.id, status: sub.status, already_cancelled: true },
    };
  }

  const updates: Partial<typeof subscriptions.$inferInsert> = {
    cancellationReason: parsed.data.reason,
  };
  if (parsed.data.at_period_end) {
    updates.cancelAtPeriodEnd = true;
  } else {
    updates.status = "cancelled";
    updates.cancelledAt = new Date();
  }

  const [updated] = await db
    .update(subscriptions)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(subscriptions.id, params.id))
    .returning();

  // Only emit when actually cancelled (not when scheduling cancel_at_period_end)
  if (updated.status === "cancelled") {
    await emitWebhook({
      productId: ctx.product.id,
      eventType: "subscription.cancelled",
      payload: {
        subscription_id: updated.id,
        customer_id: updated.customerId,
        reason: parsed.data.reason,
        cancelled_by: "product_api",
      },
    });
  }

  return {
    status: 200,
    body: {
      id: updated.id,
      status: updated.status,
      cancel_at_period_end: updated.cancelAtPeriodEnd,
      cancelled_at: updated.cancelledAt,
      current_period_end: updated.currentPeriodEnd,
    },
  };
});
