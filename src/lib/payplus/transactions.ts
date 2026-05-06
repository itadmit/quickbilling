import { payplusRequest, PAYPLUS_CONFIG } from "./client";

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
export async function getInvoiceForTransaction(transactionUid: string): Promise<{
  success: boolean;
  invoiceUuid?: string;
  invoiceNumber?: string;
  invoiceUrl?: string;
  invoiceCopyUrl?: string;
  invoiceStatus?: string;
  raw?: unknown;
}> {
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

    if (response.results.status !== "success") {
      return { success: false, raw: response };
    }

    return {
      success: true,
      invoiceUuid: response.data?.invoice_uuid,
      invoiceNumber: response.data?.invoice_docu_number,
      invoiceUrl: response.data?.invoice_original_url,
      invoiceCopyUrl: response.data?.invoice_copy_url,
      invoiceStatus: response.data?.invoice_status,
      raw: response,
    };
  } catch (err) {
    console.warn("[PayPlus] getInvoiceForTransaction failed:", err);
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
