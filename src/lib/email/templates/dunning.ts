import { emailLayout, emailPlainText, escapeHtml } from "../layout";
import { sendEmail, getEmailAdminBcc } from "../resend-client";

export interface DunningEmailParams {
  to: string;
  customerName: string;
  productName: string;
  attemptNumber: number;
  totalAttempts: number;
  daysUntilCancellation: number;
  errorMessage?: string;
  updatePaymentUrl: string;
}

export async function sendDunningEmail(params: DunningEmailParams) {
  const isFinalAttempt = params.attemptNumber === params.totalAttempts;
  const subject = isFinalAttempt
    ? `⚠️ ניסיון אחרון - חיוב ${params.productName} נכשל`
    : `החיוב עבור ${params.productName} נכשל - עדכן אמצעי תשלום`;

  const body = `
    <p>שלום ${escapeHtml(params.customerName)},</p>
    <p>
      ניסינו לחייב את אמצעי התשלום שלך עבור <strong>${escapeHtml(params.productName)}</strong>
      והחיוב לא הצליח.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#fafafa;border-radius:8px;">
      <tr><td style="padding:12px 16px;color:#737373;font-size:13px;">ניסיון</td><td style="padding:12px 16px;font-weight:500;text-align:left;">${params.attemptNumber} מתוך ${params.totalAttempts}</td></tr>
      <tr><td style="padding:12px 16px;color:#737373;font-size:13px;">ימים עד ביטול</td><td style="padding:12px 16px;font-weight:500;text-align:left;">${params.daysUntilCancellation}</td></tr>
      ${params.errorMessage ? `<tr><td style="padding:12px 16px;color:#737373;font-size:13px;">סיבה</td><td style="padding:12px 16px;font-weight:500;text-align:left;">${escapeHtml(params.errorMessage)}</td></tr>` : ""}
    </table>
    <p>
      ${isFinalAttempt
        ? "<strong>אם לא נצליח לחייב היום, המנוי יבוטל אוטומטית.</strong>"
        : "אנא עדכן את אמצעי התשלום בהקדם כדי להימנע מהפסקת השירות."}
    </p>
  `;

  const html = emailLayout({
    title: subject,
    preheader: `ניסיון ${params.attemptNumber} מתוך ${params.totalAttempts}`,
    bodyHtml: body,
    ctaUrl: params.updatePaymentUrl,
    ctaLabel: "עדכון אמצעי תשלום",
  });

  const text = emailPlainText({
    title: subject,
    bodyText: [
      `שלום ${params.customerName},`,
      ``,
      `ניסינו לחייב את אמצעי התשלום שלך עבור ${params.productName} והחיוב לא הצליח.`,
      ``,
      `ניסיון: ${params.attemptNumber} מתוך ${params.totalAttempts}`,
      `ימים עד ביטול: ${params.daysUntilCancellation}`,
      params.errorMessage ? `סיבה: ${params.errorMessage}` : "",
      ``,
      isFinalAttempt
        ? `אם לא נצליח לחייב היום, המנוי יבוטל אוטומטית.`
        : `אנא עדכן את אמצעי התשלום בהקדם כדי להימנע מהפסקת השירות.`,
    ]
      .filter(Boolean)
      .join("\n"),
    ctaUrl: params.updatePaymentUrl,
    ctaLabel: "עדכון אמצעי תשלום",
  });

  return sendEmail({
    to: params.to,
    subject,
    html,
    text,
    bcc: params.attemptNumber >= 2 ? [getEmailAdminBcc()] : undefined,
  });
}

export interface SubscriptionCancelledParams {
  to: string;
  customerName: string;
  productName: string;
  reactivateUrl: string;
}

export async function sendSubscriptionCancelledEmail(params: SubscriptionCancelledParams) {
  const subject = `המנוי שלך עבור ${params.productName} בוטל`;
  const body = `
    <p>שלום ${escapeHtml(params.customerName)},</p>
    <p>
      לאחר מספר ניסיונות חיוב כושלים, בוטל המנוי שלך עבור
      <strong>${escapeHtml(params.productName)}</strong>.
    </p>
    <p>
      תוכל להפעיל שוב את המנוי בכל עת על ידי הכנסת אמצעי תשלום תקין.
    </p>
  `;

  const html = emailLayout({
    title: subject,
    bodyHtml: body,
    ctaUrl: params.reactivateUrl,
    ctaLabel: "חידוש מנוי",
  });

  const text = emailPlainText({
    title: subject,
    bodyText: [
      `שלום ${params.customerName},`,
      ``,
      `לאחר מספר ניסיונות חיוב כושלים, בוטל המנוי שלך עבור ${params.productName}.`,
      ``,
      `תוכל להפעיל שוב את המנוי בכל עת על ידי הכנסת אמצעי תשלום תקין.`,
    ].join("\n"),
    ctaUrl: params.reactivateUrl,
    ctaLabel: "חידוש מנוי",
  });

  return sendEmail({ to: params.to, subject, html, text });
}
