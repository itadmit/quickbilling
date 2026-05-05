import { Resend } from "resend";

let _resend: Resend | undefined;

export function getResend(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY is not set");
  }
  _resend = new Resend(key);
  return _resend;
}

export const EMAIL_FROM = process.env.EMAIL_FROM || "billing@quickcommerce.co.il";
export const EMAIL_ADMIN_BCC = process.env.EMAIL_ADMIN_BCC || "quickshop.israel@gmail.com";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  bcc?: string[];
}

export async function sendEmail(params: SendEmailParams) {
  const r = getResend();
  return r.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: params.subject,
    html: params.html,
    bcc: params.bcc,
  });
}
