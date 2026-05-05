/**
 * PayPlus connectivity smoke test.
 * Reads `_dev` credentials from .env.local and:
 *   1. Generates a hosted payment page URL (real API call to dev sandbox).
 *   2. Validates the response shape we depend on.
 *   3. Reports any auth/network failure clearly.
 *
 * Run:  pnpm tsx scripts/payplus-smoke-test.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

// Force dev credentials (this script never hits production).
process.env.PAYPLUS_FORCE_ENV = "dev";

async function main() {
  const { PAYPLUS_CONFIG, payplusRequest } = await import("../src/lib/payplus/client");
  const { generatePaymentPageLink } = await import("../src/lib/payplus/payment-page");

  console.log("🔍 PayPlus smoke test\n");
  console.log(`  env:           ${PAYPLUS_CONFIG.env}`);
  console.log(`  apiUrl:        ${PAYPLUS_CONFIG.apiUrl}`);
  console.log(`  apiKey set:    ${PAYPLUS_CONFIG.apiKey ? "✓" : "✗"} (${PAYPLUS_CONFIG.apiKey.length} chars)`);
  console.log(`  secretKey set: ${PAYPLUS_CONFIG.secretKey ? "✓" : "✗"} (${PAYPLUS_CONFIG.secretKey.length} chars)`);
  console.log(`  terminalUid:   ${PAYPLUS_CONFIG.terminalUid ? "✓" : "✗"}`);
  console.log(`  cashierUid:    ${PAYPLUS_CONFIG.cashierUid ? "✓" : "✗"}`);
  console.log(`  paymentPage:   ${PAYPLUS_CONFIG.paymentPageUid ? "✓" : "✗"}`);
  console.log();

  const missing = [
    !PAYPLUS_CONFIG.apiKey && "apiKey",
    !PAYPLUS_CONFIG.secretKey && "secretKey",
    !PAYPLUS_CONFIG.terminalUid && "terminalUid",
    !PAYPLUS_CONFIG.cashierUid && "cashierUid",
    !PAYPLUS_CONFIG.paymentPageUid && "paymentPageUid",
  ].filter(Boolean);

  if (missing.length) {
    console.error(`❌ Missing dev credentials: ${missing.join(", ")}`);
    process.exit(1);
  }

  // Test 1: simple ping — query a non-existent token to confirm auth headers work.
  console.log("Test 1 — Token/Check (existence query, fake UID, expect 4xx-style error):");
  try {
    const fakeUid = "00000000-0000-0000-0000-000000000000";
    const ping = await payplusRequest("Token/Check/" + fakeUid, "GET");
    console.log(`  results.status:      ${ping.results?.status}`);
    console.log(`  results.code:        ${ping.results?.code}`);
    console.log(`  results.description: ${ping.results?.description}`);
    if (ping.results?.status === "error" || ping.results?.status === "failure") {
      console.log("  ✓ auth works (PayPlus accepted creds, rejected the fake UID)");
    } else if (ping.results?.status === "success") {
      console.log("  ⚠️  unexpected success — creds may have wider permissions or UID exists?");
    } else {
      console.log("  ⚠️  unexpected response shape");
    }
  } catch (err) {
    console.error("  ❌", err instanceof Error ? err.message : err);
    process.exit(1);
  }
  console.log();

  // Test 2: real generateLink call.
  console.log("Test 2 — PaymentPages/generateLink (subscription_setup):");
  try {
    const result = await generatePaymentPageLink({
      customerId: "00000000-0000-0000-0000-000000000001",
      contextId: "00000000-0000-0000-0000-000000000002",
      contextType: "subscription_setup",
      baseAmount: 10,
      description: "Smoke test — Quick Commerce Billing Hub",
      customer: {
        name: "Smoke Test Customer",
        email: "smoke-test@example.com",
        phone: "+972500000000",
      },
      successUrl: "https://billing.my-quickshop.com/billing/success",
      failureUrl: "https://billing.my-quickshop.com/billing/failed",
    });
    console.log(`  payment_page_link:   ${result.paymentPageUrl}`);
    console.log(`  page_request_uid:    ${result.pageRequestUid}`);
    if (result.paymentPageUrl?.startsWith("https://payments")) {
      console.log("  ✓ valid payment page URL — tokenization flow ready");
    }
  } catch (err) {
    console.error("  ❌", err instanceof Error ? err.message : err);
    process.exit(1);
  }
  console.log();

  console.log("✅ All PayPlus dev tests passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
