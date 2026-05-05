import { CodeBlock } from "./code-block";

interface ApiDocsProps {
  productSlug: string;
  productName: string;
  baseUrl: string;
}

export function ApiDocs({ productSlug, productName, baseUrl }: ApiDocsProps) {
  return (
    <div className="space-y-6">
      <Intro productName={productName} baseUrl={baseUrl} />
      <AuthSection productSlug={productSlug} baseUrl={baseUrl} />
      <ClientHelper productSlug={productSlug} baseUrl={baseUrl} />
      <Endpoint
        method="POST"
        path="/api/v1/customers"
        title="יצירת/עדכון לקוח"
        description="Upsert לפי email. אם הלקוח קיים, פרטים יעודכנו וקישור למוצר ייווצר/יעודכן."
        request={{
          email: "merchant@example.com",
          phone: "+972501234567",
          name: "John Doe",
          vat_number: "123456789",
          external_id: "store_abc123",
          external_slug: "abc-store",
          metadata: { custom: "field" },
        }}
        response={{
          id: "uuid",
          email: "merchant@example.com",
          phone: "+972501234567",
          name: "John Doe",
        }}
        productSlug={productSlug}
        baseUrl={baseUrl}
      />

      <Endpoint
        method="POST"
        path="/api/v1/payment-methods/setup"
        title="הגדרת אמצעי תשלום (PayPlus tokenization)"
        description="מחזיר URL של דף תשלום ב-PayPlus לאיסוף כרטיס. אחרי שהלקוח מסיים, אנחנו מקבלים את ה-token ושומרים. צריך לעקוב אחרי success_url או webhook payment_method.created."
        request={{
          customer_id: "uuid",
          context_type: "subscription_setup",
          success_url: "https://yourapp.com/billing/success",
          failure_url: "https://yourapp.com/billing/failed",
        }}
        response={{
          session_id: "uuid",
          payment_page_url: "https://payments.payplus.co.il/...",
          page_request_uid: "abc123",
          expires_at: "2026-05-05T23:59:59Z",
        }}
        productSlug={productSlug}
        baseUrl={baseUrl}
      />

      <Endpoint
        method="POST"
        path="/api/v1/subscriptions"
        title="יצירת מנוי"
        description="יוצר מנוי חדש. אם trial_days > 0 → status='trial'. אחרת status='active' (דורש payment_method_id)."
        request={{
          customer_id: "uuid",
          plan_code: "pro",
          billing_interval: "monthly",
          trial_days: 14,
          payment_method_id: "uuid",
        }}
        response={{
          id: "uuid",
          status: "trial",
          billing_interval: "monthly",
          current_period_end: "2026-06-05",
          trial_ends_at: "2026-05-19T...",
        }}
        productSlug={productSlug}
        baseUrl={baseUrl}
      />

      <Endpoint
        method="POST"
        path="/api/v1/subscriptions/{id}/cancel"
        title="ביטול מנוי"
        description="ברירת מחדל: ביטול בסוף תקופה (cancel_at_period_end=true). אם at_period_end=false → ביטול מיידי."
        request={{
          reason: "סיבה אופציונלית",
          at_period_end: true,
        }}
        response={{
          id: "uuid",
          status: "active",
          cancel_at_period_end: true,
          current_period_end: "2026-06-05",
        }}
        productSlug={productSlug}
        baseUrl={baseUrl}
      />

      <Endpoint
        method="POST"
        path="/api/v1/commissions"
        title="עמלת עסקה (push-per-order)"
        description="קוראים על כל הזמנה ששולמה. idempotency_key חובה למניעת כפילויות (משתמשים ב-order_id)."
        request={{
          customer_id: "uuid",
          subscription_id: "uuid",
          source_external_id: "order_12345",
          idempotency_key: "order_12345",
          amount: 250.0,
          fee_rate: 0.005,
          period_start: "2026-05-01",
          period_end: "2026-05-15",
        }}
        response={{
          id: "uuid",
          base_amount: "1.25",
          status: "pending",
        }}
        productSlug={productSlug}
        baseUrl={baseUrl}
      />

      <Endpoint
        method="GET"
        path="/api/v1/invoices?customer_id={id}"
        title="רשימת חשבוניות"
        description="חשבוניות של לקוח/פרוייקט. אפשר לסנן status, type, from, to."
        productSlug={productSlug}
        baseUrl={baseUrl}
      />

      <WebhookSection productSlug={productSlug} />
    </div>
  );
}

