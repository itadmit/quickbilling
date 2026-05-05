import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withProductAuth } from "@/lib/auth/handler";
import { db } from "@/lib/db/client";
import { invoices } from "@/lib/db/schema";
import { refundTransaction } from "@/lib/payplus/transactions";

const schema = z.object({
  amount: z.number().positive().optional(),
  reason: z.string().max(500).optional(),
});

export const POST = withProductAuth(async (ctx, params) => {
  const parsed = schema.safeParse(ctx.parsedBody ?? {});
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "VALIDATION_ERROR", details: parsed.error.issues },
    };
  }

  const [inv] = await db
    .select()
    .from(invoices)
    .where(
      and(eq(invoices.id, params.id), eq(invoices.productId, ctx.product.id)),
    )
    .limit(1);

  if (!inv) {
    return { status: 404, body: { error: "NOT_FOUND" } };
  }

  if (!inv.payplusTransactionUid) {
    return {
      status: 400,
      body: { error: "NO_TRANSACTION", message: "Invoice has no PayPlus transaction to refund" },
    };
  }

  if (inv.status === "refunded") {
    return {
      status: 200,
      body: { id: inv.id, status: inv.status, already_refunded: true },
    };
  }

  // RefundByTransactionUID requires `amount`. Default to the full invoice total
  // unless the caller passed a partial amount.
  const refundAmount = parsed.data.amount ?? Number(inv.totalAmount);

  const result = await refundTransaction({
    transactionUid: inv.payplusTransactionUid,
    amount: refundAmount,
    reason: parsed.data.reason,
  });

  if (!result.success) {
    return {
      status: 502,
      body: { error: "PAYPLUS_REFUND_FAILED", message: result.errorMessage },
    };
  }

  const [updated] = await db
    .update(invoices)
    .set({
      status: "refunded",
      refundedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, inv.id))
    .returning();

  return {
    status: 200,
    body: {
      id: updated.id,
      status: updated.status,
      refund_uid: result.refundUid,
      refunded_at: updated.refundedAt,
    },
  };
});
