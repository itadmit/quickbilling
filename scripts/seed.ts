import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db/client";
import { products, plans, platformSettings } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

function generateApiKey(): string {
  return `qcb_${randomBytes(24).toString("hex")}`;
}

function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

async function seed() {
  console.log("🌱 Seeding billing-hub...\n");

  /* ─── Platform settings ─── */
  const defaultSettings = [
    { key: "vat_rate", value: 0.18, description: "Israeli VAT rate", category: "billing" },
    { key: "default_dunning_intervals_days", value: [1, 3, 7], description: "Days between dunning retries", category: "dunning" },
    { key: "max_dunning_attempts", value: 3, description: "Total retries before cancellation", category: "dunning" },
    { key: "default_trial_days", value: 14, description: "Default trial length", category: "billing" },
    { key: "transaction_fee_rate", value: 0.005, description: "Default commission rate (0.5%)", category: "billing" },
  ];

  for (const setting of defaultSettings) {
    await db
      .insert(platformSettings)
      .values(setting)
      .onConflictDoNothing();
  }
  console.log(`✓ ${defaultSettings.length} platform settings`);

  /* ─── Products ─── */
  const apiKeyQs10 = generateApiKey();
  const webhookSecretQs10 = generateWebhookSecret();

  const [qs10] = await db
    .insert(products)
    .values({
      slug: "quickshop10",
      name: "Quick Shop 10",
      baseUrl: "https://quickshop10.my-quickshop.com",
      apiKeyHash: await bcrypt.hash(apiKeyQs10, 10),
      webhookSecret: webhookSecretQs10,
      invoicePrefix: "QS",
      defaultTrialDays: 7,
      defaultFeePercentage: "0.005",
      active: true,
    })
    .onConflictDoNothing({ target: products.slug })
    .returning();

  if (qs10) {
    console.log(`✓ Product: QuickShop 10`);
    console.log(`  API Key (save this!):  ${apiKeyQs10}`);
    console.log(`  Webhook Secret:        ${webhookSecretQs10}`);

    /* ─── Plans for QS10 ─── */
    const plansData = [
      {
        productId: qs10.id,
        code: "branding",
        name: "Branding",
        monthlyPrice: "299.00",
        features: { commission: true, custom_domain: false },
        trialDays: 7,
      },
      {
        productId: qs10.id,
        code: "quickshop",
        name: "QuickShop",
        monthlyPrice: "399.00",
        features: { commission: true, custom_domain: true, priority_support: true },
        trialDays: 7,
      },
    ];

    for (const plan of plansData) {
      await db.insert(plans).values(plan).onConflictDoNothing();
    }
    console.log(`✓ ${plansData.length} plans for QuickShop 10`);
  } else {
    const existing = await db
      .select()
      .from(products)
      .where(eq(products.slug, "quickshop10"))
      .limit(1);
    console.log(`✓ QuickShop 10 already exists (id=${existing[0]?.id})`);
  }

  console.log("\n✅ Seed complete\n");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
