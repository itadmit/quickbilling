import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
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

  // TEMP DEBUG: capture every IPN body + headers before any check, so we
  // can observe whether PayPlus is delivering, what shape, and whether the
  // signature passes. To be reverted once we have the answer.
  try {
    const allHeaders: Record<string, string> = {};
    request.headers.forEach((v, k) => {
      allHeaders[k] = v;
    });
    await db.execute(
      sql`INSERT INTO _ipn_debug (raw_body, hash_header, user_agent, all_headers, received_at)
          VALUES (${rawBody}, ${hashHeader ?? null}, ${userAgent ?? null}, ${JSON.stringify(allHeaders)}, now())`,
    );
  } catch {
    // table might not exist yet — ignore
  }

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
  // Primary lookup: more_info_1 (carries our session ID, present on
  // J4/J5 charge callbacks). Fallback: page_request_uid — PayPlus's
  // token-only (charge_method=5) callback DOES NOT echo more_info_1
  // back, only the page UID, so we match the session by that instead.
  let session = null as typeof paymentMethodSetupSessions.$inferSelect | null;

  if (moreInfo?.contextId) {
    const [s] = await db
      .select()
      .from(paymentMethodSetupSessions)
      .where(eq(paymentMethodSetupSessions.id, moreInfo.contextId))
      .limit(1);
    session = s ?? null;
  }

  if (!session && event.pageRequestUid) {
    const [s] = await db
      .select()
      .from(paymentMethodSetupSessions)
      .where(
        eq(
          paymentMethodSetupSessions.payplusPageRequestUid,
          event.pageRequestUid,
        ),
      )
      .limit(1);
    session = s ?? null;
  }

  if (!session) {
    console.warn("[payplus webhook] no matching session", {
      contextId: moreInfo?.contextId,
      pageRequestUid: event.pageRequestUid,
      transactionUid: event.transactionUid,
    });
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

  // moreInfo carries the customerId on J4/J5 callbacks. Token-only
  // callbacks (charge_method=5) lack it — fall back to the session's
  // own customer_id.
  const customerId = moreInfo?.customerId ?? session.customerId;

  const [pm] = await db
    .insert(paymentMethods)
    .values({
      customerId,
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
      .where(eq(customers.id, customerId));
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
      customer_id: customerId,
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
