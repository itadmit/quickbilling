/**
 * Phase 2 — create test customer + payment-method setup session, get URL.
 * User must open URL, enter test card, finish; then run phase 3.
 */
import {
  callHubApi,
  readSecrets,
  updateSecrets,
  logStep,
  logSuccess,
  logInfo,
  logError,
  prompt,
  sleep,
} from "./_helpers";

interface CustomerResp {
  id: string;
  email: string;
}
interface SetupResp {
  session_id: string;
  payment_page_url: string;
  page_request_uid: string;
}
interface PmListResp {
  payment_methods?: Array<{ id: string; card_brand?: string; card_last4?: string }>;
}

async function main() {
  const s = readSecrets();
  console.log(`\n🧪 Tokenize phase\n  → ${s.apiBase}\n`);

  logStep(1, "Upsert test customer (POST /api/v1/customers)");

  const email = `quicktest+${Math.floor(Date.now() / 1000)}@example.com`;
  const customerRes = await callHubApi<CustomerResp>(
    "POST",
    "/api/v1/customers",
    {
      email,
      phone: "+972500000001",
      name: "Test Merchant",
      vat_number: "123456789",
      external_id: `qt_${Math.floor(Date.now() / 1000)}`,
      external_slug: "test-merchant",
    },
    s,
  );
  if (customerRes.status >= 400) {
    logError(`status=${customerRes.status} body=${JSON.stringify(customerRes.body)}`);
    process.exit(1);
  }
  const customerId = customerRes.body.id;
  logSuccess(`customer_id=${customerId}, email=${customerRes.body.email}`);
  updateSecrets({ customerId });

  logStep(2, "Create setup session (POST /api/v1/payment-methods/setup)");

  const setupRes = await callHubApi<SetupResp>(
    "POST",
    "/api/v1/payment-methods/setup",
    {
      customer_id: customerId,
      context_type: "subscription_setup",
      amount: 1,
      success_url: `${s.apiBase}/login?test=success`,
      failure_url: `${s.apiBase}/login?test=failure`,
    },
    s,
  );
  if (setupRes.status >= 400) {
    logError(`status=${setupRes.status} body=${JSON.stringify(setupRes.body)}`);
    process.exit(1);
  }
  logSuccess(`session_id=${setupRes.body.session_id}`);
  updateSecrets({ setupSessionId: setupRes.body.session_id });

  console.log("\n" + "─".repeat(60));
  console.log("\n💳 Open the following URL in your browser:\n");
  console.log("    " + setupRes.body.payment_page_url + "\n");
  console.log("Use one of the PayPlus sandbox test cards:");
  console.log("  Number:  5326-1402-8077-9844");
  console.log("  Expiry:  05/26");
  console.log("  CVV:     000\n");
  console.log(
    "After the payment page redirects to success/failure, come back here.",
  );
  console.log("─".repeat(60) + "\n");

  await prompt("✋ Press ENTER once you finished the payment-page flow… ");

  logStep(3, "Wait for IPN callback to save the payment method");

  let foundPm: { id: string; card_brand?: string; card_last4?: string } | undefined;
  for (let i = 0; i < 12; i++) {
    const res = await callHubApi<PmListResp>(
      "GET",
      `/api/v1/customers/${customerId}`,
      null,
      s,
    );
    if (res.status === 200) {
      const pms = (res.body as { payment_methods?: Array<{ id: string; card_brand?: string; card_last4?: string }> }).payment_methods;
      if (pms && pms.length > 0) {
        foundPm = pms[0];
        break;
      }
    }
    logInfo(`poll ${i + 1}/12 — no payment method yet, retry in 5s…`);
    await sleep(5000);
  }

  if (!foundPm) {
    logError(
      "Payment method never appeared — check Vercel logs for /api/webhooks/payplus errors.",
    );
    logInfo("Re-run this script after fixing, OR continue to phase 3 manually.");
    process.exit(1);
  }

  logSuccess(
    `payment_method saved: id=${foundPm.id}, ${foundPm.card_brand} ····${foundPm.card_last4}`,
  );
  updateSecrets({ paymentMethodId: foundPm.id });

  console.log("\nNext: pnpm tsx scripts/test/03-flow.ts\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
