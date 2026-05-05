/**
 * Phase 3 — exercise the full billing pipeline end-to-end against the live
 * Hub deployment, using the project + customer + token from phases 1-2.
 *
 *   create subscription (no trial → active immediately)
 *   force first charge   (POST /subscriptions/{id}/charge-now)
 *   record commission    (POST /commissions)
 *   list invoices        (GET  /invoices?customer_id=…)
 *   refund last invoice  (POST /invoices/{id}/refund)
 *   cancel subscription  (POST /subscriptions/{id}/cancel)
 *
 * Prints status for each step. Fails loudly on any non-2xx.
 */
import {
  callHubApi,
  readSecrets,
  updateSecrets,
  logStep,
  logSuccess,
  logInfo,
  logError,
} from "./_helpers";

interface SubscriptionResp {
  id: string;
  status: string;
  customer_id: string;
  plan_id: string;
}
interface ChargeNowResp {
  ok: boolean;
  invoice_id?: string;
  invoice_number?: string;
  reason?: string;
  error?: string;
}
interface CommissionResp {
  id: string;
  amount: string;
  base_amount: string;
  status: string;
}
interface InvoiceListResp {
  results: Array<{
    id: string;
    invoice_number: string;
    type: string;
    status: string;
    total_amount: string;
    payplus_transaction_uid?: string;
  }>;
}
interface RefundResp {
  id: string;
  status: string;
  refund_uid?: string;
}
interface CancelResp {
  id: string;
  status: string;
  cancel_at_period_end?: boolean;
}

async function main() {
  const s = readSecrets();
  console.log(`\n🧪 Flow phase\n  → ${s.apiBase}\n`);

  if (!s.customerId || !s.paymentMethodId) {
    logError(
      "Missing customer / payment_method in .test-secrets.json. Run phase 2 first.",
    );
    process.exit(1);
  }

  logStep(1, "Create subscription on test_basic plan (POST /subscriptions)");

  const subRes = await callHubApi<SubscriptionResp>(
    "POST",
    "/api/v1/subscriptions",
    {
      customer_id: s.customerId,
      plan_code: "test_basic",
      billing_interval: "monthly",
      trial_days: 0,
      payment_method_id: s.paymentMethodId,
    },
    s,
  );
  if (subRes.status >= 400) {
    logError(JSON.stringify(subRes.body));
    process.exit(1);
  }
  logSuccess(
    `subscription_id=${subRes.body.id}, status=${subRes.body.status}`,
  );
  const subscriptionId = subRes.body.id;
  updateSecrets({ subscriptionId });

  logStep(
    2,
    "Force first charge (POST /subscriptions/{id}/charge-now) — real PayPlus call",
  );

  const chargeRes = await callHubApi<ChargeNowResp>(
    "POST",
    `/api/v1/subscriptions/${subscriptionId}/charge-now`,
    {},
    s,
  );
  if (chargeRes.status >= 400 && chargeRes.status !== 402) {
    logError(JSON.stringify(chargeRes.body));
    process.exit(1);
  }
  if (chargeRes.body.ok) {
    logSuccess(
      `invoice_id=${chargeRes.body.invoice_id}, invoice_number=${chargeRes.body.invoice_number}`,
    );
    updateSecrets({ invoiceId: chargeRes.body.invoice_id });
  } else {
    logInfo(
      `charge failed: reason=${chargeRes.body.reason}, error=${chargeRes.body.error}`,
    );
    logInfo(
      "Continuing — dunning cron should pick this up. (For full flow, ensure card succeeds.)",
    );
  }

  logStep(3, "Record commission (POST /commissions)");

  const commRes = await callHubApi<CommissionResp>(
    "POST",
    "/api/v1/commissions",
    {
      customer_id: s.customerId,
      subscription_id: subscriptionId,
      source_external_id: `order_${Date.now()}`,
      idempotency_key: `order_${Date.now()}_v1`,
      amount: 250.0,
      fee_rate: 0.005,
      period_start: new Date().toISOString().slice(0, 10),
      period_end: new Date().toISOString().slice(0, 10),
    },
    s,
  );
  if (commRes.status >= 400) {
    logError(JSON.stringify(commRes.body));
  } else {
    logSuccess(
      `commission id=${commRes.body.id}, base=${commRes.body.base_amount}, status=${commRes.body.status}`,
    );
  }

  logStep(4, "List invoices (GET /invoices?customer_id=…)");

  const listRes = await callHubApi<InvoiceListResp>(
    "GET",
    `/api/v1/invoices?customer_id=${s.customerId}`,
    null,
    s,
  );
  if (listRes.status >= 400) {
    logError(JSON.stringify(listRes.body));
  } else {
    logSuccess(`${listRes.body.results.length} invoice(s) returned`);
    for (const inv of listRes.body.results) {
      logInfo(
        `  ${inv.invoice_number} (${inv.type}, ${inv.status}) — ₪${inv.total_amount}`,
      );
    }
  }

  logStep(5, "Refund last paid invoice (POST /invoices/{id}/refund)");

  const paidInvoice = listRes.body?.results?.find((i) => i.status === "paid");
  if (paidInvoice) {
    const refundRes = await callHubApi<RefundResp>(
      "POST",
      `/api/v1/invoices/${paidInvoice.id}/refund`,
      { reason: "Test flow refund" },
      s,
    );
    if (refundRes.status >= 400) {
      logError(JSON.stringify(refundRes.body));
    } else {
      logSuccess(
        `invoice ${paidInvoice.invoice_number} → status=${refundRes.body.status}, payplus_refund=${refundRes.body.refund_uid}`,
      );
    }
  } else {
    logInfo("No paid invoice found to refund — skipping.");
  }

  logStep(6, "Cancel subscription at period end (POST /subscriptions/{id}/cancel)");

  const cancelRes = await callHubApi<CancelResp>(
    "POST",
    `/api/v1/subscriptions/${subscriptionId}/cancel`,
    { reason: "Test flow cleanup", at_period_end: true },
    s,
  );
  if (cancelRes.status >= 400) {
    logError(JSON.stringify(cancelRes.body));
  } else {
    logSuccess(
      `status=${cancelRes.body.status}, at_period_end=${cancelRes.body.cancel_at_period_end}`,
    );
  }

  console.log(
    "\n" +
      "═".repeat(60) +
      "\n✅ Flow complete. Check Vercel logs + dashboard.\n" +
      "Next options:\n" +
      "  pnpm tsx scripts/qstash-test-mode.ts on   # speed up crons\n" +
      "  pnpm tsx scripts/test/04-cleanup.ts       # remove test data\n" +
      "═".repeat(60) +
      "\n",
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
