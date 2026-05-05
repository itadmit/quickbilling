import { payplusRequest, PAYPLUS_CONFIG } from "./client";

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
