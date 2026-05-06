import { payplusRequest, PAYPLUS_CONFIG } from "./client";
import type {
  ChargeResponse,
  ChargeResult,
  ChargeWithTokenParams,
} from "./types";

/**
 * Recurring charge using a saved token.
 *
 * `params.amount` is the FINAL amount including VAT — caller should pass
 * already-VAT-included totals. Invoice items are sent with `vat_type: '0'`
 * to indicate VAT is already included.
 *
 * Falls back to charging without `customer_uid` when PayPlus reports
 * "can-not-find-customer" (token alone is enough).
 */
export async function chargeWithToken(
  params: ChargeWithTokenParams,
): Promise<ChargeResult> {
  // J4 doesn't accept any callback URL parameter, and PayPlus doesn't fire
  // an IPN for direct token charges (per their support). Invoice details are
  // pulled separately via getInvoiceForTransaction after the charge.
  const buildBody = (includeCustomerUid: boolean): Record<string, unknown> => ({
    terminal_uid: PAYPLUS_CONFIG.terminalUid,
    cashier_uid: PAYPLUS_CONFIG.cashierUid,

    amount: params.amount,
    currency_code: "ILS",
    credit_terms: 1,

    use_token: true,
    token: params.tokenUid,
    ...(includeCustomerUid &&
      params.customerUid && { customer_uid: params.customerUid }),

    initial_invoice: true,

    products: params.invoiceItems?.map((item) => ({
      name: item.name,
      quantity: String(item.quantity),
      price: String(round2(item.price)),
      currency_code: "ILS",
      vat_type: "0",
      ...(item.extraDetails && {
        product_invoice_extra_details: item.extraDetails,
      }),
    })) ?? [
      {
        name: params.description,
        quantity: "1",
        price: String(round2(params.amount)),
        currency_code: "ILS",
        vat_type: "0",
      },
    ],

    more_info_1: params.moreInfo
      ? JSON.stringify(params.moreInfo)
      : params.description,
  });

  try {
    let response = await payplusRequest<ChargeResponse>(
      "Transactions/Charge",
      "POST",
      buildBody(true),
    );

    if (
      response.results.description === "can-not-find-customer" &&
      params.customerUid
    ) {
      response = await payplusRequest<ChargeResponse>(
        "Transactions/Charge",
        "POST",
        buildBody(false),
      );
    }

    if (response.results.status !== "success" || response.results.code !== 0) {
      return {
        success: false,
        errorCode: String(response.results.code ?? ""),
        errorMessage: response.results.description || "Unknown error",
        raw: response,
      };
    }

    return {
      success: true,
      transactionUid: response.data?.transaction?.uid,
      invoiceUuid: response.data?.invoice?.uuid,
      invoiceNumber: response.data?.invoice?.docu_number,
      invoiceUrl: response.data?.invoice?.original_url,
      raw: response,
    };
  } catch (err) {
    return {
      success: false,
      errorMessage: err instanceof Error ? err.message : "Unknown error",
      raw: err,
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
