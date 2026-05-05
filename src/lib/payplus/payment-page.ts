import { payplusRequest, PAYPLUS_CONFIG } from "./client";
import { withVat } from "./vat";
import type { GenerateLinkResponse, InitiatePaymentParams } from "./types";

/**
 * PayPlus charge_method enum (from PaymentPages/generateLink docs):
 *   0 - Check (J2)            verify card without holding funds
 *   1 - Charge (J4)            immediate charge
 *   2 - Approval (J5)          hold funds, charge later
 *   3 - Recurring Payments     PayPlus-managed schedule (we don't use)
 *   4 - Refund (J4)            immediate refund
 *   5 - Token (J2)             save token without charging
 */
const CHARGE_METHOD = {
  CHECK: 0,
  CHARGE: 1,
  APPROVAL: 2,
  RECURRING: 3,
  REFUND: 4,
  TOKEN_ONLY: 5,
} as const;

/**
 * Generate a PayPlus hosted payment page link.
 *
 * `create_token: true` saves the card for future recurring charges. The
 * Hub's webhook receives the token + customer_uid.
 *
 * For `subscription_setup` and `one_time` we use J4 (real charge).
 * For `card_update` we use J2 token-only — no money is moved.
 */
export async function generatePaymentPageLink(
  params: InitiatePaymentParams,
): Promise<{ paymentPageUrl: string; pageRequestUid: string }> {
  const isCardUpdate = params.contextType === "card_update";
  const chargeMethod = isCardUpdate
    ? CHARGE_METHOD.TOKEN_ONLY
    : CHARGE_METHOD.CHARGE;

  // For token-only flow PayPlus still requires an `amount`; use 1 ILS
  // (it won't actually be charged since charge_method=5).
  const { total } = withVat(isCardUpdate ? 1 : params.baseAmount);

  const moreInfoData = {
    type: params.contextType,
    customerId: params.customerId,
    contextId: params.contextId,
  };

  const callbackUrl =
    params.callbackUrl ||
    `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/payplus`;

  const response = await payplusRequest<GenerateLinkResponse>(
    "PaymentPages/generateLink",
    "POST",
    {
      payment_page_uid: PAYPLUS_CONFIG.paymentPageUid,
      charge_method: chargeMethod,
      create_token: true,

      amount: total,
      currency_code: "ILS",

      // For card update we don't want an invoice; for real charges we do.
      initial_invoice: !isCardUpdate,

      customer: {
        customer_name: params.customer.name,
        email: params.customer.email,
        phone: params.customer.phone || "",
        vat_number: params.customer.vatNumber || "",
      },

      items: [
        {
          name: params.description,
          quantity: 1,
          price: total,
          vat_type: 0,
        },
      ],

      refURL_success: params.successUrl,
      refURL_failure: params.failureUrl,
      refURL_cancel: params.cancelUrl || params.failureUrl,
      refURL_callback: callbackUrl,
      send_failure_callback: true,

      more_info: params.description,
      more_info_1: JSON.stringify(moreInfoData),

      language_code: "he",
      expiry_datetime: "30",

      sendEmailApproval: !isCardUpdate,
      sendEmailFailure: false,
    },
  );

  if (response.results.status !== "success" || !response.data) {
    throw new Error(
      `PayPlus generateLink failed: ${response.results.description}`,
    );
  }

  return {
    paymentPageUrl: response.data.payment_page_link,
    pageRequestUid: response.data.page_request_uid,
  };
}
