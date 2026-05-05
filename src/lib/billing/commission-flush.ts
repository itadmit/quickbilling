import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  commissionCharges,
  customers,
  invoices,
  invoiceItems,
  charges,
  paymentMethods,
  products,
  subscriptions,
} from "../db/schema";
import { chargeWithToken } from "../payplus/charge";
import { withVat } from "../payplus/vat";
import { generateInvoiceNumber } from "./invoice-number";
import { getVatRate } from "../settings";

/**
 * Aggregate pending commission_charges per (customer, product) and create one
 * invoice per group. Charge via PayPlus; on success mark all included
 * commissions as 'invoiced'/'paid' linked to that invoice.
 *
 * Returns counts. Designed to be invoked from cron on the 1st + 15th @ 03:00.
 */
export async function flushCommissions(): Promise<{
  groupsProcessed: number;
  invoicesCreated: number;
  totalCharged: number;
  failed: number;
}> {
  // Find unique (customer_id, product_id) with pending commissions.
  const groups = await db
    .selectDistinct({
      customerId: commissionCharges.customerId,
      productId: commissionCharges.productId,
    })
    .from(commissionCharges)
    .where(eq(commissionCharges.status, "pending"));

  let invoicesCreated = 0;
  let totalCharged = 0;
  let failed = 0;

  for (const g of groups) {
    const items = await db
      .select()
      .from(commissionCharges)
      .where(
        and(
          eq(commissionCharges.customerId, g.customerId),
          eq(commissionCharges.productId, g.productId),
          eq(commissionCharges.status, "pending"),
        ),
      );

    if (items.length === 0) continue;

    const totalBase = items.reduce(
      (sum, i) => sum + Number(i.baseAmount),
      0,
    );
    if (totalBase <= 0) continue;

    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, g.customerId))
      .limit(1);
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, g.productId))
      .limit(1);
    if (!customer || !product) continue;

    // Find the customer's default payment method on this product (any active).
    const [pm] = await db
      .select()
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.customerId, customer.id),
          eq(paymentMethods.status, "active"),
          eq(paymentMethods.isDefault, true),
        ),
      )
      .limit(1);

    if (!pm) {
      console.warn(
        `[commission-flush] no payment method for customer ${customer.id}, skipping ${items.length} items`,
      );
      failed++;
      continue;
    }

    const vatRate = await getVatRate();
    const { total } = withVat(totalBase, vatRate);
    const periodStart = items
      .map((i) => i.periodStart)
      .reduce((a, b) => (a < b ? a : b));
    const periodEnd = items
      .map((i) => i.periodEnd)
      .reduce((a, b) => (a > b ? a : b));

    const invoiceNumber = await generateInvoiceNumber(product.invoicePrefix);

    const charge = await chargeWithToken({
      tokenUid: pm.payplusTokenUid,
      customerUid: pm.payplusCustomerUid ?? undefined,
      amount: total,
      description: `${product.name} - עמלות תקופה ${periodStart} עד ${periodEnd}`,
      invoiceItems: [
        {
          name: `${product.name} - עמלות תקופה ${periodStart} עד ${periodEnd}`,
          quantity: 1,
          price: total,
        },
      ],
      moreInfo: {
        type: "commission_flush",
        customerId: customer.id,
        productId: product.id,
        invoiceNumber,
      },
    });

    if (!charge.success) {
      console.error(
        `[commission-flush] charge failed for ${customer.email}:`,
        charge.errorMessage,
      );
      failed++;
      continue;
    }

    // Find the active subscription for this customer+product (for FK link)
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.customerId, customer.id),
          eq(subscriptions.productId, product.id),
        ),
      )
      .limit(1);

    await db.transaction(async (tx) => {
      const [inv] = await tx
        .insert(invoices)
        .values({
          customerId: customer.id,
          productId: product.id,
          subscriptionId: sub?.id,
          type: "commission",
          status: "paid",
          invoiceNumber,
          payplusInvoiceUuid: charge.invoiceUuid,
          payplusInvoiceNumber: charge.invoiceNumber,
          payplusInvoiceUrl: charge.invoiceUrl,
          payplusTransactionUid: charge.transactionUid,
          subtotal: totalBase.toFixed(2),
          vatAmount: (total - totalBase).toFixed(2),
          totalAmount: total.toFixed(2),
          vatRate: vatRate.toFixed(4),
          currency: "ILS",
          periodStart,
          periodEnd,
          description: `${product.name} - עמלות תקופה`,
          chargeAttempts: 1,
          issuedAt: new Date(),
          paidAt: new Date(),
        })
        .returning();

      await tx.insert(invoiceItems).values(
        items.map((item) => ({
          invoiceId: inv.id,
          description: `עמלה על ${item.sourceExternalId}`,
          quantity: 1,
          unitPrice: item.baseAmount,
          totalPrice: item.baseAmount,
          referenceType: "commission",
          referenceId: item.id,
        })),
      );

      await tx.insert(charges).values({
        invoiceId: inv.id,
        attemptNumber: 1,
        status: "success",
        payplusResponse: charge.raw as object,
        payplusTransactionUid: charge.transactionUid,
        attemptedAt: new Date(),
      });

      await tx
        .update(commissionCharges)
        .set({
          status: "paid",
          invoiceId: inv.id,
          updatedAt: new Date(),
        })
        .where(
          sql`${commissionCharges.id} IN (${sql.join(
            items.map((i) => sql`${i.id}`),
            sql`, `,
          )})`,
        );

      invoicesCreated++;
      totalCharged += total;
    });
  }

  return {
    groupsProcessed: groups.length,
    invoicesCreated,
    totalCharged,
    failed,
  };
}
