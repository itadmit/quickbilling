/**
 * Phase 1 — Create test project + plans + customer in production DB.
 *
 * Writes credentials to .test-secrets.json for later phases.
 */
import bcrypt from "bcryptjs";
import { Pool } from "@neondatabase/serverless";
import {
  newApiKey,
  newWebhookSecret,
  writeSecrets,
  logStep,
  logSuccess,
  logInfo,
} from "./_helpers";

const SLUG = "quicktest";
const PREFIX = "QT";

async function main() {
  const apiBase =
    process.env.TEST_API_BASE || "https://billing.my-quickshop.com";

  console.log(`\n🧪 Test setup\n  → ${apiBase}\n`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  logStep(1, "Create or reuse 'quicktest' project");

  const apiKey = newApiKey();
  const webhookSecret = newWebhookSecret();
  const apiKeyHash = await bcrypt.hash(apiKey, 10);

  // Upsert product (reuse if exists, but rotate keys so we know them)
  const { rows: existing } = await pool.query(
    "SELECT id, slug FROM products WHERE slug=$1",
    [SLUG],
  );
  let productId: string;

  if (existing.length > 0) {
    productId = existing[0].id;
    await pool.query(
      `UPDATE products
       SET api_key_hash=$1, webhook_secret=$2, active=true, updated_at=NOW()
       WHERE id=$3`,
      [apiKeyHash, webhookSecret, productId],
    );
    logInfo(`Reused existing product (id=${productId})`);
    logSuccess("API key + webhook secret rotated");
  } else {
    const { rows } = await pool.query(
      `INSERT INTO products (slug, name, base_url, api_key_hash, webhook_secret,
                             invoice_prefix, default_trial_days, default_fee_percentage, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
       RETURNING id`,
      [
        SLUG,
        "Quick Test",
        "https://test.example.com",
        apiKeyHash,
        webhookSecret,
        PREFIX,
        7,
        null,
      ],
    );
    productId = rows[0].id;
    logSuccess(`Created product (id=${productId})`);
  }

  logStep(2, "Seed plans for 'quicktest'");

  const plans = [
    { code: "test_basic", name: "Test Basic", monthly_price: 49 },
    { code: "test_pro", name: "Test Pro", monthly_price: 199 },
  ];

  for (const p of plans) {
    await pool.query(
      `INSERT INTO plans (product_id, code, name, monthly_price, trial_days, active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (product_id, code) DO UPDATE
       SET name=EXCLUDED.name, monthly_price=EXCLUDED.monthly_price`,
      [productId, p.code, p.name, p.monthly_price.toFixed(2), 7],
    );
    logSuccess(`plan ${p.code}: ${p.name} ₪${p.monthly_price}/mo`);
  }

  await pool.end();

  // Save secrets for next phases
  writeSecrets({
    apiBase,
    productId,
    productSlug: SLUG,
    apiKey,
    webhookSecret,
    planCodes: plans.map((p) => p.code),
  });

  console.log("\n📦 .test-secrets.json written.\n");
  console.log("Credentials (save these):");
  console.log(`  Product slug:    ${SLUG}`);
  console.log(`  API Key:         ${apiKey}`);
  console.log(`  Webhook Secret:  ${webhookSecret}`);
  console.log("\nNext: pnpm tsx scripts/test/02-tokenize.ts\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
