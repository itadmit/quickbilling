import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { db } from '../../src/lib/db/client';
import { products, subscriptions } from '../../src/lib/db/schema';
import { sql } from 'drizzle-orm';

async function main() {
  const rows = await db.select({
    product: products,
    subCount: sql<number>`(SELECT COUNT(*)::int FROM ${subscriptions} WHERE ${subscriptions.productId} = ${products.id} AND ${subscriptions.status} IN ('active','trial','past_due'))`,
  }).from(products);

  console.log('---PRODUCTS---');
  console.log(JSON.stringify(rows.map(r => ({ name: r.product.name, slug: r.product.slug, id: r.product.id, subCount: r.subCount })), null, 2));

  const subs = await db.select().from(subscriptions);
  console.log('---ALL SUBS---');
  console.log(JSON.stringify(subs.map(s => ({ id: s.id, productId: s.productId, status: s.status })), null, 2));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
