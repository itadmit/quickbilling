/**
 * Register all cron schedules with Upstash QStash.
 *
 * Run AFTER the Hub is deployed and reachable at a public URL:
 *
 *   APP_URL="https://your-domain.vercel.app" pnpm tsx scripts/setup-qstash-schedules.ts
 *
 * Idempotent: if a schedule with the same destination URL already exists,
 * QStash updates it. Re-running this with a new APP_URL after a domain
 * change will create new schedules — delete the old ones via the Upstash UI.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { Client } from "@upstash/qstash";

interface ScheduleSpec {
  name: string;
  path: string;
  cron: string;
  description: string;
}

const SCHEDULES: ScheduleSpec[] = [
  {
    name: "metrics-rollup",
    path: "/api/cron/metrics-rollup",
    cron: "0 1 * * *",
    description: "01:00 — MRR/ARR/churn snapshot",
  },
  {
    name: "daily-billing-run",
    path: "/api/cron/daily-billing-run",
    cron: "0 2 * * *",
    description: "02:00 — renew due subscriptions",
  },
  {
    name: "commission-flush",
    path: "/api/cron/commission-flush",
    cron: "0 3 1,15 * *",
    description: "03:00 on 1st + 15th — invoice pending commissions",
  },
  {
    name: "dunning-retry",
    path: "/api/cron/dunning-retry",
    cron: "0 4 * * *",
    description: "04:00 — retry past_due charges (1/3/7 day policy)",
  },
  {
    name: "trial-expiry",
    path: "/api/cron/trial-expiry",
    cron: "0 5 * * *",
    description: "05:00 — finalize ended trials",
  },
  {
    name: "webhook-drain",
    path: "/api/cron/webhook-drain",
    cron: "*/5 * * * *",
    description: "every 5min — drain outbound webhook queue",
  },
];

async function main() {
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(
    /\/$/,
    "",
  );
  const token = process.env.QSTASH_TOKEN;

  if (!appUrl) {
    console.error("APP_URL or NEXT_PUBLIC_APP_URL is required");
    console.error('  e.g.  APP_URL="https://billing.my-quickshop.com" pnpm tsx scripts/setup-qstash-schedules.ts');
    process.exit(1);
  }
  if (!token) {
    console.error("QSTASH_TOKEN is not set in .env.local");
    process.exit(1);
  }
  if (appUrl.startsWith("http://localhost") || appUrl.includes("127.0.0.1")) {
    console.error("⚠️  APP_URL is localhost — QStash cannot call this from the public internet.");
    console.error("    Deploy to Vercel first, then re-run with the public URL.");
    process.exit(1);
  }

  const qstash = new Client({ token });
  const schedules = qstash.schedules;

  console.log(`📡 Registering schedules against ${appUrl}\n`);

  // List existing schedules so we can update / skip duplicates.
  const existing = await schedules.list();
  const existingByDest = new Map(
    existing.map((s) => [s.destination, s] as const),
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const s of SCHEDULES) {
    const destination = `${appUrl}${s.path}`;
    const found = existingByDest.get(destination);

    if (found) {
      if (found.cron === s.cron) {
        console.log(`  ⏭️  ${s.name}: already exists with same cron`);
        skipped++;
        continue;
      }
      // Recreate to update cron (QStash schedules are immutable).
      await schedules.delete(found.scheduleId);
      await schedules.create({
        destination,
        cron: s.cron,
      });
      console.log(`  🔄 ${s.name}: updated (${found.cron} → ${s.cron})`);
      updated++;
      continue;
    }

    await schedules.create({
      destination,
      cron: s.cron,
    });
    console.log(`  ✓ ${s.name}: ${s.cron}  → ${destination}`);
    console.log(`      ${s.description}`);
    created++;
  }

  console.log();
  console.log("─".repeat(50));
  console.log(`Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
  console.log("─".repeat(50));
  console.log();
  console.log("View in console: https://console.upstash.com/qstash");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
