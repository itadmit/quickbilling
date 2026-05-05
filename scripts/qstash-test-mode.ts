/**
 * Speed up all QStash schedules to fire every minute, or restore them
 * to the production cadence.
 *
 *   pnpm tsx scripts/qstash-test-mode.ts on
 *   pnpm tsx scripts/qstash-test-mode.ts off
 *
 * "off" calls the same logic as scripts/setup-qstash-schedules.ts —
 * deletes existing schedules and recreates with the production crons.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { Client } from "@upstash/qstash";

const APP_URL = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "")
  .replace(/\/$/, "");

interface ScheduleSpec {
  name: string;
  path: string;
  cron: string;
}

const PROD_SCHEDULES: ScheduleSpec[] = [
  { name: "metrics-rollup", path: "/api/cron/metrics-rollup", cron: "0 1 * * *" },
  { name: "daily-billing-run", path: "/api/cron/daily-billing-run", cron: "0 2 * * *" },
  { name: "commission-flush", path: "/api/cron/commission-flush", cron: "0 3 1,15 * *" },
  { name: "dunning-retry", path: "/api/cron/dunning-retry", cron: "0 4 * * *" },
  { name: "trial-expiry", path: "/api/cron/trial-expiry", cron: "0 5 * * *" },
  { name: "webhook-drain", path: "/api/cron/webhook-drain", cron: "*/5 * * * *" },
];

// Test mode: every minute. Deliberately stagger them by 0/1/2/... seconds
// would be nice but QStash min granularity is per minute.
const TEST_SCHEDULES: ScheduleSpec[] = PROD_SCHEDULES.map((s) => ({
  ...s,
  cron: "* * * * *",
}));

async function reconcileSchedules(target: ScheduleSpec[], appUrl: string) {
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error("QSTASH_TOKEN missing in .env.local");
  if (!appUrl) throw new Error("APP_URL or NEXT_PUBLIC_APP_URL missing");

  const qstash = new Client({ token }).schedules;

  const existing = await qstash.list();

  // Delete any schedule whose destination starts with our app URL — we will
  // recreate with the desired cron list. (Schedules are immutable.)
  let deleted = 0;
  for (const s of existing) {
    if (s.destination.startsWith(appUrl)) {
      await qstash.delete(s.scheduleId);
      deleted++;
    }
  }
  console.log(`  removed ${deleted} existing schedule(s)`);

  // Recreate fresh
  let created = 0;
  for (const s of target) {
    const destination = `${appUrl}${s.path}`;
    await qstash.create({ destination, cron: s.cron });
    console.log(`  + ${s.name.padEnd(20)} ${s.cron.padEnd(15)} → ${destination}`);
    created++;
  }
  console.log(`\n✓ ${created} schedule(s) active`);
}

async function main() {
  const mode = (process.argv[2] || "").toLowerCase();
  if (!["on", "off"].includes(mode)) {
    console.error("Usage:");
    console.error("  pnpm tsx scripts/qstash-test-mode.ts on    # every-minute");
    console.error("  pnpm tsx scripts/qstash-test-mode.ts off   # production cadence");
    process.exit(1);
  }
  if (!APP_URL) {
    console.error("APP_URL or NEXT_PUBLIC_APP_URL is required.");
    process.exit(1);
  }

  console.log(
    `\n🔧 QStash schedules → ${mode === "on" ? "TEST MODE (every minute)" : "PRODUCTION cadence"}`,
  );
  console.log(`  app: ${APP_URL}\n`);

  await reconcileSchedules(mode === "on" ? TEST_SCHEDULES : PROD_SCHEDULES, APP_URL);

  if (mode === "on") {
    console.log(
      "\n⏱️  Crons fire every minute now. Watch Vercel logs.\n   Run `qstash-test-mode.ts off` when done.",
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
