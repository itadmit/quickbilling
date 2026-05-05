import { payplusRequest, PAYPLUS_CONFIG } from "./client";

/**
 * Look up Invoice+ documents (PDFs) attached to a PayPlus transaction.
 *
 * Uses the undocumented-on-Charge-response but documented-on-Reports
 * endpoint `Invoice/GetDocuments`, which returns one row per generated
 * document (the tax-receipt for a charge, plus credit-invoice + credit-
 * receipt for a refunded charge).
 *
 * Returns the FIRST issued document's original PDF URL — that's the
 * "main" invoice for the transaction. Subsequent docs (refund / credit)
 * are captured separately when the refund-by-uid call is made.
 */
export async function getInvoiceDocuments(transactionUid: string): Promise<{
  success: boolean;
  documents: Array<{
    type?: string;
    date?: string;
    original_doc_url?: string;
    copy_doc_url?: string;
  }>;
  primaryUrl?: string;
  primaryUuid?: string;
}> {
  try {
    const response = await payplusRequest<{
      invoices?: Array<{
        status: string;
        type: string;
        date: string;
        original_doc_url: string;
        copy_doc_url: string;
      }>;
    }>("Invoice/GetDocuments", "POST", {
      transaction_uid: transactionUid,
      filter: { take: 5, skip: 0 },
      terminal_uid: PAYPLUS_CONFIG.terminalUid,
    });

    type Doc = {
      status?: string;
      type?: string;
      date?: string;
      original_doc_url?: string;
      copy_doc_url?: string;
    };
    const flat: Doc[] =
      (response as { invoices?: Doc[] }).invoices ??
      ((response.data as unknown as { invoices?: Doc[] })?.invoices) ??
      (Array.isArray(response.data) ? (response.data as Doc[]) : []);

    // Prefer "Invoice Receipt" if present, else first
    const primary =
      flat.find((d) => d.type?.toLowerCase().includes("invoice receipt")) ??
      flat[0];

    // Extract uuid from original_doc_url like /getdoc/s/o/{uuid}.pdf
    const primaryUuid = primary?.original_doc_url?.match(/\/([0-9a-f-]{36})\.pdf$/i)?.[1];

    return {
      success: true,
      documents: flat,
      primaryUrl: primary?.original_doc_url,
      primaryUuid,
    };
  } catch (err) {
    console.warn("[PayPlus] getInvoiceDocuments failed:", err);
    return { success: false, documents: [] };
  }
}

/**
 * Look up a single transaction by UID via POST /Transactions/View.
 */
export async function getTransactionDetails(transactionUid: string): Promise<{
  success: boolean;
  invoiceNumber?: string;
  invoiceUrl?: string;
  status?: string;
  raw?: unknown;
}> {
  try {
    const response = await payplusRequest<{
      transaction_uid?: string;
      invoice_number?: string;
      invoice_link?: string;
      status_code?: string;
    }>("Transactions/View", "POST", {
      transaction_uid: transactionUid,
    });

    if (response.results.status !== "success") {
      return { success: false, raw: response };
    }

    return {
      success: true,
      invoiceNumber: response.data?.invoice_number,
      invoiceUrl: response.data?.invoice_link,
      status: response.data?.status_code,
      raw: response,
    };
  } catch (err) {
    console.error("[PayPlus] getTransactionDetails failed:", err);
    return { success: false };
  }
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
