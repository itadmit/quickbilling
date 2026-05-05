import crypto from "node:crypto";
import { and, eq, lte, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  webhookDeliveries,
  webhookEndpoints,
  type WebhookEndpoint,
} from "../db/schema";
import type { WebhookEvent } from "./events";

const RETRY_DELAYS_MS = [
  60_000, // 1 minute
  5 * 60_000, // 5 minutes
  30 * 60_000, // 30 minutes
  2 * 60 * 60_000, // 2 hours
  12 * 60 * 60_000, // 12 hours
];

/**
 * Enqueue a webhook event for delivery to all subscribed endpoints of the
 * product. The cron `webhook-retry` job picks up pending/failed deliveries.
 *
 * Caller does NOT need to await delivery — it's queued.
 */
export async function emitWebhook(params: {
  productId: string;
  eventType: WebhookEvent;
  payload: object;
}): Promise<void> {
  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.productId, params.productId),
        eq(webhookEndpoints.active, true),
      ),
    );

  const matching = endpoints.filter((e) => e.events.includes(params.eventType));
  if (matching.length === 0) return;

  await db.insert(webhookDeliveries).values(
    matching.map((e) => ({
      endpointId: e.id,
      eventType: params.eventType,
      payload: { event: params.eventType, ...params.payload },
      status: "pending" as const,
      retryCount: 0,
      maxRetries: RETRY_DELAYS_MS.length,
      nextRetryAt: new Date(),
    })),
  );
}

function signPayload(secret: string, payload: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
}

/**
 * Drain pending/retrying deliveries whose nextRetryAt <= now.
 * Returns counters for the cron handler.
 */
export async function drainWebhookQueue(): Promise<{
  attempted: number;
  delivered: number;
  retrying: number;
  dead: number;
}> {
  const now = new Date();

  const due = await db
    .select({
      delivery: webhookDeliveries,
      endpoint: webhookEndpoints,
    })
    .from(webhookDeliveries)
    .innerJoin(
      webhookEndpoints,
      eq(webhookDeliveries.endpointId, webhookEndpoints.id),
    )
    .where(
      and(
        or(
          eq(webhookDeliveries.status, "pending"),
          eq(webhookDeliveries.status, "failed"),
        ),
        lte(webhookDeliveries.nextRetryAt, now),
      ),
    )
    .limit(200);

  let delivered = 0;
  let retrying = 0;
  let dead = 0;

  for (const { delivery, endpoint } of due) {
    const result = await attemptDelivery(delivery, endpoint);
    if (result === "delivered") delivered++;
    else if (result === "dead") dead++;
    else retrying++;
  }

  return {
    attempted: due.length,
    delivered,
    retrying,
    dead,
  };
}

async function attemptDelivery(
  delivery: typeof webhookDeliveries.$inferSelect,
  endpoint: WebhookEndpoint,
): Promise<"delivered" | "retrying" | "dead"> {
  const body = JSON.stringify(delivery.payload);
  const signature = signPayload(endpoint.secret, body);

  let responseStatus = 0;
  let responseBody = "";
  let networkError: string | null = null;

  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Quickcommerce-Signature": signature,
        "X-Quickcommerce-Event": delivery.eventType,
        "X-Quickcommerce-Delivery-Id": delivery.id,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    responseStatus = res.status;
    responseBody = (await res.text().catch(() => "")).slice(0, 2000);
  } catch (err) {
    networkError = err instanceof Error ? err.message : "Unknown";
  }

  const ok = responseStatus >= 200 && responseStatus < 300;
  if (ok) {
    await db
      .update(webhookDeliveries)
      .set({
        status: "delivered",
        responseStatus,
        responseBody,
        deliveredAt: new Date(),
        lastAttemptedAt: new Date(),
      })
      .where(eq(webhookDeliveries.id, delivery.id));
    return "delivered";
  }

  const nextRetryCount = delivery.retryCount + 1;
  if (nextRetryCount >= delivery.maxRetries) {
    await db
      .update(webhookDeliveries)
      .set({
        status: "dead",
        retryCount: nextRetryCount,
        responseStatus,
        responseBody: networkError ?? responseBody,
        lastAttemptedAt: new Date(),
      })
      .where(eq(webhookDeliveries.id, delivery.id));
    return "dead";
  }

  const delayMs = RETRY_DELAYS_MS[nextRetryCount - 1] ?? 12 * 60 * 60_000;
  await db
    .update(webhookDeliveries)
    .set({
      status: "failed",
      retryCount: nextRetryCount,
      responseStatus,
      responseBody: networkError ?? responseBody,
      lastAttemptedAt: new Date(),
      nextRetryAt: new Date(Date.now() + delayMs),
    })
    .where(eq(webhookDeliveries.id, delivery.id));
  return "retrying";
}
