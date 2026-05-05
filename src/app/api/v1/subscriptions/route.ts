import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withProductAuth } from "@/lib/auth/handler";
import { db } from "@/lib/db/client";
import {
  customers,
  paymentMethods,
  plans,
  subscriptions,
  type Subscription,
} from "@/lib/db/schema";
import { emitWebhook } from "@/lib/webhooks/delivery";

const schema = z.object({
  customer_id: z.string().uuid(),
  plan_code: z.string().min(1),
  billing_interval: z.enum(["monthly", "yearly"]).default("monthly"),
  trial_days: z.number().int().min(0).optional(),
  custom_monthly_price: z.number().positive().optional(),
  custom_fee_percentage: z.number().positive().max(1).optional(),
  payment_method_id: z.string().uuid().optional(),
  start_date: z.string().optional(),
  total_payments: z.number().int().positive().optional(),
});

function serialize(s: Subscription) {
  return {
    id: s.id,
    customer_id: s.customerId,
    product_id: s.productId,
    plan_id: s.planId,
    status: s.status,
    billing_interval: s.billingInterval,
    billing_start_date: s.billingStartDate,
    current_period_start: s.currentPeriodStart,
    current_period_end: s.currentPeriodEnd,
    trial_ends_at: s.trialEndsAt,
    custom_monthly_price: s.customMonthlyPrice,
    custom_fee_percentage: s.customFeePercentage,
    payment_method_id: s.paymentMethodId,
    cancel_at_period_end: s.cancelAtPeriodEnd,
    pending_plan_id: s.pendingPlanId,
    total_payments: s.totalPayments,
    payments_charged: s.paymentsCharged,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export const POST = withProductAuth(async (ctx) => {
  const parsed = schema.safeParse(ctx.parsedBody);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "VALIDATION_ERROR", details: parsed.error.issues },
    };
  }
  const data = parsed.data;

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, data.customer_id))
    .limit(1);
  if (!customer) {
    return { status: 404, body: { error: "CUSTOMER_NOT_FOUND" } };
  }

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
      body: { error: "PLAN_NOT_FOUND", message: `No plan '${data.plan_code}' for this product` },
    };
  }

  if (data.payment_method_id) {
    const [pm] = await db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.id, data.payment_method_id))
      .limit(1);
    if (!pm || pm.customerId !== customer.id) {
      return {
        status: 400,
        body: {
          error: "INVALID_PAYMENT_METHOD",
          message: "Payment method does not belong to this customer",
        },
      };
    }
  }

  const trialDays =
    data.trial_days ?? plan.trialDays ?? ctx.product.defaultTrialDays;
  const startDate = data.start_date ? new Date(data.start_date) : new Date();
  const isTrial = trialDays > 0;
  const trialEndsAt = isTrial
    ? new Date(startDate.getTime() + trialDays * 86400000)
    : null;

  const periodEnd =
    data.billing_interval === "yearly"
      ? addMonths(isTrial ? trialEndsAt! : startDate, 12)
      : addMonths(isTrial ? trialEndsAt! : startDate, 1);

  const [created] = await db
    .insert(subscriptions)
    .values({
      customerId: customer.id,
      productId: ctx.product.id,
      planId: plan.id,
      status: isTrial ? "trial" : "active",
      billingInterval: data.billing_interval,
      billingStartDate: startDate.toISOString().slice(0, 10),
      currentPeriodStart: startDate.toISOString().slice(0, 10),
      currentPeriodEnd: periodEnd.toISOString().slice(0, 10),
      trialEndsAt,
      customMonthlyPrice: data.custom_monthly_price?.toFixed(2),
      customFeePercentage: data.custom_fee_percentage?.toFixed(4),
      paymentMethodId: data.payment_method_id,
      totalPayments: data.total_payments,
    })
    .returning();

  await emitWebhook({
    productId: ctx.product.id,
    eventType: "subscription.created",
    payload: {
      subscription_id: created.id,
      customer_id: customer.id,
      plan_id: plan.id,
      plan_code: plan.code,
      status: created.status,
      trial_ends_at: created.trialEndsAt,
      current_period_end: created.currentPeriodEnd,
    },
  });

  return {
    status: 201,
    body: serialize(created),
  };
});
