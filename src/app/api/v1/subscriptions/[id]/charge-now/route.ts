import { and, eq } from "drizzle-orm";
import { withProductAuth } from "@/lib/auth/handler";
import { db } from "@/lib/db/client";
import {
  customers,
  paymentMethods,
  plans,
  products,
  subscriptions,
} from "@/lib/db/schema";
import { renewSubscription } from "@/lib/billing/renewal";

/**
 * Force an immediate charge attempt for a subscription. Useful for staff
 * to trigger off-cycle. Reuses the renewal pipeline.
 */
export const POST = withProductAuth(async (ctx, params) => {
  const [row] = await db
    .select({
      sub: subscriptions,
      customer: customers,
      plan: plans,
      pm: paymentMethods,
      product: products,
    })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .innerJoin(products, eq(subscriptions.productId, products.id))
    .leftJoin(paymentMethods, eq(subscriptions.paymentMethodId, paymentMethods.id))
    .where(
      and(
        eq(subscriptions.id, params.id),
        eq(subscriptions.productId, ctx.product.id),
      ),
    )
    .limit(1);

  if (!row) return { status: 404, body: { error: "NOT_FOUND" } };

  const result = await renewSubscription({
    subscription: row.sub,
    customer: row.customer,
    plan: row.plan,
    paymentMethod: row.pm,
    product: row.product,
  });

  if (result.ok) {
    return {
      status: 200,
      body: {
        ok: true,
        invoice_id: result.invoiceId,
        invoice_number: result.invoiceNumber,
      },
    };
  }
  return {
    status: 402,
    body: { ok: false, reason: result.reason, error: result.error },
  };
});
