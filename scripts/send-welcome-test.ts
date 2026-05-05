import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { sendEmail, getEmailFrom } from "../src/lib/email/resend-client";
import { emailLayout, emailPlainText } from "../src/lib/email/layout";

interface Recipient {
  email: string;
  name: string;
}

const RECIPIENTS: Recipient[] = [
  { email: "itadmit@gmail.com", name: "איתי" },
  { email: "0547359@gmail.com", name: "מריה" },
];

const CTA_URL = "https://billing.my-quickshop.com/login";
const CTA_LABEL = "כניסה ל-Billing Hub";

function welcomeHtml(name: string): string {
  return emailLayout({
    title: `ברוך/ה הבא/ה ל-Billing Hub, ${name}`,
    preheader: "הוקם לך משתמש בלוח הבקרה הפנימי",
    bodyHtml: `
      <p dir="rtl" style="margin:0 0 16px;text-align:right;direction:rtl;">היי ${name},</p>
      <p dir="rtl" style="margin:0 0 16px;text-align:right;direction:rtl;">
        נוצר לך משתמש בלוח הבקרה של <strong>Quick Commerce Billing Hub</strong> —
        המערכת המרכזית שלנו לניהול מנויים, חשבוניות וחיובים בכל המוצרים.
      </p>
      <p dir="rtl" style="margin:0 0 16px;text-align:right;direction:rtl;">
        זהו מייל בדיקה לאימות שמערכת השליחה פעילה. אם הגיע אליך — הכל עובד.
      </p>
      <p dir="rtl" style="margin:0 0 16px;text-align:right;direction:rtl;">נתראה בפנים.</p>
      <p dir="rtl" style="color:#737373;font-size:13px;margin:24px 0 0;text-align:right;direction:rtl;">— צוות Quick Commerce</p>
    `,
    ctaUrl: CTA_URL,
    ctaLabel: CTA_LABEL,
  });
}

function welcomeText(name: string): string {
  return emailPlainText({
    title: `ברוך/ה הבא/ה ל-Billing Hub, ${name}`,
    bodyText: [
      `היי ${name},`,
      ``,
      `נוצר לך משתמש בלוח הבקרה של Quick Commerce Billing Hub —`,
      `המערכת המרכזית שלנו לניהול מנויים, חשבוניות וחיובים בכל המוצרים.`,
      ``,
      `זהו מייל בדיקה לאימות שמערכת השליחה פעילה. אם הגיע אליך — הכל עובד.`,
      ``,
      `נתראה בפנים.`,
      ``,
      `— צוות Quick Commerce`,
    ].join("\n"),
    ctaUrl: CTA_URL,
    ctaLabel: CTA_LABEL,
  });
}

async function main() {
  console.log(`📧 Sending from: ${getEmailFrom()}\n`);

  for (const r of RECIPIENTS) {
    process.stdout.write(`→ ${r.email} ... `);
    try {
      const res = await sendEmail({
        to: r.email,
        subject: `ברוך הבא ל-Billing Hub`,
        html: welcomeHtml(r.name),
        text: welcomeText(r.name),
      });
      if (res.error) {
        console.log(`❌ ${res.error.name}: ${res.error.message}`);
      } else {
        console.log(`✓ sent (id=${res.data?.id})`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`❌ ${msg}`);
    }
  }
}

main().catch((err) => {
  console.error("❌ Unexpected:", err);
  process.exit(1);
});
