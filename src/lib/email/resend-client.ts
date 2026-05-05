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

const DEFAULT_FROM = "Quick Commerce Billing <noreply@billing.my-quickshop.com>";
const DEFAULT_ADMIN_BCC = "quickshop.israel@gmail.com";

/**
 * Read EMAIL_FROM at call time, not at module-load time. Required because
 * scripts using `dotenv.config()` execute AFTER ESM imports — a const
 * exported here would lock in `undefined` from `process.env` and silently
 * fall back to the default before .env.local is loaded.
 */
export function getEmailFrom(): string {
  return process.env.EMAIL_FROM || DEFAULT_FROM;
}

export function getEmailAdminBcc(): string {
  return process.env.EMAIL_ADMIN_BCC || DEFAULT_ADMIN_BCC;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  bcc?: string[];
  from?: string;
}

export async function sendEmail(params: SendEmailParams) {
  const r = getResend();
  return r.emails.send({
    from: params.from || getEmailFrom(),
    to: params.to,
    subject: params.subject,
    html: params.html,
    bcc: params.bcc,
  });
}
