export interface PayPlusResults {
  status: string;
  code: number;
  description: string;
}

export interface PayPlusResponse<T = unknown> {
  results: PayPlusResults;
  data?: T;
}

export interface BillingCustomer {
  name: string;
  email: string;
  phone?: string;
  vatNumber?: string;
  address?: string;
  city?: string;
}

export interface PayPlusInvoiceItem {
  name: string;
  quantity: number;
  /** Pre-VAT unit price (we apply VAT on send) */
  price: number;
  /** Optional extended description shown on invoice */
  extraDetails?: string;
}

export interface GenerateLinkResponse {
  page_request_uid: string;
  payment_page_link: string;
}

export interface ChargeResponse {
  transaction: {
    uid: string;
    number: string;
    status_code: string;
  };
  data: {
    customer_uid?: string;
    card_information?: {
      four_digits: string;
      brand_id: number;
      expiry_month: string;
      expiry_year: string;
    };
  };
  invoice?: {
    uuid: string;
    docu_number: string;
    original_url: string;
    copy_url: string;
    status: string;
  };
  token_uid?: string;
}

export interface InitiatePaymentParams {
  /**
   * Identifier of the customer in our DB. Stored in more_info_1 for callback routing.
   */
  customerId: string;
  /**
   * Identifier of the subscription/setup-session. Stored in more_info_1.
   */
  contextId: string;
  contextType: "subscription_setup" | "card_update" | "one_time";
  /** Pre-VAT amount (we add VAT on send) */
  baseAmount: number;
  /** Hebrew description for the payment page + invoice */
  description: string;
  customer: BillingCustomer;
  successUrl: string;
  failureUrl: string;
  cancelUrl?: string;
  /** Override — defaults to NEXT_PUBLIC_APP_URL/api/webhooks/payplus */
  callbackUrl?: string;
}

export interface ChargeWithTokenParams {
  tokenUid: string;
  customerUid?: string;
  /** Final amount including VAT */
  amount: number;
  description: string;
  invoiceItems?: PayPlusInvoiceItem[];
  /** Stored in more_info_1 for callback routing */
  moreInfo?: Record<string, unknown>;
}

export interface ChargeResult {
  success: boolean;
  transactionUid?: string;
  invoiceUuid?: string;
  invoiceNumber?: string;
  invoiceUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  raw?: unknown;
}
