import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  customers,
  invoices,
  paymentMethods,
  paymentMethodSetupSessions,
} from "@/lib/db/schema";
import {
  verifyPayPlusCallback,
  parseMoreInfo,
  normalizePayPlusEvent,
  type PayPlusIpnPayload,
  type PayPlusRedirectPayload,
} from "@/lib/payplus/webhooks";
import { emitWebhook } from "@/lib/webhooks/delivery";

interface MoreInfoData {
  type: "subscription_setup" | "card_update" | "one_time" | string;
  customerId: string;
  contextId: string;
}

/**
 * Inbound PayPlus webhook (refURL_callback).
 *
 * Payload shape per PayPlus docs (Transaction Callback Response):
 *   {
 *     transaction_type: "Charge" | "Refund",
 *     transaction:  { uid, status_code, more_info_1, ... },
 *     data:         { customer_uid, card_information: { four_digits, token, ... } },
 *     invoice:      { uuid, docu_number, original_url, ... }   // when initial_invoice=true
 *   }
 *
 * The same endpoint may also receive the flat browser-redirect shape
 * (refURL_success/refURL_failure with transaction_uid, four_digits at
 * top level). `normalizePayPlusEvent` papers over the difference.
 *
 * Routing back to our setup_session: more_info_1 carries
 * { customerId, contextId } as JSON. Both shapes preserve this.
 *
 * Idempotent: if the session is already 'completed', the second
 * delivery is a no-op.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const hashHeader = request.headers.get("hash");
  const userAgent = request.headers.get("user-agent");

  // In dev, allow unsigned (PayPlus sandbox sometimes omits the header).
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && !verifyPayPlusCallback(rawBody, hashHeader, userAgent)) {
    return NextResponse.json(
      { error: "INVALID_SIGNATURE" },
      { status: 401 },
    );
  }

  let payload: PayPlusIpnPayload & PayPlusRedirectPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  console.log("[payplus webhook] keys:", Object.keys(payload));
  console.log("[payplus webhook] invoice block:", JSON.stringify(payload.invoice ?? null));
  console.log("[payplus webhook] transaction.uid:", payload.transaction?.uid ?? payload.transaction_uid);
  console.log("[payplus webhook] transaction_type:", payload.transaction_type);

  const event = normalizePayPlusEvent(payload);
  const moreInfo = parseMoreInfo<MoreInfoData>(event.moreInfo1);

  // ─── PATH B: post-charge IPN (no setup-session context) ────────────
  // PayPlus issues invoices asynchronously and posts them back here.
  // If the IPN carries a transaction_uid that maps to one of our invoices
  // and that invoice doesn't yet have its PayPlus invoice URL filled in,
  // patch it. Idempotent: re-deliveries are no-ops once URL is set.
  if (
    !moreInfo?.contextId &&
    event.transactionUid &&
    (event.invoiceUuid || event.invoiceUrl)
  ) {
    const [inv] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.payplusTransactionUid, event.transactionUid))
      .limit(1);

    if (inv && !inv.payplusInvoiceUrl) {
      await db
        .update(invoices)
        .set({
          payplusInvoiceUuid: event.invoiceUuid ?? inv.payplusInvoiceUuid,
          payplusInvoiceNumber:
            event.invoiceNumber ?? inv.payplusInvoiceNumber,
          payplusInvoiceUrl: event.invoiceUrl ?? inv.payplusInvoiceUrl,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, inv.id));
      return NextResponse.json({
        ok: true,
        path: "post_charge",
        invoice_id: inv.id,
        attached_pdf: true,
      });
    }
    return NextResponse.json({
      ok: true,
      path: "post_charge",
      attached_pdf: false,
    });
  }

  // ─── PATH A: tokenization callback ────────────────────────────────
  if (!moreInfo?.customerId || !moreInfo?.contextId) {
    console.warn("[payplus webhook] missing more_info_1, ignoring", {
      transactionUid: event.transactionUid,
    });
    return NextResponse.json({ ok: true, ignored: true });
  }

  const [session] = await db
    .select()
    .from(paymentMethodSetupSessions)
    .where(eq(paymentMethodSetupSessions.id, moreInfo.contextId))
    .limit(1);

  if (!session) {
    console.warn("[payplus webhook] unknown contextId", moreInfo.contextId);
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (session.status === "completed") {
    return NextResponse.json({ ok: true, replay: true });
  }

  if (!event.isSuccess || !event.tokenUid) {
    await db
      .update(paymentMethodSetupSessions)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(paymentMethodSetupSessions.id, session.id));

    console.warn("[payplus webhook] tokenization failed", {
      sessionId: session.id,
      statusCode: event.statusCode,
      hasToken: !!event.tokenUid,
    });
    return NextResponse.json({ ok: true, status: "failed" });
  }

  const cardExpiry =
    event.cardExpiryMonth && event.cardExpiryYear
      ? `${event.cardExpiryMonth}/${event.cardExpiryYear}`
      : undefined;

  const [pm] = await db
    .insert(paymentMethods)
    .values({
      customerId: moreInfo.customerId,
      payplusCustomerUid: event.customerUid,
      payplusTokenUid: event.tokenUid,
      cardBrand: event.cardBrand,
      cardLast4: event.cardLast4 || null,
      cardExpiry,
      isDefault: true,
      status: "active",
    })
    .returning();

  // Persist payplus_customer_uid on the customer if not yet set
  if (event.customerUid) {
    await db
      .update(customers)
      .set({ payplusCustomerUid: event.customerUid, updatedAt: new Date() })
      .where(eq(customers.id, moreInfo.customerId));
  }

  await db
    .update(paymentMethodSetupSessions)
    .set({
      status: "completed",
      completedPaymentMethodId: pm.id,
      updatedAt: new Date(),
    })
    .where(eq(paymentMethodSetupSessions.id, session.id));

  await emitWebhook({
    productId: session.productId,
    eventType: "payment_method.created",
    payload: {
      payment_method_id: pm.id,
      customer_id: moreInfo.customerId,
      card_brand: pm.cardBrand,
      card_last4: pm.cardLast4,
      card_expiry: pm.cardExpiry,
      setup_session_id: session.id,
    },
  });

  return NextResponse.json({
    ok: true,
    payment_method_id: pm.id,
    transaction_uid: event.transactionUid,
  });
}
