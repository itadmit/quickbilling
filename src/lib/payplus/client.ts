import type { PayPlusResponse } from "./types";

/**
 * PayPlus credential resolution.
 *
 * The .env file holds two sets of keys side-by-side:
 *   - `PAYPLUS_*`        → production (restapi.payplus.co.il)
 *   - `PAYPLUS_*_dev`    → staging/dev (restapidev.payplus.co.il)
 *
 * Selection rule:
 *   - In production builds (Vercel deploys, NODE_ENV=production) → use prod keys.
 *   - In dev (localhost, NODE_ENV=development|test) → use `_dev` keys.
 *
 * Override at runtime by setting `PAYPLUS_FORCE_ENV=production|dev`.
 */
function pickPayPlusEnv(): "prod" | "dev" {
  const forced = process.env.PAYPLUS_FORCE_ENV?.toLowerCase();
  if (forced === "production" || forced === "prod") return "prod";
  if (forced === "dev" || forced === "staging") return "dev";
  return process.env.NODE_ENV === "production" ? "prod" : "dev";
}

const ENV = pickPayPlusEnv();
const SUFFIX = ENV === "dev" ? "_dev" : "";

function envOr(name: string, fallback = ""): string {
  return process.env[name] || fallback;
}

export const PAYPLUS_CONFIG = {
  env: ENV,
  apiUrl:
    envOr(`PAYPLUS_API_URL${SUFFIX}`) ||
    (ENV === "dev"
      ? "https://restapidev.payplus.co.il/api/v1.0"
      : "https://restapi.payplus.co.il/api/v1.0"),
  apiKey: envOr(`PAYPLUS_API_KEY${SUFFIX}`),
  secretKey: envOr(`PAYPLUS_SECRET_KEY${SUFFIX}`),
  terminalUid: envOr(`PAYPLUS_TERMINAL_UID${SUFFIX}`),
  cashierUid: envOr(`PAYPLUS_CASHIER_UID${SUFFIX}`),
  paymentPageUid: envOr(`PAYPLUS_PAYMENT_PAGE_UID${SUFFIX}`),
} as const;

if (process.env.NODE_ENV !== "test") {
  // eslint-disable-next-line no-console
  console.log(
    `[PayPlus] using ${ENV} credentials → ${PAYPLUS_CONFIG.apiUrl}`,
  );
}

export class PayPlusError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly description?: string,
    readonly raw?: unknown,
  ) {
    super(message);
    this.name = "PayPlusError";
  }
}

export async function payplusRequest<T>(
  endpoint: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
): Promise<PayPlusResponse<T>> {
  const url = `${PAYPLUS_CONFIG.apiUrl}/${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "api-key": PAYPLUS_CONFIG.apiKey,
      "secret-key": PAYPLUS_CONFIG.secretKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new PayPlusError(
      `PayPlus ${method} ${endpoint} failed: ${response.status}`,
      response.status,
      text,
    );
  }

  return response.json() as Promise<PayPlusResponse<T>>;
}
