/**
 * Migration script: pull active QS10 subscriptions into the Hub.
 *
 * Usage:
 *   QS10_DATABASE_URL="postgresql://..." pnpm tsx scripts/migrate-from-qs10.ts [--dry-run]
 *
 * Migrates ONLY status IN ('active', 'trial') subscriptions with a valid
 * PayPlus token. Historical invoices are not imported (per spec).
 *
 * Idempotent: re-running upserts customers and links; subscriptions are
 * skipped if a (customer_id, product_id) sub already exists.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { Pool } from "@neondatabase/serverless";
import { eq, and } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import {
  customers,
  customerProductLinks,
  paymentMethods,
  plans,
  products,
  subscriptions,
} from "../src/lib/db/schema";

interface QS10Sub {
  id: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeBillingEmail: string | null;
  storeOwnerEmail: string | null;
  plan: string;
  status: string;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  payplusCustomerUid: string | null;
  payplusTokenUid: string | null;
  cardLastFour: string | null;
  cardBrand: string | null;
  cardExpiry: string | null;
  billingEmail: string | null;
  billingName: string | null;
  billingPhone: string | null;
  vatNumber: string | null;
  customMonthlyPrice: string | null;
  customFeePercentage: string | null;
}

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const qs10Url = process.env.QS10_DATABASE_URL;
  if (!qs10Url) {
    console.error("QS10_DATABASE_URL is not set");
    process.exit(1);
  }

  const sourcePool = new Pool({ connectionString: qs10Url });

  console.log(`🔍 Source: QS10 ${qs10Url.split("@")[1]?.split("/")[0]}`);
  console.log(`🎯 Target: Hub ${process.env.DATABASE_URL?.split("@")[1]?.split("/")[0]}`);
  console.log(DRY_RUN ? "  (dry-run mode)" : "  (writing data)");
  console.log();

  // Find QS10 product in Hub
  const [qs10Product] = await db
    .select()
    .from(products)
    .where(eq(products.slug, "quickshop10"))
    .limit(1);

  if (!qs10Product) {
    console.error("❌ Hub does not have a 'quickshop10' product. Run `pnpm seed` first.");
    process.exit(1);
  }

  // Pull QS10 active+trial subscriptions
  const result = await sourcePool.query<QS10Sub>(`
    SELECT
      s.id, s.store_id AS "storeId",
      st.name AS "storeName", st.slug AS "storeSlug",
      st.email AS "storeOwnerEmail",
      s.plan, s.status,
      s.trial_ends_at AS "trialEndsAt",
      s.current_period_start AS "currentPeriodStart",
      s.current_period_end AS "currentPeriodEnd",
      s.payplus_customer_uid AS "payplusCustomerUid",
      s.payplus_token_uid AS "payplusTokenUid",
      s.card_last_four AS "cardLastFour",
      s.card_brand AS "cardBrand",
      s.card_expiry AS "cardExpiry",
      s.billing_email AS "billingEmail",
      s.billing_name AS "billingName",
      s.billing_phone AS "billingPhone",
      s.vat_number AS "vatNumber",
      s.custom_monthly_price AS "customMonthlyPrice",
      s.custom_fee_percentage AS "customFeePercentage"
    FROM store_subscriptions s
    JOIN stores st ON st.id = s.store_id
    WHERE s.status IN ('active', 'trial')
  `);

  console.log(`Found ${result.rows.length} candidate subscriptions in QS10`);
  console.log();

  // Lookup plans in Hub by code
  const hubPlans = await db
    .select()
    .from(plans)
    .where(eq(plans.productId, qs10Product.id));
  const planByCode = new Map(hubPlans.map((p) => [p.code, p]));

  let imported = 0;
  let skippedNoToken = 0;
  let skippedNoPlan = 0;
  let skippedExisting = 0;
  let errors = 0;

  for (const row of result.rows) {
    const email = row.billingEmail || row.storeOwnerEmail;
    if (!email) {
      console.warn(`  ✗ ${row.storeSlug}: no email — skipping`);
      errors++;
      continue;
    }

    if (!row.payplusTokenUid && row.status === "active") {
      console.warn(`  ⏭️  ${row.storeSlug}: active but no PayPlus token — skipping`);
      skippedNoToken++;
      continue;
    }

    const plan = planByCode.get(row.plan);
    if (!plan) {
      console.warn(`  ⏭️  ${row.storeSlug}: plan '${row.plan}' not in Hub — skipping`);
      skippedNoPlan++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  ✓ would import: ${row.storeSlug} (${email}) — plan=${row.plan}, status=${row.status}`);
      imported++;
      continue;
    }

    try {
      await db.transaction(async (tx) => {
        // Customer (upsert by email)
        let [customer] = await tx
          .select()
          .from(customers)
          .where(eq(customers.email, email))
          .limit(1);

        if (!customer) {
          [customer] = await tx
            .insert(customers)
            .values({
              email,
              name: row.billingName ?? row.storeName,
              phone: row.billingPhone,
              vatNumber: row.vatNumber,
              payplusCustomerUid: row.payplusCustomerUid,
            })
            .returning();
        }

        // Product link
        await tx
          .insert(customerProductLinks)
          .values({
            customerId: customer.id,
            productId: qs10Product.id,
            externalId: row.storeId,
            externalSlug: row.storeSlug,
          })
          .onConflictDoUpdate({
            target: [
              customerProductLinks.customerId,
              customerProductLinks.productId,
            ],
            set: {
              externalId: row.storeId,
              externalSlug: row.storeSlug,
              updatedAt: new Date(),
            },
          });

        // Skip if subscription already exists
        const [existingSub] = await tx
          .select()
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.customerId, customer.id),
              eq(subscriptions.productId, qs10Product.id),
            ),
          )
          .limit(1);
        if (existingSub) {
          skippedExisting++;
          return;
        }

        // Payment method
        let pmId: string | undefined;
        if (row.payplusTokenUid) {
          const [pm] = await tx
            .insert(paymentMethods)
            .values({
              customerId: customer.id,
              payplusCustomerUid: row.payplusCustomerUid,
              payplusTokenUid: row.payplusTokenUid,
              cardBrand: row.cardBrand,
              cardLast4: row.cardLastFour,
              cardExpiry: row.cardExpiry,
              isDefault: true,
              status: "active",
            })
            .returning();
          pmId = pm.id;
        }

        // Subscription
        await tx.insert(subscriptions).values({
          customerId: customer.id,
          productId: qs10Product.id,
          planId: plan.id,
          status: row.status as "active" | "trial",
          billingInterval: "monthly",
          billingStartDate: row.currentPeriodStart?.toISOString().slice(0, 10),
          currentPeriodStart: row.currentPeriodStart?.toISOString().slice(0, 10),
          currentPeriodEnd: row.currentPeriodEnd?.toISOString().slice(0, 10),
          trialEndsAt: row.trialEndsAt,
          customMonthlyPrice: row.customMonthlyPrice,
          customFeePercentage: row.customFeePercentage,
          paymentMethodId: pmId,
        });

        imported++;
        console.log(`  ✓ imported: ${row.storeSlug} (${email})`);
      });
    } catch (err) {
      errors++;
      console.error(`  ✗ ${row.storeSlug}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log();
  console.log("─".repeat(50));
  console.log(`Imported:           ${imported}`);
  console.log(`Skipped (no token): ${skippedNoToken}`);
  console.log(`Skipped (no plan):  ${skippedNoPlan}`);
  console.log(`Skipped (existing): ${skippedExisting}`);
  console.log(`Errors:             ${errors}`);
  console.log("─".repeat(50));

  await sourcePool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
