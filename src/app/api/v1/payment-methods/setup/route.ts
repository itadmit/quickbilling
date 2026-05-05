import { z } from "zod";
import { eq } from "drizzle-orm";
import { withProductAuth } from "@/lib/auth/handler";
import { db } from "@/lib/db/client";
import { customers, paymentMethodSetupSessions } from "@/lib/db/schema";
import { generatePaymentPageLink } from "@/lib/payplus/payment-page";

const schema = z.object({
  customer_id: z.string().uuid(),
  description: z.string().min(1).max(200).optional(),
  amount: z.number().positive().optional(),
  context_type: z
    .enum(["subscription_setup", "card_update", "one_time"])
    .default("subscription_setup"),
  success_url: z.string().url(),
  failure_url: z.string().url(),
  cancel_url: z.string().url().optional(),
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

  // Pre-create the setup session so we have a contextId to embed in more_info_1.
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min
  const [session] = await db
    .insert(paymentMethodSetupSessions)
    .values({
      customerId: customer.id,
      productId: ctx.product.id,
      successUrl: data.success_url,
      failureUrl: data.failure_url,
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/payplus`,
      expiresAt,
    })
    .returning();

  const baseAmount =
    data.context_type === "card_update" ? 1 : data.amount ?? 1;

  const description =
    data.description ?? `${ctx.product.name} - הגדרת אמצעי תשלום`;

  const { paymentPageUrl, pageRequestUid } = await generatePaymentPageLink({
    customerId: customer.id,
    contextId: session.id,
    contextType: data.context_type,
    baseAmount,
    description,
    customer: {
      name: customer.name ?? customer.email,
      email: customer.email,
      phone: customer.phone ?? undefined,
      vatNumber: customer.vatNumber ?? undefined,
    },
    successUrl: data.success_url,
    failureUrl: data.failure_url,
    cancelUrl: data.cancel_url,
  });

  await db
    .update(paymentMethodSetupSessions)
    .set({
      payplusPageRequestUid: pageRequestUid,
      paymentPageUrl,
      updatedAt: new Date(),
    })
    .where(eq(paymentMethodSetupSessions.id, session.id));

  return {
    status: 201,
    body: {
      session_id: session.id,
      payment_page_url: paymentPageUrl,
      page_request_uid: pageRequestUid,
      expires_at: expiresAt.toISOString(),
    },
  };
});