function Intro({ productName, baseUrl }: { productName: string; baseUrl: string }) {
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
      <h3 className="font-semibold text-emerald-900 mb-2">
        אינטגרציה לפרוייקט{" "}
        <span className="ltr-num" dir="ltr">{productName}</span>
      </h3>
      <p className="text-sm text-emerald-900/80 leading-relaxed">
        כל הקריאות ל-API דורשות שלוש כותרות אבטחה. למטה helper מוכן ב-TypeScript להעתקה ישירה לפרוייקט.
      </p>
      <div className="mt-3 text-xs text-emerald-900/70 flex items-center gap-2" dir="ltr">
        <span className="font-medium">Base URL:</span>
        <code className="font-mono bg-white/60 px-2 py-0.5 rounded">
          {baseUrl}
        </code>
      </div>
      <div className="mt-2 text-xs text-emerald-900/70 flex flex-wrap items-center gap-2" dir="ltr">
        <span className="font-medium">Required headers:</span>
        <code className="font-mono bg-white/60 px-2 py-0.5 rounded">Authorization</code>
        <code className="font-mono bg-white/60 px-2 py-0.5 rounded">X-Product-Id</code>
        <code className="font-mono bg-white/60 px-2 py-0.5 rounded">X-Signature</code>
        <code className="font-mono bg-white/60 px-2 py-0.5 rounded">X-Timestamp</code>
      </div>
    </div>
  );
}

function AuthSection({ productSlug, baseUrl }: { productSlug: string; baseUrl: string }) {
  const code = `# .env (in your product app)
QC_BILLING_BASE_URL=${baseUrl}
QC_BILLING_PRODUCT_ID=${productSlug}
QC_BILLING_API_KEY=qcb_...        # API key shown once on key creation
QC_BILLING_HMAC_SECRET=whsec_...  # webhook secret shown once`;

  return (
    <SectionCard title="1. הגדרות סביבה" defaultOpen>
      <p className="text-sm text-neutral-600 mb-3">
        צור משתני סביבה בפרוייקט הקוד של{" "}
        <span className="ltr-num font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded" dir="ltr">
          {productSlug}
        </span>
        . שמור את המפתחות שקיבלת ביצירת הפרוייקט — לא נציג אותם שוב.
      </p>
      <CodeBlock language="env" code={code} />
    </SectionCard>
  );
}

function ClientHelper({ productSlug, baseUrl }: { productSlug: string; baseUrl: string }) {
  const tsClient = `// lib/billing-hub.ts
import crypto from "node:crypto";

const BASE = process.env.QC_BILLING_BASE_URL!;
const PRODUCT_ID = process.env.QC_BILLING_PRODUCT_ID!;
const API_KEY = process.env.QC_BILLING_API_KEY!;
const HMAC_SECRET = process.env.QC_BILLING_HMAC_SECRET!;

export async function billingHub<T = unknown>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: object,
  options?: { idempotencyKey?: string },
): Promise<T> {
  const rawBody = body ? JSON.stringify(body) : "";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac("sha256", HMAC_SECRET)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest("hex");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: \`Bearer \${API_KEY}\`,
    "X-Product-Id": PRODUCT_ID,
    "X-Signature": signature,
    "X-Timestamp": timestamp,
  };

  // Idempotency-Key required on all mutations
  if (method !== "GET") {
    headers["X-Idempotency-Key"] =
      options?.idempotencyKey ?? crypto.randomUUID();
  }

  const res = await fetch(\`\${BASE}\${path}\`, {
    method,
    headers,
    body: rawBody || undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(\`BillingHub \${method} \${path} failed: \${res.status} \${text}\`);
  }

  return res.json() as Promise<T>;
}`;

  return (
    <SectionCard title="2. Client Helper (TypeScript)" defaultOpen>
      <p className="text-sm text-neutral-600 mb-3">
        העתק את הקובץ לפרוייקט. הוא מטפל אוטומטית בחתימת בקשות, חותמות זמן, ומניעת כפילויות.
      </p>
      <CodeBlock language="typescript" code={tsClient} />
    </SectionCard>
  );
}

