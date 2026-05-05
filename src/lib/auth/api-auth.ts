import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { products, type Product } from "../db/schema";

const TIMESTAMP_TOLERANCE_SECONDS = 300; // ±5 minutes

export class ApiAuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiAuthError";
  }
}

export interface AuthenticatedRequest {
  product: Product;
  rawBody: string;
  parsedBody: unknown;
  idempotencyKey: string | null;
  url: URL;
  method: string;
  headers: Headers;
}

/**
 * Authenticate an incoming product API request.
 *
 * Required headers:
 *  - Authorization: Bearer <api_key>
 *  - X-Product-Id: <product slug>
 *  - X-Signature: hmac_sha256(`${timestamp}.${body}`, product.webhook_secret) — hex
 *  - X-Timestamp: unix seconds (±5 min tolerance)
 *  - X-Idempotency-Key: required for POST/PATCH/PUT/DELETE (UUID)
 *
 * Validates everything in constant time where possible. Throws ApiAuthError
 * which is converted to a JSON 401/400 response by the route handler.
 */
export async function authenticateProductRequest(
  request: Request,
): Promise<AuthenticatedRequest> {
  const auth = request.headers.get("authorization") || "";
  const productSlug = request.headers.get("x-product-id") || "";
  const signature = request.headers.get("x-signature") || "";
  const timestamp = request.headers.get("x-timestamp") || "";
  const idempotencyKey = request.headers.get("x-idempotency-key");

  if (!auth.toLowerCase().startsWith("bearer ")) {
    throw new ApiAuthError(401, "MISSING_BEARER", "Authorization header missing");
  }
  const apiKey = auth.slice(7).trim();
  if (!apiKey) {
    throw new ApiAuthError(401, "MISSING_API_KEY", "Empty API key");
  }
  if (!productSlug) {
    throw new ApiAuthError(401, "MISSING_PRODUCT_ID", "X-Product-Id header missing");
  }

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.slug, productSlug))
    .limit(1);

  if (!product || !product.active) {
    throw new ApiAuthError(401, "INVALID_PRODUCT", "Unknown or disabled product");
  }

  const apiKeyOk = await bcrypt.compare(apiKey, product.apiKeyHash);
  if (!apiKeyOk) {
    throw new ApiAuthError(401, "INVALID_API_KEY", "API key mismatch");
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    throw new ApiAuthError(401, "BAD_TIMESTAMP", "X-Timestamp invalid");
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > TIMESTAMP_TOLERANCE_SECONDS) {
    throw new ApiAuthError(401, "STALE_TIMESTAMP", "Request timestamp outside tolerance");
  }

  const rawBody = await request.text();

  if (!signature) {
    throw new ApiAuthError(401, "MISSING_SIGNATURE", "X-Signature missing");
  }
  const expected = crypto
    .createHmac("sha256", product.webhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new ApiAuthError(401, "INVALID_SIGNATURE", "Signature mismatch");
  }

  const method = request.method.toUpperCase();
  if (
    ["POST", "PATCH", "PUT", "DELETE"].includes(method) &&
    !idempotencyKey
  ) {
    throw new ApiAuthError(
      400,
      "MISSING_IDEMPOTENCY_KEY",
      "X-Idempotency-Key header required for mutations",
    );
  }

  let parsedBody: unknown = null;
  if (rawBody.length > 0) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      throw new ApiAuthError(400, "INVALID_JSON", "Body is not valid JSON");
    }
  }

  return {
    product,
    rawBody,
    parsedBody,
    idempotencyKey,
    url: new URL(request.url),
    method: request.method.toUpperCase(),
    headers: request.headers,
  };
}

/**
 * Generate a fresh API key + return both the plaintext (to show user once) and the bcrypt hash (to store).
 */
export async function generateApiKey(): Promise<{ key: string; hash: string }> {
  const key = `qcb_${crypto.randomBytes(24).toString("hex")}`;
  const hash = await bcrypt.hash(key, 10);
  return { key, hash };
}

export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString("hex")}`;
}
