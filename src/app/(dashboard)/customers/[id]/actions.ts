"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  customers,
  customerProductLinks,
  paymentMethods,
  subscriptions,
  subscriptionAddons,
} from "@/lib/db/schema";
import { generatePaymentPageLink } from "@/lib/payplus/payment-page";
import { paymentMethodSetupSessions } from "@/lib/db/schema";
import { auth } from "@/lib/auth/nextauth";

async function assertEditor() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (session.user.role === "viewer") throw new Error("Insufficient permissions");
}

/* ---------- Customer details ---------- */

export async function updateCustomer(formData: FormData) {
  await assertEditor();
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing id");

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const vatNumber = String(formData.get("vat_number") || "").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!email) throw new Error("אימייל חובה.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("אימייל לא תקין.");

  await db
    .update(customers)
    .set({
      name: name || null,
      email,
      phone: phone || null,
      vatNumber: vatNumber || null,
      notes: notes || null,
      updatedAt: new Date(),
    })
    .where(eq(customers.id, id));

  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}/edit?saved=customer`);
}

/* ---------- Subscription updates ---------- */

export async function updateSubscription(formData: FormData) {
  await assertEditor();
  const customerId = String(formData.get("customer_id") || "");
  const subId = String(formData.get("sub_id") || "");
  if (!customerId || !subId) throw new Error("Missing ids");

  const priceRaw = String(formData.get("custom_monthly_price") || "").trim();
  const totalPaymentsRaw = String(formData.get("total_payments") || "").trim();
  const paymentsChargedRaw = String(formData.get("payments_charged") || "").trim();
  const statusAction = String(formData.get("status_action") || "").trim();

  const updates: Partial<typeof subscriptions.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (priceRaw) {
    const v = Number(priceRaw);
    if (!Number.isFinite(v) || v <= 0) throw new Error("מחיר חייב להיות מספר חיובי.");
    updates.customMonthlyPrice = v.toFixed(2);
  } else if (formData.has("custom_monthly_price")) {
    // empty string → clear override (back to plan price)
    updates.customMonthlyPrice = null;
  }

  if (totalPaymentsRaw) {
    const v = Number(totalPaymentsRaw);
    if (!Number.isInteger(v) || v <= 0)
      throw new Error("מספר תשלומים חייב להיות מספר שלם חיובי.");
    updates.totalPayments = v;
  } else if (formData.has("total_payments")) {
    updates.totalPayments = null; // open-ended
  }

  if (paymentsChargedRaw) {
    const v = Number(paymentsChargedRaw);
    if (!Number.isInteger(v) || v < 0)
      throw new Error("תשלומים שכבר חויבו חייב להיות 0 או יותר.");
    updates.paymentsCharged = v;
  }

  switch (statusAction) {
    case "cancel_now":
      updates.status = "cancelled";
      updates.cancelledAt = new Date();
      updates.cancellationReason = "manual_admin";
      updates.cancelAtPeriodEnd = false;
      break;
    case "cancel_at_period_end":
      updates.cancelAtPeriodEnd = true;
      break;
    case "resume":
      updates.cancelAtPeriodEnd = false;
      updates.cancelledAt = null;
      updates.cancellationReason = null;
      // If it was already cancelled/expired, reactivate.
      updates.status = "active";
      break;
    case "pause":
      updates.status = "paused";
      break;
  }

  await db
    .update(subscriptions)
    .set(updates)
    .where(
      and(eq(subscriptions.id, subId), eq(subscriptions.customerId, customerId)),
    );

  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}/edit?saved=sub`);
}

/* ---------- Addons CRUD ---------- */

