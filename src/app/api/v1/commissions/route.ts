import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withProductAuth } from "@/lib/auth/handler";
import { db } from "@/lib/db/client";
import { commissionCharges, customers, subscriptions } from "@/lib/db/schema";

const schema = z.object({
  customer_id: z.string().uuid(),
  subscription_id: z.string().uuid().optional(),
  source_external_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  amount: z.number().positive(),
  fee_rate: z.number().positive().max(1).optional(),
  period_start: z.string().date(),
  period_end: z.string().date(),
});

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

  let subscriptionId: string | undefined = data.subscription_id;
  let feeRate = data.fee_rate;

  if (subscriptionId) {
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1);
    if (!sub || sub.customerId !== customer.id || sub.productId !== ctx.product.id) {
      return { status: 400, body: { error: "INVALID_SUBSCRIPTION" } };
    }
    feeRate ??= sub.customFeePercentage
      ? Number(sub.customFeePercentage)
      : ctx.product.defaultFeePercentage
        ? Number(ctx.product.defaultFeePercentage)
        : undefined;
  }
  feeRate ??= ctx.product.defaultFeePercentage
    ? Number(ctx.product.defaultFeePercentage)
    : undefined;

  if (!feeRate) {
    return {
      status: 400,
      body: {
        error: "MISSING_FEE_RATE",
        message: "fee_rate not provided and product has no default_fee_percentage",
      },
    };
  }

  const baseAmount = Math.round(data.amount * feeRate * 100) / 100;

  try {
    const [created] = await db
      .insert(commissionCharges)
      .values({
        customerId: customer.id,
        productId: ctx.product.id,
        subscriptionId,
        sourceExternalId: data.source_external_id,
        idempotencyKey: data.idempotency_key,
        amount: data.amount.toFixed(2),
        feeRate: feeRate.toFixed(4),
        baseAmount: baseAmount.toFixed(2),
        periodStart: data.period_start,
        periodEnd: data.period_end,
        status: "pending",
      })
      .returning();

    return {
      status: 201,
      body: {
        id: created.id,
        amount: created.amount,
        fee_rate: created.feeRate,
        base_amount: created.baseAmount,
        status: created.status,
        period_start: created.periodStart,
        period_end: created.periodEnd,
      },
    };
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      const [existing] = await db
        .select()
        .from(commissionCharges)
        .where(
          and(
            eq(commissionCharges.idempotencyKey, data.idempotency_key),
            eq(commissionCharges.productId, ctx.product.id),
          ),
        )
        .limit(1);
      if (existing) {
        return {
          status: 200,
          body: {
            id: existing.id,
            amount: existing.amount,
            fee_rate: existing.feeRate,
            base_amount: existing.baseAmount,
            status: existing.status,
            period_start: existing.periodStart,
            period_end: existing.periodEnd,
            duplicate: true,
          },
        };
      }
    }
    throw err;
  }
});
