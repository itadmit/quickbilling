import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { withProductAuth } from "@/lib/auth/handler";
import { db } from "@/lib/db/client";
import { invoices } from "@/lib/db/schema";

export const GET = withProductAuth(async (ctx) => {
  const sp = ctx.url.searchParams;
  const customerId = sp.get("customer_id");
  const status = sp.get("status");
  const type = sp.get("type");
  const from = sp.get("from");
  const to = sp.get("to");
  const limit = Math.min(Number(sp.get("limit") ?? 50), 200);
  const offset = Math.max(Number(sp.get("offset") ?? 0), 0);

  const conds: SQL[] = [eq(invoices.productId, ctx.product.id)];
  if (customerId) conds.push(eq(invoices.customerId, customerId));
  if (
    status &&
    ["draft", "pending", "paid", "failed", "cancelled", "refunded"].includes(status)
  ) {
    conds.push(eq(invoices.status, status as never));
  }
  if (type && ["subscription", "addon", "commission", "manual"].includes(type)) {
    conds.push(eq(invoices.type, type as never));
  }
  if (from) conds.push(gte(invoices.createdAt, new Date(from)));
  if (to) conds.push(lte(invoices.createdAt, new Date(to)));

  const rows = await db
    .select()
    .from(invoices)
    .where(and(...conds))
    .orderBy(desc(invoices.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    status: 200,
    body: {
      results: rows.map((r) => ({
        id: r.id,
        customer_id: r.customerId,
        subscription_id: r.subscriptionId,
        type: r.type,
        status: r.status,
        invoice_number: r.invoiceNumber,
        payplus_invoice_url: r.payplusInvoiceUrl,
        payplus_invoice_number: r.payplusInvoiceNumber,
        subtotal: r.subtotal,
        vat_amount: r.vatAmount,
        total_amount: r.totalAmount,
        currency: r.currency,
        period_start: r.periodStart,
        period_end: r.periodEnd,
        paid_at: r.paidAt,
        created_at: r.createdAt,
      })),
      limit,
      offset,
    },
  };
});
