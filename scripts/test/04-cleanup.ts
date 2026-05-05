/**
 * Phase 4 — wipe test customer + subscription + invoices + commission_charges
 * + payment_method (the project itself stays so re-running is fast).
 */
import { Pool } from "@neondatabase/serverless";
import { unlinkSync, existsSync } from "node:fs";
import { readSecrets, logStep, logSuccess } from "./_helpers";

async function main() {
  const s = readSecrets();
  console.log(`\n🧹 Cleanup phase\n`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  if (s.customerId) {
    logStep(1, `Delete dependent rows for customer ${s.customerId}`);
    // Delete in FK-safe order
    await pool.query(
      "UPDATE invoices SET subscription_id=NULL WHERE customer_id=$1",
      [s.customerId],
    );
    await pool.query("DELETE FROM charges WHERE invoice_id IN (SELECT id FROM invoices WHERE customer_id=$1)", [s.customerId]);
    await pool.query("DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE customer_id=$1)", [s.customerId]);
    const inv = await pool.query("DELETE FROM invoices WHERE customer_id=$1", [s.customerId]);
    logSuccess(`invoices: ${inv.rowCount}`);
    const cc = await pool.query("DELETE FROM commission_charges WHERE customer_id=$1", [s.customerId]);
    logSuccess(`commission_charges: ${cc.rowCount}`);
    const sub = await pool.query("DELETE FROM subscriptions WHERE customer_id=$1", [s.customerId]);
    logSuccess(`subscriptions: ${sub.rowCount}`);
    const sess = await pool.query("DELETE FROM payment_method_setup_sessions WHERE customer_id=$1", [s.customerId]);
    logSuccess(`setup_sessions: ${sess.rowCount}`);
    const pm = await pool.query("DELETE FROM payment_methods WHERE customer_id=$1", [s.customerId]);
    logSuccess(`payment_methods: ${pm.rowCount}`);
    const link = await pool.query("DELETE FROM customer_product_links WHERE customer_id=$1", [s.customerId]);
    logSuccess(`customer_product_links: ${link.rowCount}`);
    const c = await pool.query("DELETE FROM customers WHERE id=$1", [s.customerId]);
    logSuccess(`customers: ${c.rowCount}`);
  }

  await pool.end();

  if (existsSync(".test-secrets.json")) {
    unlinkSync(".test-secrets.json");
    logSuccess(".test-secrets.json removed");
  }

  console.log("\n✅ Cleanup done. Project 'quicktest' kept (rerun phase 1 to use again).\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
