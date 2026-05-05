import type { PayPlusResponse } from "./types";

export const PAYPLUS_CONFIG = {
  apiUrl:
    process.env.PAYPLUS_API_URL || "https://restapidev.payplus.co.il/api/v1.0",
  apiKey: process.env.PAYPLUS_API_KEY || "",
  secretKey: process.env.PAYPLUS_SECRET_KEY || "",
  terminalUid: process.env.PAYPLUS_TERMINAL_UID || "",
  cashierUid: process.env.PAYPLUS_CASHIER_UID || "",
  paymentPageUid: process.env.PAYPLUS_PAYMENT_PAGE_UID || "",
} as const;

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
