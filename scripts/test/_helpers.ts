/**
 * Shared helpers for the test scripts.
 * Reads .test-secrets.json (gitignored) so phases can hand off.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SECRETS_FILE = ".test-secrets.json";

export interface TestSecrets {
  apiBase: string;
  productId: string;
  productSlug: string;
  apiKey: string;
  webhookSecret: string;
  customerId?: string;
  setupSessionId?: string;
  paymentMethodId?: string;
  subscriptionId?: string;
  invoiceId?: string;
  invoiceTransactionUid?: string;
  planCodes: string[];
}

export function readSecrets(): TestSecrets {
  if (!existsSync(SECRETS_FILE)) {
    console.error(`❌ ${SECRETS_FILE} not found. Run phase 1 first:`);
    console.error("   pnpm tsx scripts/test/01-setup.ts");
    process.exit(1);
  }
  return JSON.parse(readFileSync(SECRETS_FILE, "utf-8"));
}

export function writeSecrets(s: TestSecrets) {
  writeFileSync(SECRETS_FILE, JSON.stringify(s, null, 2));
}

export function updateSecrets(patch: Partial<TestSecrets>): TestSecrets {
  const s = { ...readSecrets(), ...patch };
  writeSecrets(s);
  return s;
}

export function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

export function newApiKey(): string {
  return `qcb_${randomHex(24)}`;
}

export function newWebhookSecret(): string {
  return `whsec_${randomHex(24)}`;
}

/** SHA-256 over a string, hex. */
export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * Make an HMAC-signed call to our /api/v1 endpoints — same headers
 * a product-side helper would send.
 */
export async function callHubApi<T = unknown>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body: object | null,
  s: TestSecrets,
): Promise<{ status: number; body: T }> {
  const rawBody = body ? JSON.stringify(body) : "";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", s.webhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${s.apiKey}`,
    "X-Product-Id": s.productSlug,
    "X-Signature": signature,
    "X-Timestamp": timestamp,
  };
  if (method !== "GET") {
    headers["X-Idempotency-Key"] = randomUUID();
  }

  const res = await fetch(`${s.apiBase}${path}`, {
    method,
    headers,
    body: rawBody || undefined,
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed as T };
}

export function logStep(n: number, label: string) {
  console.log("\n" + "═".repeat(60));
  console.log(`Step ${n}. ${label}`);
  console.log("═".repeat(60));
}

export function logSuccess(msg: string) {
  console.log("  ✓ " + msg);
}

export function logInfo(msg: string) {
  console.log("  · " + msg);
}

export function logError(msg: string) {
  console.error("  ✗ " + msg);
}

export async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export function prompt(label: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(label);
    process.stdin.resume();
    process.stdin.setEncoding("utf-8");
    process.stdin.once("data", (data) => {
      process.stdin.pause();
      resolve(String(data).trim());
    });
  });
}
