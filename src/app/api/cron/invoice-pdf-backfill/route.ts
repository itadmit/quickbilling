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

  const candidates = await db
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

  let filled = 0;
  let stillMissing = 0;
  const examples: Array<{ invoice: string; ok: boolean }> = [];

  for (const c of candidates) {
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
      filled++;
      examples.push({ invoice: c.invoiceNumber, ok: true });
    } else {
      stillMissing++;
      examples.push({ invoice: c.invoiceNumber, ok: false });
    }
  }

  return {
    scanned: candidates.length,
    filled,
    stillMissing,
    examples: examples.slice(0, 5),
  };
});
