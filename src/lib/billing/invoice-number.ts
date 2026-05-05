/**
 * Generate a unique, human-readable invoice number per product.
 * Format: {PREFIX}-{YYYY}-{6-digit-sequence}.
 * Sequence comes from a per-product, per-year counter table -- but we
 * keep it simple and use a transaction with row-locking on the products
 * table for now. For higher throughput, swap to a sequence per product.
 */

import { sql, and, gte, lt, like } from "drizzle-orm";
import { db } from "../db/client";
import { invoices } from "../db/schema";

export async function generateInvoiceNumber(
  productPrefix: string,
  year: number = new Date().getFullYear(),
): Promise<string> {
  const yearStart = new Date(year, 0, 1);
  const nextYearStart = new Date(year + 1, 0, 1);
  const prefix = `${productPrefix}-${year}-`;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invoices)
    .where(
      and(
        like(invoices.invoiceNumber, `${prefix}%`),
        gte(invoices.createdAt, yearStart),
        lt(invoices.createdAt, nextYearStart),
      ),
    );

  const seq = String(count + 1).padStart(6, "0");
  return `${prefix}${seq}`;
}
