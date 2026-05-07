import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withProductAuth } from "@/lib/auth/handler";
import { db } from "@/lib/db/client";
import { customers, invoices } from "@/lib/db/schema";
import {
  refundTransaction,
  findRefundDocument,
} from "@/lib/payplus/transactions";
import { emitWebhook } from "@/lib/webhooks/delivery";

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
    // PayPlus's `initial_invoice` defaults to `false` on RefundByTransactionUID,
    // which skips the credit-note document. We explicitly opt in so an
    // inv_refund document is generated and emailed to the customer, and
    // can later be pulled via /PaymentPages/ipn-full for the URL.
    initialInvoice: true,
  });

  if (!result.success) {
    return {
      status: 502,
      body: { error: "PAYPLUS_REFUND_FAILED", message: result.errorMessage },
    };
  }

  // Look up the credit-note (inv_refund) document. PayPlus refund UIDs
  // aren't recognized by /PaymentPages/ipn-full or Transactions/View, so
  // we search the documents API by customer + amount + today's date.
  // Best-effort: PayPlus may not have issued the doc yet (up to ~120s
  // delay) — the backfill cron picks it up later.
  let refundDoc: Awaited<ReturnType<typeof findRefundDocument>> = { found: false };
  if (refundAmount && inv.customerId) {
    const [cust] = await db
      .select({ payplusCustomerUid: customers.payplusCustomerUid })
      .from(customers)
      .where(eq(customers.id, inv.customerId))
      .limit(1);
    if (cust?.payplusCustomerUid) {
      refundDoc = await findRefundDocument({
        customerUid: cust.payplusCustomerUid,
        amount: refundAmount,
      });
    }
  }

  const [updated] = await db
    .update(invoices)
    .set({
      status: "refunded",
      refundedAt: new Date(),
      payplusRefundTransactionUid: result.refundUid,
      payplusRefundInvoiceUuid: refundDoc.uuid,
      payplusRefundInvoiceNumber: refundDoc.number,
      payplusRefundInvoiceUrl: refundDoc.url,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, inv.id))
    .returning();

  await emitWebhook({
    productId: ctx.product.id,
    eventType: "invoice.refunded",
    payload: {
      invoice_id: updated.id,
      invoice_number: updated.invoiceNumber,
      customer_id: updated.customerId,
      subscription_id: updated.subscriptionId,
      amount: refundAmount,
      payplus_refund_uid: result.refundUid,
      reason: parsed.data.reason,
    },
  });

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