export async function addAddon(formData: FormData) {
  await assertEditor();
  const customerId = String(formData.get("customer_id") || "");
  const subId = String(formData.get("sub_id") || "");
  const name = String(formData.get("name") || "").trim();
  const code = String(formData.get("addon_code") || "").trim() ||
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50) ||
    "manual";
  const priceRaw = String(formData.get("monthly_price") || "").trim();
  const intervalRaw = String(formData.get("billing_interval") || "monthly").trim();

  if (!customerId || !subId) throw new Error("Missing ids");
  if (!name) throw new Error("שם התוסף חובה.");

  const price = Number(priceRaw);
  if (!Number.isFinite(price) || price <= 0)
    throw new Error("מחיר תוסף חייב להיות חיובי.");

  // Verify sub belongs to this customer.
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(eq(subscriptions.id, subId), eq(subscriptions.customerId, customerId)),
    )
    .limit(1);
  if (!sub) throw new Error("מנוי לא נמצא ללקוח זה.");

  const interval =
    intervalRaw === "yearly" || intervalRaw === "one_time"
      ? intervalRaw
      : "monthly";

  await db.insert(subscriptionAddons).values({
    subscriptionId: subId,
    addonCode: code,
    name,
    monthlyPrice: price.toFixed(2),
    billingInterval: interval,
    status: "active",
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
  });

  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}/edit?saved=addon`);
}

export async function updateAddon(formData: FormData) {
  await assertEditor();
  const customerId = String(formData.get("customer_id") || "");
  const addonId = String(formData.get("addon_id") || "");
  if (!customerId || !addonId) throw new Error("Missing ids");

  const updates: Partial<typeof subscriptionAddons.$inferInsert> = {
    updatedAt: new Date(),
  };
  const name = String(formData.get("name") || "").trim();
  const priceRaw = String(formData.get("monthly_price") || "").trim();

  if (name) updates.name = name;
  if (priceRaw) {
    const v = Number(priceRaw);
    if (!Number.isFinite(v) || v <= 0)
      throw new Error("מחיר תוסף חייב להיות חיובי.");
    updates.monthlyPrice = v.toFixed(2);
  }

  await db
    .update(subscriptionAddons)
    .set(updates)
    .where(eq(subscriptionAddons.id, addonId));

  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}/edit?saved=addon`);
}

export async function cancelAddon(formData: FormData) {
  await assertEditor();
  const customerId = String(formData.get("customer_id") || "");
  const addonId = String(formData.get("addon_id") || "");
  if (!customerId || !addonId) throw new Error("Missing ids");

  await db
    .update(subscriptionAddons)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptionAddons.id, addonId));

  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}/edit?saved=addon`);
}

/* ---------- Card replacement (PayPlus token-only J2 flow) ---------- */

export async function generateCardUpdateLink(formData: FormData) {
  await assertEditor();
  const customerId = String(formData.get("customer_id") || "");
  if (!customerId) throw new Error("Missing customer_id");

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  if (!customer) throw new Error("לקוח לא נמצא");

  // Card is per customer, but PayPlus setup-session requires productId.
  // Use the first project this customer is linked to.
  const [link] = await db
    .select()
    .from(customerProductLinks)
    .where(eq(customerProductLinks.customerId, customerId))
    .limit(1);
  if (!link)
    throw new Error("הלקוח לא מקושר לאף פרוייקט — אין יעד להפעלת תהליך החלפת כרטיס.");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const successUrl = `${appUrl}/customers/${customerId}?card=updated`;
  const failureUrl = `${appUrl}/customers/${customerId}?card=failed`;

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const [session] = await db
    .insert(paymentMethodSetupSessions)
    .values({
      customerId,
      productId: link.productId,
      successUrl,
      failureUrl,
      callbackUrl: `${appUrl}/api/webhooks/payplus`,
      expiresAt,
    })
    .returning();

  const { paymentPageUrl, pageRequestUid } = await generatePaymentPageLink({
    customerId,
    contextId: session.id,
    contextType: "card_update",
    baseAmount: 1,
    description: "החלפת אמצעי תשלום",
    customer: {
      name: customer.name ?? customer.email,
      email: customer.email,
      phone: customer.phone ?? undefined,
      vatNumber: customer.vatNumber ?? undefined,
    },
    successUrl,
    failureUrl,
  });

  await db
    .update(paymentMethodSetupSessions)
    .set({
      payplusPageRequestUid: pageRequestUid,
      paymentPageUrl,
      updatedAt: new Date(),
    })
    .where(eq(paymentMethodSetupSessions.id, session.id));

  redirect(paymentPageUrl);
}

export async function deletePaymentMethod(formData: FormData) {
  await assertEditor();
  const customerId = String(formData.get("customer_id") || "");
  const pmId = String(formData.get("pm_id") || "");
  if (!customerId || !pmId) throw new Error("Missing ids");

  // Soft-delete: mark as deleted so any historical FK references survive.
  await db
    .update(paymentMethods)
    .set({ status: "deleted", isDefault: false, updatedAt: new Date() })
    .where(
      and(eq(paymentMethods.id, pmId), eq(paymentMethods.customerId, customerId)),
    );

  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}/edit?saved=pm`);
}
