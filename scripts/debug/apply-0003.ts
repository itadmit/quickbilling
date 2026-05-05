import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { Pool } from '@neondatabase/serverless';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "total_payments" integer`);
  await pool.query(`ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "payments_charged" integer DEFAULT 0 NOT NULL`);
  console.log('OK — total_payments and payments_charged added');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