function Endpoint({
  method,
  path,
  title,
  description,
  request,
  response,
  productSlug,
  baseUrl,
}: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  title: string;
  description: string;
  request?: object;
  response?: object;
  productSlug: string;
  baseUrl: string;
}) {
  void productSlug;
  const tsExample = request
    ? `await billingHub("${method}", "${path}", ${JSON.stringify(request, null, 2)});`
    : `await billingHub("${method}", "${path}");`;

  const curlExample = buildCurl(method, path, baseUrl, request);

  return (
    <SectionCard
      title={
        <div className="flex items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-3 shrink-0" dir="ltr">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${methodColor(method)}`}>
              {method}
            </span>
            <code className="font-mono text-[13px] text-neutral-900">{path}</code>
          </div>
          <span className="text-sm text-neutral-500 truncate text-left">
            {title}
          </span>
        </div>
      }
    >
      <p className="text-sm text-neutral-600 mb-3">{description}</p>
      <Tabs
        tabs={[
          {
            label: "TypeScript",
            content: <CodeBlock language="typescript" code={tsExample} />,
          },
          {
            label: "curl",
            content: <CodeBlock language="bash" code={curlExample} />,
          },
          ...(response
            ? [
                {
                  label: "Response",
                  content: (
                    <CodeBlock
                      language="json"
                      code={JSON.stringify(response, null, 2)}
                    />
                  ),
                },
              ]
            : []),
        ]}
      />
    </SectionCard>
  );
}

function WebhookSection({ productSlug }: { productSlug: string }) {
  void productSlug;
  const code = `// app/api/billing-webhook/route.ts (or similar)
import crypto from "node:crypto";

const HMAC_SECRET = process.env.QC_BILLING_HMAC_SECRET!;

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-quickcommerce-signature") || "";

  // Verify signature: "sha256=<hex>"
  const expected = "sha256=" + crypto
    .createHmac("sha256", HMAC_SECRET)
    .update(rawBody)
    .digest("hex");

  if (signature !== expected) {
    return new Response("invalid signature", { status: 401 });
  }

  const event = JSON.parse(rawBody);
  // event.event = "subscription.created" | "invoice.paid" | "charge.failed" | ...
  // event.data = { ... }
  switch (event.event) {
    case "invoice.paid":
      // mark paid in your DB, fulfill access, etc.
      break;
    case "charge.failed":
      // notify the merchant
      break;
    case "subscription.cancelled":
      // disable access
      break;
  }

  return Response.json({ ok: true });
}`;

  return (
    <SectionCard title="3. קבלת webhooks (אירועים מאיתנו אליכם)">
      <p className="text-sm text-neutral-600 mb-3 leading-relaxed">
        הפרוייקט מקבל עדכוני אירועים בזמן אמת — תשלומים, ביטולי מנוי, כשלי חיוב.
        רשום endpoint בעמוד הזה תחת &quot;Webhook Endpoints&quot;.
        החתימה מועברת בכותרת{" "}
        <code className="font-mono text-xs ltr-num bg-neutral-100 px-1.5 py-0.5 rounded" dir="ltr">
          X-Quickcommerce-Signature
        </code>
        {" "}בפורמט{" "}
        <code className="font-mono text-xs ltr-num bg-neutral-100 px-1.5 py-0.5 rounded" dir="ltr">
          sha256=hex
        </code>
        .
      </p>
      <CodeBlock language="typescript" code={code} />
      <div className="mt-4 text-sm text-neutral-700">
        <strong>אירועים זמינים:</strong>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs font-mono ltr-num text-neutral-600">
          <li>customer.created</li>
          <li>customer.updated</li>
          <li>subscription.created</li>
          <li>subscription.updated</li>
          <li>subscription.cancelled</li>
          <li>subscription.trial_will_end</li>
          <li>invoice.created</li>
          <li>invoice.paid</li>
          <li>invoice.failed</li>
          <li>invoice.refunded</li>
          <li>charge.failed</li>
          <li>charge.recovered</li>
          <li>payment_method.created</li>
          <li>payment_method.expired</li>
        </ul>
      </div>
    </SectionCard>
  );
}

function SectionCard({
  title,
  children,
  defaultOpen,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="bg-white border border-neutral-200 rounded-2xl overflow-hidden group"
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary className="px-5 py-4 cursor-pointer flex items-center justify-between hover:bg-neutral-50 transition list-none">
        <div className="flex-1 font-medium text-neutral-900">{title}</div>
        <svg
          className="w-4 h-4 text-neutral-400 group-open:rotate-180 transition shrink-0 mr-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="px-5 pb-5 pt-2">{children}</div>
    </details>
  );
}

function Tabs({
  tabs,
}: {
  tabs: { label: string; content: React.ReactNode }[];
}) {
  return (
    <details className="group">
      <summary className="cursor-pointer flex items-center gap-1 mb-2 list-none">
        <div className="inline-flex bg-neutral-100 rounded-lg p-1 gap-1 ltr-num" dir="ltr">
          {tabs.map((t, i) => (
            <span
              key={t.label}
              className={`px-3 py-1 rounded-md text-xs font-medium ${i === 0 ? "bg-white text-neutral-900" : "text-neutral-500"}`}
            >
              {t.label}
            </span>
          ))}
        </div>
      </summary>
      <div className="space-y-3">
        {tabs.map((t) => (
          <div key={t.label}>
            <div className="text-[11px] font-mono text-neutral-400 mb-1 ltr-num">
              {t.label}
            </div>
            {t.content}
          </div>
        ))}
      </div>
    </details>
  );
}

function methodColor(method: string): string {
  switch (method) {
    case "GET":
      return "bg-blue-100 text-blue-700";
    case "POST":
      return "bg-emerald-100 text-emerald-700";
    case "PATCH":
      return "bg-amber-100 text-amber-700";
    case "DELETE":
      return "bg-red-100 text-red-700";
    default:
      return "bg-neutral-100 text-neutral-700";
  }
}

function buildCurl(
  method: string,
  path: string,
  baseUrl: string,
  body?: object,
): string {
  const lines = [
    `# Replace placeholders with values from .env`,
    `TS=$(date +%s)`,
    `BODY='${body ? JSON.stringify(body) : ""}'`,
    `SIG=$(echo -n "$TS.$BODY" | openssl dgst -sha256 -hmac "$QC_BILLING_HMAC_SECRET" | cut -d' ' -f2)`,
    ``,
    `curl -X ${method} ${baseUrl}${path} \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "Authorization: Bearer $QC_BILLING_API_KEY" \\`,
    `  -H "X-Product-Id: $QC_BILLING_PRODUCT_ID" \\`,
    `  -H "X-Signature: $SIG" \\`,
    `  -H "X-Timestamp: $TS" \\`,
  ];
  if (method !== "GET") {
    lines.push(`  -H "X-Idempotency-Key: $(uuidgen)" \\`);
  }
  if (body) {
    lines.push(`  -d "$BODY"`);
  }
  return lines.join("\n");
}
