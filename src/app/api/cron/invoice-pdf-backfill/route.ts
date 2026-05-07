import { and, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { withCronAuth } from "@/lib/cron-handler";
import { db } from "@/lib/db/client";
import { customers, invoices } from "@/lib/db/schema";
import {
  findRefundDocument,
  getInvoiceForTransaction,
} from "@/lib/payplus/transactions";

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
  // PayPlus refund UIDs aren't recognized by /PaymentPages/ipn-full,
  // so we use /books/docs/list (search) keyed on customer_uid +
  // amount + date. Bounded to the last 24h of refunds to keep API
  // noise low.
  const refundCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const refundCandidates = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      totalAmount: invoices.totalAmount,
      refundedAt: invoices.refundedAt,
      payplusCustomerUid: customers.payplusCustomerUid,
    })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .where(
      and(
        isNull(invoices.payplusRefundInvoiceUrl),
        isNotNull(invoices.payplusRefundTransactionUid),
        isNotNull(customers.payplusCustomerUid),
        gte(invoices.refundedAt, refundCutoff),
      ),
    )
    .limit(50);

  let refundFilled = 0;
  for (const c of refundCandidates) {
    if (!c.payplusCustomerUid || !c.refundedAt) continue;
    const fromDate = c.refundedAt.toISOString().slice(0, 10);
    const found = await findRefundDocument({
      customerUid: c.payplusCustomerUid,
      amount: Number(c.totalAmount),
      fromDate,
    });
    if (found.found && found.uuid && found.url) {
      await db
        .update(invoices)
        .set({
          payplusRefundInvoiceUuid: found.uuid,
          payplusRefundInvoiceNumber: found.number,
          payplusRefundInvoiceUrl: found.url,
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
