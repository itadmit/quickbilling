import { and, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { withCronAuth } from "@/lib/cron-handler";
import { db } from "@/lib/db/client";
import { invoices } from "@/lib/db/schema";
import { getInvoiceForTransaction } from "@/lib/payplus/transactions";

/**
 * Backfill payplus_invoice_url / payplus_invoice_uuid on invoices that
 * have a transaction_uid but no URL yet.
 *
 * Why: J4 charges create the document asynchronously on PayPlus's side.
 * The renewal pipeline retries inline for ~16s, but PayPlus sometimes
 * takes longer. This cron sweeps anything still missing.
 *
 * Bounded scope: only the last 7 days, only paid/refunded invoices.
 * Older rows are unlikely to ever resolve.
 */
export const POST = withCronAuth(async () => {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // ── Pass A: original invoice URL for charges ────────────────
  const chargeCandidates = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      transactionUid: invoices.payplusTransactionUid,
    })
    .from(invoices)
    .where(
      and(
        isNull(invoices.payplusInvoiceUrl),
        isNotNull(invoices.payplusTransactionUid),
        gte(invoices.createdAt, cutoff),
      ),
    )
    .limit(50);

  let chargeFilled = 0;
  for (const c of chargeCandidates) {
    if (!c.transactionUid) continue;
    const inv = await getInvoiceForTransaction(c.transactionUid, {
      retries: 0,
      delayMs: 0,
    });
    if (inv.invoiceUuid && inv.invoiceUrl) {
      await db
        .update(invoices)
        .set({
          payplusInvoiceUuid: inv.invoiceUuid,
          payplusInvoiceNumber: inv.invoiceNumber,
          payplusInvoiceUrl: inv.invoiceUrl,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, c.id));
      chargeFilled++;
    }
  }

  // ── Pass B: credit-note URL for refunds ────────────────────
  // Tighter window: refund credit-notes have so far never been
  // findable via /PaymentPages/ipn-full keyed on the refund_uid in
  // PayPlus dev (it returns "can-not-find-transaction_uid"). We still
  // try, in case PayPlus enables it for prod or backfills late, but
  // bound this to refunds in the last 24h to keep API noise low.
  const refundCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const refundCandidates = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      refundTransactionUid: invoices.payplusRefundTransactionUid,
    })
    .from(invoices)
    .where(
      and(
        isNull(invoices.payplusRefundInvoiceUrl),
        isNotNull(invoices.payplusRefundTransactionUid),
        gte(invoices.refundedAt, refundCutoff),
      ),
    )
    .limit(50);

  let refundFilled = 0;
  for (const c of refundCandidates) {
    if (!c.refundTransactionUid) continue;
    const inv = await getInvoiceForTransaction(c.refundTransactionUid, {
      retries: 0,
      delayMs: 0,
    });
    if (inv.invoiceUuid && inv.invoiceUrl) {
      await db
        .update(invoices)
        .set({
          payplusRefundInvoiceUuid: inv.invoiceUuid,
          payplusRefundInvoiceNumber: inv.invoiceNumber,
          payplusRefundInvoiceUrl: inv.invoiceUrl,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, c.id));
      refundFilled++;
    }
  }

  return {
    chargeScanned: chargeCandidates.length,
    chargeFilled,
    refundScanned: refundCandidates.length,
    refundFilled,
  };
});
