import { payplusRequest, PAYPLUS_CONFIG } from "./client";

/**
 * Find a refund/credit-note document in PayPlus's Invoice+ system.
 *
 * Background: `Transactions/View` and `/PaymentPages/ipn-full` don't
 * recognize refund transaction UIDs ("can-not-find-transaction_uid").
 * Per PayPlus support, the way to retrieve refund docs from API is via
 * `GET /books/docs/list` — but the `transaction_uuid` filter also
 * doesn't work in dev. The reliable filter is `customer` (the PayPlus
 * customer UID) + `types=inv_refund` + a date window, then pick the
 * most recent matching `doc_amount`.
 */
export async function findRefundDocument(params: {
  customerUid: string;
  amount: number;
  fromDate?: string; // YYYY-MM-DD, defaults to today
}): Promise<{
  found: boolean;
  uuid?: string;
  number?: string;
  url?: string;
  copyUrl?: string;
}> {
  const apiUrl = PAYPLUS_CONFIG.apiUrl.replace(/\/$/, "");
  const url = new URL(`${apiUrl}/books/docs/list`);
  url.searchParams.set("take", "20");
  url.searchParams.set("customer", params.customerUid);
  url.searchParams.set("types", "inv_refund");
  url.searchParams.set("fromDate", params.fromDate ?? new Date().toISOString().slice(0, 10));

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "api-key": PAYPLUS_CONFIG.apiKey,
        "secret-key": PAYPLUS_CONFIG.secretKey,
      },
    });
    if (!response.ok) return { found: false };
    const j = (await response.json()) as {
      status?: string;
      details?: {
        items?: Array<{
          uuid?: string;
          number?: string;
          doc_amount?: number;
          original_doc?: string;
          true_copy_doc?: string;
          entity_type_name?: string;
        }>;
      };
    };
    const items = j.details?.items ?? [];
    // Match by amount (within 1 agora)
    const match = items.find(
      (d) =>
        d.entity_type_name === "inv_refund" &&
        Math.abs((d.doc_amount ?? 0) - params.amount) < 0.01,
    );
    if (!match) return { found: false };
    return {
      found: true,
      uuid: match.uuid,
      number: match.number,
      url: match.original_doc,
      copyUrl: match.true_copy_doc,
    };
  } catch (err) {
    console.warn("[PayPlus] findRefundDocument failed:", err);
    return { found: false };
  }
}

/**
 * Pull full transaction details (including the auto-generated invoice
 * UUID/URL) for a J4 charge that completed.
 *
 * Background: `Transactions/Charge` (J4) does NOT return the invoice
 * block in its sync response, and PayPlus does not fire any IPN for
 * direct token charges (no payment-page mediation). The supported
 * workaround per PayPlus support: after a successful charge, pull the
 * transaction via `POST /PaymentPages/ipn-full` — that response carries
 * `invoice_uuid`, `invoice_original_url`, `invoice_copy_url` as flat
 * fields under `data`.
 */
export async function getInvoiceForTransaction(
  transactionUid: string,
  options: { retries?: number; delayMs?: number } = {},
): Promise<{
  success: boolean;
  invoiceUuid?: string;
  invoiceNumber?: string;
  invoiceUrl?: string;
  invoiceCopyUrl?: string;
  invoiceStatus?: string;
  raw?: unknown;
}> {
  // PayPlus creates the invoice asynchronously after a charge — it usually
  // takes 5–15s before the doc UUID/URL is available on /ipn-full. Poll
  // a few times before giving up so the renewal cron still gets a hit.
  const retries = options.retries ?? 4;
  const delayMs = options.delayMs ?? 4000;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await payplusRequest<{
        invoice_uuid?: string;
        invoice_docu_number?: string;
        invoice_original_url?: string;
        invoice_copy_url?: string;
        invoice_status?: string;
      }>("PaymentPages/ipn-full", "POST", {
        transaction_uid: transactionUid,
        related_transaction: false,
      });

      if (response.results.status === "success" && response.data?.invoice_uuid) {
        return {
          success: true,
          invoiceUuid: response.data.invoice_uuid,
          invoiceNumber: response.data.invoice_docu_number,
          invoiceUrl: response.data.invoice_original_url,
          invoiceCopyUrl: response.data.invoice_copy_url,
          invoiceStatus: response.data.invoice_status,
          raw: response,
        };
      }
      // Status success but no invoice yet — PayPlus is still generating.
    } catch (err) {
      console.warn(
        `[PayPlus] getInvoiceForTransaction attempt ${attempt + 1} failed:`,
        err,
      );
    }

    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return { success: false };
}

/**
 * Refund a previous transaction by its UID.
 *
 * Endpoint: POST /Transactions/RefundByTransactionUID
 * - `transaction_uid` = the UID of the original charge to refund
 * - `amount` = full or partial amount (≤ original)
 * - `more_info` = used as the invoice line description for partial refunds
 */
export async function refundTransaction(params: {
  transactionUid: string;
  amount: number;
  reason?: string;
  initialInvoice?: boolean;
}): Promise<{
  success: boolean;
  refundUid?: string;
  errorCode?: string;
  errorMessage?: string;
  raw?: unknown;
}> {
  try {
    const response = await payplusRequest<{
      transaction?: { uid: string };
    }>("Transactions/RefundByTransactionUID", "POST", {
      transaction_uid: params.transactionUid,
      amount: params.amount,
      ...(params.reason && { more_info: params.reason }),
      ...(params.initialInvoice != null && {
        initial_invoice: params.initialInvoice,
      }),
    });

    if (response.results.status !== "success" || response.results.code !== 0) {
      return {
        success: false,
        errorCode: String(response.results.code ?? ""),
        errorMessage: response.results.description,
        raw: response,
      };
    }

    return {
      success: true,
      refundUid: response.data?.transaction?.uid,
      raw: response,
    };
  } catch (err) {
    return {
      success: false,
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

void PAYPLUS_CONFIG;
