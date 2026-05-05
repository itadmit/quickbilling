import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withProductAuth } from "@/lib/auth/handler";
import { db } from "@/lib/db/client";
import {
  paymentMethods,
  plans,
  subscriptions,
  type Subscription,
} from "@/lib/db/schema";

function serialize(s: Subscription) {
  return {
    id: s.id,
    customer_id: s.customerId,
    product_id: s.productId,
    plan_id: s.planId,
    pending_plan_id: s.pendingPlanId,
    status: s.status,
    billing_interval: s.billingInterval,
    current_period_start: s.currentPeriodStart,
    current_period_end: s.currentPeriodEnd,
    trial_ends_at: s.trialEndsAt,
    custom_monthly_price: s.customMonthlyPrice,
    custom_fee_percentage: s.customFeePercentage,
    payment_method_id: s.paymentMethodId,
    cancel_at_period_end: s.cancelAtPeriodEnd,
    cancelled_at: s.cancelledAt,
    cancellation_reason: s.cancellationReason,
    failed_charge_count: s.failedChargeCount,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

export const GET = withProductAuth(async (ctx, params) => {
  const [s] = await db
    .select()
    .from(subscriptions)
    .where(
      and(eq(subscriptions.id, params.id), eq(subscriptions.productId, ctx.product.id)),
    )
    .limit(1);
  if (!s) return { status: 404, body: { error: "NOT_FOUND" } };
  return { status: 200, body: serialize(s) };
});

const patchSchema = z.object({
  plan_code: z.string().optional(),
  payment_method_id: z.string().uuid().optional(),
  custom_monthly_price: z.number().positive().nullable().optional(),
  custom_fee_percentage: z.number().positive().max(1).nullable().optional(),
});

export const PATCH = withProductAuth(async (ctx, params) => {
  const parsed = patchSchema.safeParse(ctx.parsedBody);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "VALIDATION_ERROR", details: parsed.error.issues },
    };
  }
  const data = parsed.data;

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(eq(subscriptions.id, params.id), eq(subscriptions.productId, ctx.product.id)),
    )
    .limit(1);
  if (!sub) return { status: 404, body: { error: "NOT_FOUND" } };

  const updates: Partial<typeof subscriptions.$inferInsert> = {};

  // Plan change → schedule for end of period (per spec: no proration).
  if (data.plan_code) {
    const [plan] = await db
      .select()
      .from(plans)
      .where(
        and(eq(plans.productId, ctx.product.id), eq(plans.code, data.plan_code)),
      )
      .limit(1);
    if (!plan) {
      return {
        status: 404,
        body: { error: "PLAN_NOT_FOUND" },
      };
    }
    if (plan.id !== sub.planId) {
      updates.pendingPlanId = plan.id;
    }
  }

  if (data.payment_method_id !== undefined) {
    const [pm] = await db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.id, data.payment_method_id))
      .limit(1);
    if (!pm || pm.customerId !== sub.customerId) {
      return {
        status: 400,
        body: { error: "INVALID_PAYMENT_METHOD" },
      };
    }
    updates.paymentMethodId = data.payment_method_id;
  }

  if (data.custom_monthly_price !== undefined) {
    updates.customMonthlyPrice =
      data.custom_monthly_price === null
        ? null
        : data.custom_monthly_price.toFixed(2);
  }
  if (data.custom_fee_percentage !== undefined) {
    updates.customFeePercentage =
      data.custom_fee_percentage === null
        ? null
        : data.custom_fee_percentage.toFixed(4);
  }

  if (Object.keys(updates).length === 0) {
    return { status: 400, body: { error: "NOTHING_TO_UPDATE" } };
  }

  const [updated] = await db
    .update(subscriptions)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(subscriptions.id, params.id))
    .returning();

  return { status: 200, body: serialize(updated) };
});
