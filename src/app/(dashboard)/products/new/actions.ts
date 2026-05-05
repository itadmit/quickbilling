"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { products, plans } from "@/lib/db/schema";
import { generateApiKey, generateWebhookSecret } from "@/lib/auth/api-auth";
import { auth } from "@/lib/auth/nextauth";

export interface CreateProductResult {
  productId: string;
  apiKey: string;
  webhookSecret: string;
}

export async function createProduct(formData: FormData): Promise<CreateProductResult> {
  const session = await auth();
  if (!session?.user || session.user.role === "viewer") {
    throw new Error("Unauthorized");
  }

  const slug = String(formData.get("slug") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const baseUrl = String(formData.get("base_url") || "").trim();
  const invoicePrefix = String(formData.get("invoice_prefix") || "").trim().toUpperCase();
  const defaultTrialDays = Number(formData.get("default_trial_days") || 14);
  const defaultFeePercentageRaw = String(formData.get("default_fee_percentage") || "");
  const defaultFeePercentage = defaultFeePercentageRaw
    ? Number(defaultFeePercentageRaw)
    : null;

  if (!slug || !name || !invoicePrefix) {
    throw new Error("Missing required fields");
  }

  const planRaws = JSON.parse(String(formData.get("plans") || "[]")) as Array<{
    code: string;
    name: string;
    monthly_price: number;
    trial_days?: number;
  }>;

  const { key, hash } = await generateApiKey();
  const webhookSecret = generateWebhookSecret();

  const productId = await db.transaction(async (tx) => {
    const [product] = await tx
      .insert(products)
      .values({
        slug,
        name,
        baseUrl: baseUrl || null,
        invoicePrefix,
        defaultTrialDays,
        defaultFeePercentage:
          defaultFeePercentage != null ? defaultFeePercentage.toFixed(4) : null,
        apiKeyHash: hash,
        webhookSecret,
        active: true,
      })
      .returning();

    if (planRaws.length > 0) {
      await tx.insert(plans).values(
        planRaws.map((p) => ({
          productId: product.id,
          code: p.code,
          name: p.name,
          monthlyPrice: p.monthly_price.toFixed(2),
          trialDays: p.trial_days ?? defaultTrialDays,
          active: true,
        })),
      );
    }

    return product.id;
  });

  // We'd ideally show the secrets to the user once and never again. We store
  // them temporarily on the redirect via a query param hash. For simplicity,
  // we redirect to a secrets page that displays + clears.
  const params = new URLSearchParams({
    api_key: key,
    webhook_secret: webhookSecret,
  });
  redirect(`/products/new/secrets?id=${productId}&${params.toString()}`);
}
