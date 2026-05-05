import { z } from "zod";
import { eq } from "drizzle-orm";
import { withProductAuth } from "@/lib/auth/handler";
import { db } from "@/lib/db/client";
import { customers, subscriptions, paymentMethods } from "@/lib/db/schema";

const patchSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  vat_number: z.string().optional(),
  billing_address: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const GET = withProductAuth(async (_ctx, params) => {
  const id = params.id;
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);

  if (!customer) {
    return { status: 404, body: { error: "NOT_FOUND" } };
  }

  const [subs, pms] = await Promise.all([
    db.select().from(subscriptions).where(eq(subscriptions.customerId, id)),
    db.select().from(paymentMethods).where(eq(paymentMethods.customerId, id)),
  ]);

  return {
    status: 200,
    body: {
      id: customer.id,
      email: customer.email,
      phone: customer.phone,
      name: customer.name,
      vat_number: customer.vatNumber,
      billing_address: customer.billingAddress,
      notes: customer.notes,
      tags: customer.tags,
      created_at: customer.createdAt,
      updated_at: customer.updatedAt,
      subscriptions: subs.map((s) => ({
        id: s.id,
        product_id: s.productId,
        plan_id: s.planId,
        status: s.status,
        current_period_end: s.currentPeriodEnd,
      })),
      payment_methods: pms.map((p) => ({
        id: p.id,
        card_brand: p.cardBrand,
        card_last4: p.cardLast4,
        card_expiry: p.cardExpiry,
        is_default: p.isDefault,
        status: p.status,
      })),
    },
  };
});

export const PATCH = withProductAuth(async (ctx, params) => {
  const parsed = patchSchema.safeParse(ctx.parsedBody);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "VALIDATION_ERROR", details: parsed.error.issues },
    };
  }

  const updates: Partial<typeof customers.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;
  if (parsed.data.vat_number !== undefined)
    updates.vatNumber = parsed.data.vat_number;
  if (parsed.data.billing_address !== undefined)
    updates.billingAddress = parsed.data.billing_address;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
  if (parsed.data.tags !== undefined) updates.tags = parsed.data.tags;

  if (Object.keys(updates).length === 0) {
    return {
      status: 400,
      body: { error: "NOTHING_TO_UPDATE" },
    };
  }

  const [updated] = await db
    .update(customers)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(customers.id, params.id))
    .returning();

  if (!updated) {
    return { status: 404, body: { error: "NOT_FOUND" } };
  }

  return {
    status: 200,
    body: {
      id: updated.id,
      email: updated.email,
      phone: updated.phone,
      name: updated.name,
      vat_number: updated.vatNumber,
      billing_address: updated.billingAddress,
      notes: updated.notes,
      tags: updated.tags,
      updated_at: updated.updatedAt,
    },
  };
});
