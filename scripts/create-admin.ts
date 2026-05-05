import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { staffUsers } from "../src/lib/db/schema";

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4] ?? null;

  if (!email || !password) {
    console.error("usage: tsx scripts/create-admin.ts <email> <password> [name]");
    process.exit(1);
  }

  // Make sure the column exists (idempotent — drizzle-kit push needs a TTY).
  await db.execute(
    sql`ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "password_hash" varchar(255)`,
  );

  const passwordHash = await bcrypt.hash(password, 10);
  const normalizedEmail = email.trim().toLowerCase();

  const [existing] = await db
    .select()
    .from(staffUsers)
    .where(eq(staffUsers.email, normalizedEmail))
    .limit(1);

  if (existing) {
    await db
      .update(staffUsers)
      .set({
        passwordHash,
        name: name ?? existing.name,
        role: "admin",
        active: true,
        updatedAt: new Date(),
      })
      .where(eq(staffUsers.id, existing.id));
    console.log(`✓ Updated admin: ${normalizedEmail}`);
  } else {
    await db.insert(staffUsers).values({
      email: normalizedEmail,
      name,
      passwordHash,
      role: "admin",
      active: true,
    });
    console.log(`✓ Created admin: ${normalizedEmail}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
