import { emailLayout, emailPlainText, escapeHtml } from "../layout";
import { sendEmail } from "../resend-client";

export interface TrialEndingSoonParams {
  to: string;
  customerName: string;
  productName: string;
  daysRemaining: number;
  hasPaymentMethod: boolean;
  setupPaymentUrl: string;
}

export async function sendTrialEndingSoonEmail(params: TrialEndingSoonParams) {
  const subject = `התקופת ניסיון ב-${params.productName} מסתיימת בעוד ${params.daysRemaining} ימים`;

  const body = `
    <p>שלום ${escapeHtml(params.customerName)},</p>
    <p>
      התקופת הניסיון שלך ב-<strong>${escapeHtml(params.productName)}</strong> מסתיימת בעוד
      <strong>${params.daysRemaining} ימים</strong>.
    </p>
    ${
      params.hasPaymentMethod
        ? `<p>אמצעי התשלום שלך כבר מוגדר — לא נדרשת פעולה. ביום סיום התקופה החיוב הראשון יצא אוטומטית.</p>`
        : `<p style="color:#b45309;"><strong>אין לך אמצעי תשלום פעיל.</strong> כדי שלא תאבד גישה למוצר, אנא הכנס פרטי תשלום עכשיו.</p>`
    }
  `;

  const html = emailLayout({
    title: subject,
    preheader: `${params.daysRemaining} ימים עד תום הניסיון`,
    bodyHtml: body,
    ctaUrl: params.hasPaymentMethod ? undefined : params.setupPaymentUrl,
    ctaLabel: params.hasPaymentMethod ? undefined : "הכנס אמצעי תשלום",
  });

  const text = emailPlainText({
    title: subject,
    bodyText: [
      `שלום ${params.customerName},`,
      ``,
      `התקופת הניסיון שלך ב-${params.productName} מסתיימת בעוד ${params.daysRemaining} ימים.`,
      ``,
      params.hasPaymentMethod
        ? `אמצעי התשלום שלך כבר מוגדר — לא נדרשת פעולה. ביום סיום התקופה החיוב הראשון יצא אוטומטית.`
        : `אין לך אמצעי תשלום פעיל. כדי שלא תאבד גישה למוצר, אנא הכנס פרטי תשלום עכשיו.`,
    ].join("\n"),
    ctaUrl: params.hasPaymentMethod ? undefined : params.setupPaymentUrl,
    ctaLabel: params.hasPaymentMethod ? undefined : "הכנס אמצעי תשלום",
  });

  return sendEmail({ to: params.to, subject, html, text });
}

export interface TrialCancelledParams {
  to: string;
  customerName: string;
  productName: string;
  reactivateUrl: string;
}

export async function sendTrialCancelledEmail(params: TrialCancelledParams) {
  const subject = `התקופת ניסיון ב-${params.productName} הסתיימה`;
  const body = `
    <p>שלום ${escapeHtml(params.customerName)},</p>
    <p>
      התקופת הניסיון שלך ב-<strong>${escapeHtml(params.productName)}</strong> הסתיימה
      וטרם הוכנס אמצעי תשלום, ולכן המנוי בוטל.
    </p>
    <p>אם תרצה להמשיך, תוכל להפעיל מנוי חדש בכל עת.</p>
  `;

  const html = emailLayout({
    title: subject,
    bodyHtml: body,
    ctaUrl: params.reactivateUrl,
    ctaLabel: "התחל מנוי",
  });

  const text = emailPlainText({
    title: subject,
    bodyText: [
      `שלום ${params.customerName},`,
      ``,
      `התקופת הניסיון שלך ב-${params.productName} הסתיימה וטרם הוכנס אמצעי תשלום, ולכן המנוי בוטל.`,
      ``,
      `אם תרצה להמשיך, תוכל להפעיל מנוי חדש בכל עת.`,
    ].join("\n"),
    ctaUrl: params.reactivateUrl,
    ctaLabel: "התחל מנוי",
  });

  return sendEmail({ to: params.to, subject, html, text });
}
