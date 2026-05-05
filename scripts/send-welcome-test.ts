import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { sendEmail, getEmailFrom } from "../src/lib/email/resend-client";
import { emailLayout } from "../src/lib/email/layout";

interface Recipient {
  email: string;
  name: string;
}

const RECIPIENTS: Recipient[] = [
  { email: "itadmit@gmail.com", name: "איתי" },
  { email: "0547359@gmail.com", name: "מריה" },
];

function welcomeHtml(name: string): string {
  return emailLayout({
    title: `ברוך/ה הבא/ה ל-Quick Commerce Billing Hub, ${name}!`,
    preheader: "הוקם לך משתמש בלוח הבקרה הפנימי",
    bodyHtml: `
      <p>היי ${name},</p>
      <p>נוצר לך משתמש בלוח הבקרה של <strong>Quick Commerce Billing Hub</strong> — המערכת המרכזית שלנו לניהול מנויים, חשבוניות וחיובים בכל המוצרים.</p>
      <p>זה מייל בדיקה לאימות שמערכת השליחה (Resend) פעילה כראוי. אם הגיע אליך — הכל עובד.</p>
      <p>נתראה בפנים.</p>
      <p style="color:#737373;font-size:13px;margin-top:24px;">— צוות Quick Commerce</p>
    `,
    ctaUrl: "https://billing.my-quickshop.com/login",
    ctaLabel: "כניסה ל-Billing Hub",
  });
}

async function main() {
  console.log(`📧 Sending from: ${getEmailFrom()}\n`);

  for (const r of RECIPIENTS) {
    process.stdout.write(`→ ${r.email} ... `);
    try {
      const res = await sendEmail({
        to: r.email,
        subject: `ברוך הבא ל-Quick Commerce Billing Hub`,
        html: welcomeHtml(r.name),
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
