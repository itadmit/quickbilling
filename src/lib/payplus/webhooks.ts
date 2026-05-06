import crypto from "node:crypto";
import { PAYPLUS_CONFIG } from "./client";

/**
 * Verify a PayPlus callback as documented at
 * https://docs.payplus.co.il/reference/validate-requests-received-from-payplus
 *
 * PayPlus sends:
 *   - header `hash` = base64(HMAC-SHA256(JSON.stringify(body), secret_key))
 *   - header `user-agent` = "PayPlus"
 */
export function verifyPayPlusCallback(
  rawBody: string,
  hashHeader: string | null | undefined,
  userAgent: string | null | undefined,
): boolean {
  if (!hashHeader) return false;
  if (userAgent !== "PayPlus") return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return false;
  }

  const message = JSON.stringify(parsed);
  const expected = crypto
    .createHmac("sha256", PAYPLUS_CONFIG.secretKey)
    .update(message)
    .digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(hashHeader);
  if (a.length !== b.length) {
    return verifyOverRawBody(rawBody, hashHeader);
  }
  return crypto.timingSafeEqual(a, b) || verifyOverRawBody(rawBody, hashHeader);
}

function verifyOverRawBody(rawBody: string, hashHeader: string): boolean {
  const expected = crypto
    .createHmac("sha256", PAYPLUS_CONFIG.secretKey)
    .update(rawBody)
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(hashHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * IPN callback shape (refURL_callback, server-to-server).
 * Nested: transaction + data + invoice are top-level keys.
 *
 * Per Transaction Callback Response docs.
 */
export interface PayPlusIpnPayload {
  transaction_type?: string; // "Charge" | "Refund"

  transaction?: {
    uid?: string;
    payment_request_uid?: string;
    /** Tokenization callbacks use this name (page-mediated J2/J5 token-only). */
    payment_page_request_uid?: string;
    number?: string;
    type?: string;
    date?: string;
    status_code?: string;
    amount?: number | string;
    currency?: string;
    credit_terms?: string;
    payments?: {
      number_of_payments?: number;
      first_payment_amount?: number;
      rest_payments_amount?: number;
    };
    secure3D?: { status?: boolean | null; tracking?: unknown };
    approval_number?: string;
    voucher_number?: string;
    more_info?: string;
    more_info_1?: string;
    more_info_2?: string;
    more_info_3?: string;
    more_info_4?: string;
    more_info_5?: string;
    recurring_charge_information?: {
      recurring_uid?: string;
      charge_uid?: string;
    };
  };

  data?: {
    customer_uid?: string;
    terminal_uid?: string;
    cashier_uid?: string;
    items?: Array<Record<string, unknown>>;
    card_information?: {
      card_holder_name?: string;
      four_digits?: string;
      expiry_month?: string;
      expiry_year?: string;
      clearing_id?: number;
      brand_id?: number;
      issuer_id?: number;
      card_foreign?: number;
      card_bin?: string;
      identification_number?: string;
      /** Present after tokenization (charge_method=5 or create_token=true). */
      token?: string;
    };
    /** Base64-encoded customer details (when create_hash=true). */
    hash_data?: string;
  };

  invoice?: {
    uuid?: string;
    docu_number?: string;
    original_url?: string;
    copy_url?: string;
    integrator_name?: string;
    status?: string;
    brand_name?: string;
  };

  [key: string]: unknown;
}

/**
 * Browser-redirect payload shape (refURL_success/refURL_failure).
 * FLAT — all fields top-level. Different from IPN!
 */
export interface PayPlusRedirectPayload {
  transaction_uid?: string;
  page_request_uid?: string;
  type?: string;
  method?: string;
  status?: string; // "approved" | "rejected"
  status_code?: string; // "000" success
  status_description?: string;
  amount?: number | string;
  currency?: string;
  approval_num?: string;
  voucher_num?: string;
  customer_uid?: string;
  customer_email?: string;
  customer_name?: string;
  identification_number?: string;
  four_digits?: string;
  expiry_month?: string;
  expiry_year?: string;
  card_holder_name?: string;
  card_bin?: string;
  brand_id?: number;
  brand_name?: string;
  issuer_id?: number;
  issuer_name?: string;
  more_info?: string;
  more_info_1?: string;
  [key: string]: unknown;
}

/**
 * Brand id → name map (PayPlus dictionary).
 * Reference: Dictionary/Brands List endpoint.
 */
const BRAND_BY_ID: Record<number, string> = {
  1: "isracard",
  2: "mastercard",
  3: "visa",
  4: "diners",
  5: "amex",
  6: "discover",
  7: "jcb",
  8: "leumi",
  10: "maestro",
};

export function brandNameFromId(id?: number | string): string | undefined {
  if (id == null) return undefined;
  const n = typeof id === "string" ? parseInt(id, 10) : id;
  return Number.isFinite(n) ? BRAND_BY_ID[n as number] : undefined;
}

/**
 * Normalized view of either an IPN or a redirect payload, so callers
 * don't have to know which shape they got.
 */
export interface NormalizedPayPlusEvent {
  transactionUid?: string;
  pageRequestUid?: string;
  statusCode?: string;
  status?: string;
  isSuccess: boolean;
  transactionType?: string;
  amount?: number;
  currency?: string;
  customerUid?: string;
  cardLast4?: string;
  cardExpiryMonth?: string;
  cardExpiryYear?: string;
  cardBrand?: string;
  cardHolderName?: string;
  tokenUid?: string;
  approvalNumber?: string;
  voucherNumber?: string;
  moreInfo1?: string;
  moreInfoAll?: string[];
  invoiceUuid?: string;
  invoiceNumber?: string;
  invoiceUrl?: string;
  raw: unknown;
}

export function normalizePayPlusEvent(
  payload: PayPlusIpnPayload & PayPlusRedirectPayload,
): NormalizedPayPlusEvent {
  // Detect IPN (nested) vs redirect (flat) by presence of `transaction` object.
  const isIpn = !!payload.transaction;

  const t = payload.transaction;
  const d = payload.data;
  const ci = d?.card_information;

  const statusCode = isIpn ? t?.status_code : payload.status_code;
  const status = payload.status;
  const isSuccess = status === "approved" || statusCode === "000";

  const brandId = isIpn ? ci?.brand_id : payload.brand_id;
  const cardBrand =
    (!isIpn && payload.brand_name) || brandNameFromId(brandId);

  const transactionUid = isIpn ? t?.uid : payload.transaction_uid;

  const customerUid = isIpn ? d?.customer_uid : payload.customer_uid;

  const moreInfo1 = isIpn ? t?.more_info_1 : payload.more_info_1;

  const moreInfoAll = isIpn
    ? [t?.more_info, t?.more_info_1, t?.more_info_2, t?.more_info_3, t?.more_info_4, t?.more_info_5]
    : [payload.more_info, payload.more_info_1];

  const cardLast4 = isIpn ? ci?.four_digits : payload.four_digits;
  const cardExpiryMonth = isIpn ? ci?.expiry_month : payload.expiry_month;
  const cardExpiryYear = isIpn ? ci?.expiry_year : payload.expiry_year;
  const cardHolderName = isIpn ? ci?.card_holder_name : payload.card_holder_name;

  // Token: IPN puts it in card_information.token after tokenization
  const tokenUid = ci?.token ?? (payload as { token_uid?: string }).token_uid;

  const approvalNumber = isIpn
    ? t?.approval_number
    : payload.approval_num;
  const voucherNumber = isIpn ? t?.voucher_number : payload.voucher_num;

  const amount = isIpn
    ? Number(t?.amount)
    : Number(payload.amount);

  return {
    transactionUid,
    pageRequestUid: isIpn
      ? t?.payment_request_uid ?? t?.payment_page_request_uid
      : payload.page_request_uid,
    statusCode,
    status,
    isSuccess,
    transactionType: payload.transaction_type,
    amount: Number.isFinite(amount) ? amount : undefined,
    currency: isIpn ? t?.currency : payload.currency,
    customerUid,
    cardLast4,
    cardExpiryMonth,
    cardExpiryYear,
    cardBrand,
    cardHolderName,
    tokenUid,
    approvalNumber,
    voucherNumber,
    moreInfo1,
    moreInfoAll: moreInfoAll.filter((x): x is string => typeof x === "string"),
    invoiceUuid: payload.invoice?.uuid,
    invoiceNumber: payload.invoice?.docu_number,
    invoiceUrl: payload.invoice?.original_url,
    raw: payload,
  };
}

export function parseMoreInfo<T = Record<string, unknown>>(
  raw: string | undefined,
): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** @deprecated Use PayPlusIpnPayload or PayPlusRedirectPayload directly. */
export type PayPlusCallbackPayload = PayPlusIpnPayload & PayPlusRedirectPayload;
