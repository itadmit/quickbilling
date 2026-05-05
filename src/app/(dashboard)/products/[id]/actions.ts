"use server";

import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products, subscriptions, invoices } from "@/lib/db/schema";
import { generateApiKey, generateWebhookSecret } from "@/lib/auth/api-auth";
import { auth } from "@/lib/auth/nextauth";

async function assertAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (session.user.role === "viewer") throw new Error("Insufficient permissions");
}

export async function rotateApiKey(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing id");

  const { key, hash } = await generateApiKey();
  await db
    .update(products)
    .set({ apiKeyHash: hash, updatedAt: new Date() })
    .where(eq(products.id, id));

  redirect(`/products/${id}/key-rotated?api_key=${encodeURIComponent(key)}`);
}

export async function rotateWebhookSecret(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing id");

  const secret = generateWebhookSecret();
  await db
    .update(products)
    .set({ webhookSecret: secret, updatedAt: new Date() })
    .where(eq(products.id, id));

  redirect(
    `/products/${id}/key-rotated?webhook_secret=${encodeURIComponent(secret)}`,
  );
}

export async function toggleActive(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id") || "");
  const active = formData.get("active") === "true";
  if (!id) throw new Error("Missing id");

  await db
    .update(products)
    .set({ active, updatedAt: new Date() })
    .where(eq(products.id, id));

  redirect(`/products/${id}`);
}

export async function deleteProject(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id") || "");
  const confirm = String(formData.get("confirm") || "");
  if (!id) throw new Error("Missing id");

  // Check dependencies — refuse delete if subs/invoices exist (FK is RESTRICT anyway).
  const [{ subCount, invoiceCount }] = await db
    .select({
      subCount: sql<number>`(SELECT COUNT(*)::int FROM ${subscriptions} WHERE ${subscriptions.productId} = ${id})`,
      invoiceCount: sql<number>`(SELECT COUNT(*)::int FROM ${invoices} WHERE ${invoices.productId} = ${id})`,
    })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  if (subCount > 0 || invoiceCount > 0) {
    redirect(
      `/products/${id}?delete_blocked=${subCount}_${invoiceCount}`,
    );
  }

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!product) {
    redirect("/products");
  }

  if (confirm !== product.slug) {
    redirect(`/products/${id}?delete_mismatch=1`);
  }

  await db.delete(products).where(eq(products.id, id));
  redirect("/products?deleted=1");
}
