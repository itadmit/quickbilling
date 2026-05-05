import { z } from "zod";
import { and, eq, or, ilike } from "drizzle-orm";
import { withProductAuth } from "@/lib/auth/handler";
import { db } from "@/lib/db/client";
import {
  customers,
  customerProductLinks,
  type Customer,
} from "@/lib/db/schema";

const upsertSchema = z.object({
  email: z.string().email(),
  phone: z.string().optional(),
  name: z.string().min(1).optional(),
  vat_number: z.string().optional(),
  billing_address: z.record(z.string(), z.unknown()).optional(),
  external_id: z.string().min(1),
  external_slug: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function serializeCustomer(c: Customer) {
  return {
    id: c.id,
    email: c.email,
    phone: c.phone,
    name: c.name,
    vat_number: c.vatNumber,
    billing_address: c.billingAddress,
    notes: c.notes,
    tags: c.tags,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

export const POST = withProductAuth(async (ctx) => {
  const parsed = upsertSchema.safeParse(ctx.parsedBody);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "VALIDATION_ERROR", details: parsed.error.issues },
    };
  }

  const { email, external_id, external_slug, metadata, ...rest } = parsed.data;

  return db.transaction(async (tx) => {
    let [customer] = await tx
      .select()
      .from(customers)
      .where(eq(customers.email, email))
      .limit(1);

    let createdNew = false;
    if (!customer) {
      const [created] = await tx
        .insert(customers)
        .values({
          email,
          phone: rest.phone,
          name: rest.name,
          vatNumber: rest.vat_number,
          billingAddress: rest.billing_address,
        })
        .returning();
      customer = created;
      createdNew = true;
    } else {
      const updates: Partial<typeof customers.$inferInsert> = {};
      if (rest.phone && rest.phone !== customer.phone) updates.phone = rest.phone;
      if (rest.name && rest.name !== customer.name) updates.name = rest.name;
      if (rest.vat_number && rest.vat_number !== customer.vatNumber) {
        updates.vatNumber = rest.vat_number;
      }
      if (rest.billing_address) updates.billingAddress = rest.billing_address;
      if (Object.keys(updates).length > 0) {
        const [updated] = await tx
          .update(customers)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(customers.id, customer.id))
          .returning();
        customer = updated;
      }
    }

    await tx
      .insert(customerProductLinks)
      .values({
        customerId: customer.id,
        productId: ctx.product.id,
        externalId: external_id,
        externalSlug: external_slug,
        metadata,
      })
      .onConflictDoUpdate({
        target: [
          customerProductLinks.customerId,
          customerProductLinks.productId,
        ],
        set: {
          externalId: external_id,
          externalSlug: external_slug,
          metadata,
          updatedAt: new Date(),
        },
      });

    return {
      status: createdNew ? 201 : 200,
      body: serializeCustomer(customer),
    };
  });
});

export const GET = withProductAuth(async (ctx) => {
  const email = ctx.url.searchParams.get("email");
  const phone = ctx.url.searchParams.get("phone");
  const externalId = ctx.url.searchParams.get("external_id");

  if (!email && !phone && !externalId) {
    return {
      status: 400,
      body: { error: "MISSING_QUERY", message: "Provide email, phone, or external_id" },
    };
  }

  if (externalId) {
    const [link] = await db
      .select({ customerId: customerProductLinks.customerId })
      .from(customerProductLinks)
      .where(
        and(
          eq(customerProductLinks.productId, ctx.product.id),
          eq(customerProductLinks.externalId, externalId),
        ),
      )
      .limit(1);

    if (!link) {
      return { status: 404, body: { error: "NOT_FOUND" } };
    }
    const [c] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, link.customerId))
      .limit(1);
    return c
      ? { status: 200, body: serializeCustomer(c) }
      : { status: 404, body: { error: "NOT_FOUND" } };
  }

  const conds = [];
  if (email) conds.push(eq(customers.email, email));
  if (phone) conds.push(ilike(customers.phone, phone));
  const rows = await db
    .select()
    .from(customers)
    .where(or(...conds))
    .limit(50);

  return {
    status: 200,
    body: { results: rows.map(serializeCustomer) },
  };
});
