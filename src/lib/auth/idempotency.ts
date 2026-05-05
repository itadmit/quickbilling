import crypto from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { db } from "../db/client";
import { idempotencyKeys } from "../db/schema";

const DEFAULT_TTL_HOURS = 24;

export function hashRequest(rawBody: string): string {
  return crypto.createHash("sha256").update(rawBody).digest("hex");
}

/**
 * Check if a previous request with this idempotency key already succeeded.
 * Returns the stored response if so. Throws if a key was used with a
 * different body (key collision).
 */
export async function lookupIdempotency(params: {
  key: string;
  productId: string;
  rawBody: string;
}): Promise<{
  status: number;
  body: unknown;
} | null> {
  const [row] = await db
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.key, params.key),
        eq(idempotencyKeys.productId, params.productId),
      ),
    )
    .limit(1);

  if (!row) return null;

  if (row.expiresAt < new Date()) return null;

  const requestHash = hashRequest(params.rawBody);
  if (row.requestHash !== requestHash) {
    const err = new Error(
      "Idempotency key reused with a different request body",
    );
    (err as Error & { code?: string }).code = "IDEMPOTENCY_MISMATCH";
    throw err;
  }

  if (row.responseStatus == null) {
    return null;
  }

  return {
    status: row.responseStatus,
    body: row.responseBody,
  };
}

/**
 * Store the result of a request keyed by idempotency-key.
 * Call after the work has finished successfully (or with the final
 * deterministic failure status). Subsequent calls with the same key
 * return the cached response.
 */
export async function storeIdempotency(params: {
  key: string;
  productId: string;
  rawBody: string;
  responseStatus: number;
  responseBody: unknown;
  ttlHours?: number;
}): Promise<void> {
  const expiresAt = new Date(
    Date.now() + (params.ttlHours ?? DEFAULT_TTL_HOURS) * 60 * 60 * 1000,
  );
  const requestHash = hashRequest(params.rawBody);

  await db
    .insert(idempotencyKeys)
    .values({
      key: params.key,
      productId: params.productId,
      requestHash,
      responseStatus: params.responseStatus,
      responseBody: params.responseBody as object,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: idempotencyKeys.key,
      set: {
        responseStatus: params.responseStatus,
        responseBody: params.responseBody as object,
        expiresAt,
      },
    });
}

/** Periodic cleanup, run from cron. */
export async function purgeExpiredIdempotency(): Promise<number> {
  const result = await db
    .delete(idempotencyKeys)
    .where(lt(idempotencyKeys.expiresAt, new Date()))
    .returning({ key: idempotencyKeys.key });
  return result.length;
}
