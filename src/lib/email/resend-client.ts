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
const DEFAULT_REPLY_TO = "support@billing.my-quickshop.com";
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

export function getEmailReplyTo(): string {
  return process.env.EMAIL_REPLY_TO || DEFAULT_REPLY_TO;
}

export function getEmailAdminBcc(): string {
  return process.env.EMAIL_ADMIN_BCC || DEFAULT_ADMIN_BCC;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  /**
   * Plain-text alternative. Gmail/Outlook give a meaningful spam-score
   * boost to multipart messages (text + html) over html-only — always
   * provide this when calling sendEmail.
   */
  text?: string;
  bcc?: string[];
  from?: string;
  replyTo?: string;
}

export async function sendEmail(params: SendEmailParams) {
  const r = getResend();
  return r.emails.send({
    from: params.from || getEmailFrom(),
    replyTo: params.replyTo || getEmailReplyTo(),
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
    bcc: params.bcc,
    headers: {
      // RFC 8058 one-click + RFC 2369 mailto fallback. Gmail's bulk-sender
      // guidelines require this on transactional/bulk mail and weight it
      // heavily for inbox placement.
      "List-Unsubscribe": `<mailto:${getEmailReplyTo()}?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      // Help Gmail thread/group transactional mail correctly.
      "X-Entity-Ref-ID": cryptoRandomId(),
    },
  });
}

function cryptoRandomId(): string {
  // Short non-cryptographic ID is fine — only used for grouping in clients.
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
