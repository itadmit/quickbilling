/**
 * Phase 2b — DIRECT tokenization without the browser flow.
 *
 * Calls PayPlus /Transactions/Charge with `credit_card` + `create_token: true`
 * using the sandbox test card. Result: a real PayPlus transaction (1 ILS,
 * sandbox = no money) AND a real token UID we can store + reuse for
 * recurring charges.
 *
 * Then writes a payment_method row to our DB, updates the setup-session
 * to 'completed', and updates customers.payplus_customer_uid — exactly
 * what the IPN handler would have done.
 *
 * This lets the rest of the test (subscription/charge/refund/cancel)
 * run without a human interactively entering the card.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

// Force the script to use dev credentials for the direct PayPlus call.
process.env.PAYPLUS_FORCE_ENV = "dev";

import { Pool } from "@neondatabase/serverless";
import { readSecrets, updateSecrets, logStep, logSuccess, logInfo, logError } from "./_helpers";

async function main() {
  const s = readSecrets();
  if (!s.customerId) {
    logError("No customerId in .test-secrets.json — run 02-tokenize first to create the customer.");
    process.exit(1);
  }

  const { PAYPLUS_CONFIG, payplusRequest } = await import("../../src/lib/payplus/client");
  console.log(`\n🔑 Direct tokenization\n  PayPlus: ${PAYPLUS_CONFIG.env} (${PAYPLUS_CONFIG.apiUrl})\n`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  logStep(1, "Look up customer email + name from our DB");
  const { rows: cust } = await pool.query(
    "SELECT email, name, phone FROM customers WHERE id=$1",
    [s.customerId],
  );
  if (cust.length === 0) {
    logError("Customer not found in DB");
    process.exit(1);
  }
  logSuccess(`email=${cust[0].email}`);

  logStep(2, "PayPlus /Transactions/Charge with test card + create_token=true (1 ILS sandbox)");
  const chargeResp = await payplusRequest<{
    transaction?: { uid?: string; status_code?: string };
    data?: {
      customer_uid?: string;
      card_information?: {
        four_digits?: string;
        expiry_month?: string;
        expiry_year?: string;
        brand_id?: number;
        token?: string;
      };
    };
    token_uid?: string;
  }>("Transactions/Charge", "POST", {
    terminal_uid: PAYPLUS_CONFIG.terminalUid,
    cashier_uid: PAYPLUS_CONFIG.cashierUid,
    amount: 1,
    currency_code: "ILS",
    credit_terms: 1,
    use_token: false,
    create_token: true,
    initial_invoice: false,
    credit_card: {
      number: "5326140280779844",
      exp_mm: "05",
      exp_yy: "26",
      cvv: "000",
    },
    customer: {
      customer_name: cust[0].name || "Test Merchant",
      email: cust[0].email,
      phone: cust[0].phone || "",
    },
    more_info_1: "smoke-test-direct-tokenization",
  });

  if (chargeResp.results?.status !== "success" || chargeResp.results?.code !== 0) {
    logError(`PayPlus charge failed: ${JSON.stringify(chargeResp.results)}`);
    process.exit(1);
  }

  // The Charge response is nested: data.data.card_information / data.transaction.
  // Type as `any` since we only need to probe a few fields.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const respAny = chargeResp as any;
  const ci = respAny?.data?.data?.card_information ?? respAny?.data?.card_information;
  const customerUid = respAny?.data?.data?.customer_uid ?? respAny?.data?.customer_uid;
  const transactionUid = respAny?.data?.transaction?.uid;
  const finalToken =
    ci?.token ?? respAny?.data?.token_uid ?? respAny?.token_uid;

  if (!finalToken) {
    logError("No token returned. Full response:");
    console.error(JSON.stringify(chargeResp, null, 2));
    process.exit(1);
  }

  logSuccess(`transaction_uid=${transactionUid}`);
  logSuccess(`token=${finalToken.slice(0, 16)}…`);
  logSuccess(`customer_uid=${customerUid}`);
  logSuccess(`card brand_id=${ci?.brand_id}, last4=${ci?.four_digits}`);

  logStep(3, "Save payment_method + customer.payplus_customer_uid in our DB");

  const expiry =
    ci?.expiry_month && ci?.expiry_year
      ? `${ci.expiry_month}/${ci.expiry_year}`
      : null;

  const { rows: pmRows } = await pool.query(
    `INSERT INTO payment_methods
       (customer_id, payplus_customer_uid, payplus_token_uid, card_brand,
        card_last4, card_expiry, is_default, status)
     VALUES ($1, $2, $3, $4, $5, $6, true, 'active')
     RETURNING id`,
    [
      s.customerId,
      customerUid ?? null,
      finalToken,
      "mastercard", // brand_id 2 from our mapping; fine for test
      ci?.four_digits ?? null,
      expiry,
    ],
  );
  const pmId = pmRows[0].id;
  logSuccess(`payment_method_id=${pmId}`);

  if (customerUid) {
    await pool.query("UPDATE customers SET payplus_customer_uid=$1 WHERE id=$2", [
      customerUid,
      s.customerId,
    ]);
    logSuccess("customer.payplus_customer_uid updated");
  }

  if (s.setupSessionId) {
    await pool.query(
      "UPDATE payment_method_setup_sessions SET status='completed', completed_payment_method_id=$1, updated_at=NOW() WHERE id=$2",
      [pmId, s.setupSessionId],
    );
    logSuccess("setup_session marked completed");
  }

  await pool.end();

  updateSecrets({ paymentMethodId: pmId });

  console.log(
    "\n✅ Direct tokenization done. Run `pnpm tsx scripts/test/03-flow.ts` next.\n",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
