import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, KeyRound, Shield, Power } from "lucide-react";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products, plans, subscriptions, invoices } from "@/lib/db/schema";
import { formatDate, formatILS } from "@/lib/format";
import { ApiDocs } from "@/components/dashboard/api-docs";
import { DeleteProjectButton } from "@/components/dashboard/delete-project";
import {
  rotateApiKey,
  rotateWebhookSecret,
  toggleActive,
  deleteProject,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!product) notFound();

  const [planRows, subStats, invoiceCount] = await Promise.all([
    db
      .select()
      .from(plans)
      .where(eq(plans.productId, id))
      .orderBy(desc(plans.active), desc(plans.createdAt)),
    db
      .select({
        total: sql<number>`COUNT(*)::int`,
        active: sql<number>`COUNT(*) FILTER (WHERE ${subscriptions.status} = 'active')::int`,
        trial: sql<number>`COUNT(*) FILTER (WHERE ${subscriptions.status} = 'trial')::int`,
        past_due: sql<number>`COUNT(*) FILTER (WHERE ${subscriptions.status} = 'past_due')::int`,
      })
      .from(subscriptions)
      .where(eq(subscriptions.productId, id)),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(invoices)
      .where(eq(invoices.productId, id)),
  ]);
  const totalSubs = subStats[0]?.total ?? 0;
  const totalInvoices = invoiceCount[0]?.count ?? 0;

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://billing.quickcommerce.co.il";

  return (
    <div>
      <Link
        href="/products"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 mb-3"
      >
        <ArrowRight className="w-4 h-4" />
        חזרה לפרוייקטים
      </Link>

      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[26px] font-semibold tracking-tight text-neutral-900">
              {product.name}
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                product.active
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-neutral-100 text-neutral-600"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${product.active ? "bg-emerald-500" : "bg-neutral-400"}`}
              />
              {product.active ? "פעיל" : "כבוי"}
            </span>
          </div>
          <div className="text-sm text-neutral-500 ltr-num">/{product.slug}</div>
        </div>
        <form action={toggleActive}>
          <input type="hidden" name="id" value={product.id} />
          <input type="hidden" name="active" value={String(!product.active)} />
          <button
            type="submit"
            className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 px-3 py-1.5 rounded-lg border border-neutral-200 hover:border-neutral-300"
          >
            <Power className="w-3.5 h-3.5" />
            {product.active ? "כבה" : "הפעל"}
          </button>
        </form>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <Stat label="מנויים פעילים" value={subStats[0]?.active ?? 0} accent="emerald" />
        <Stat label="טריאל" value={subStats[0]?.trial ?? 0} accent="blue" />
        <Stat label="חוב" value={subStats[0]?.past_due ?? 0} accent="amber" />
        <Stat label="סך הכל" value={subStats[0]?.total ?? 0} accent="neutral" />
      </div>

      {/* API Keys */}
      <h2 className="text-base font-semibold mb-3 text-neutral-900">
        מפתחות API
      </h2>
      <div className="bg-white border border-neutral-200 rounded-2xl mb-8 divide-y divide-neutral-100">
        <KeyRow
          Icon={KeyRound}
          label="API Key"
          description="המפתח שהמוצר שולח אלינו בכותרת ההזדהות. מוצג רק פעם אחת — ביצירה או בסבבון."
          rotateAction={rotateApiKey}
          productId={product.id}
        />
        <KeyRow
          Icon={Shield}
          label="Webhook Secret"
          description="משמש לחתימת קריאות API ולאימות אירועים יוצאים אליכם. אלגוריתם: HMAC-SHA256."
          rotateAction={rotateWebhookSecret}
          productId={product.id}
        />
      </div>

      {/* Plans */}
      <h2 className="text-base font-semibold mb-3 text-neutral-900">תוכניות</h2>
      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden mb-8">
        {planRows.length === 0 ? (
          <div className="px-5 py-12 text-center text-neutral-400 text-sm">
            אין תוכניות. הוסף דרך ה-API או דרך ה-DB.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100">
                <Th>קוד</Th>
                <Th>שם</Th>
                <Th>חודשי</Th>
                <Th>שנתי</Th>
                <Th>טריאל</Th>
                <Th>סטטוס</Th>
              </tr>
            </thead>
            <tbody>
              {planRows.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-neutral-50 last:border-0"
                >
                  <td className="px-5 py-3 font-mono text-xs ltr-num text-neutral-700">
                    {p.code}
                  </td>
                  <td className="px-5 py-3 text-neutral-900">{p.name}</td>
                  <td className="px-5 py-3 ltr-num">
                    {formatILS(p.monthlyPrice)}
                  </td>
                  <td className="px-5 py-3 ltr-num">
                    {p.yearlyPrice ? formatILS(p.yearlyPrice) : "—"}
                  </td>
                  <td className="px-5 py-3 text-neutral-600">
                    {p.trialDays != null ? (
                      <>
                        <span className="ltr-num">{p.trialDays}</span> ימים
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-neutral-500">
                    {p.active ? "פעיל" : "כבוי"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* API Docs */}
      <div className="mb-3">
        <h2 className="text-base font-semibold text-neutral-900">תיעוד API</h2>
        <p className="text-xs text-neutral-500 mt-1">
          להעתקה לתוך פרוייקט הקוד של{" "}
          <span className="ltr-num" dir="ltr">
            {product.name}
          </span>
          .
        </p>
      </div>
      <ApiDocs
        productSlug={product.slug}
        productName={product.name}
        baseUrl={baseUrl}
      />

      {/* Danger Zone */}
      <h2 className="text-base font-semibold mb-3 mt-12 text-neutral-900">
        אזור מסוכן
      </h2>
      <DeleteProjectButton
        productId={product.id}
        productSlug={product.slug}
        productName={product.name}
        hasDependencies={totalSubs > 0 || totalInvoices > 0}
        subCount={totalSubs}
        invoiceCount={totalInvoices}
        action={deleteProject}
      />

      <div className="mt-8 text-xs text-neutral-400">
        נוצר {formatDate(product.createdAt)} • עודכן {formatDate(product.updatedAt)}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "emerald" | "blue" | "amber" | "neutral";
}) {
  const colors = {
    emerald: "text-emerald-700",
    blue: "text-blue-700",
    amber: "text-amber-700",
    neutral: "text-neutral-700",
  }[accent];
  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-5">
      <div className="text-xs text-neutral-500 mb-1">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ltr-num ${colors}`}>
        {value}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-3 text-right font-medium text-neutral-500 text-xs uppercase tracking-wide">
      {children}
    </th>
  );
}

function KeyRow({
  Icon,
  label,
  description,
  rotateAction,
  productId,
}: {
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  description: string;
  rotateAction: (formData: FormData) => Promise<void>;
  productId: string;
}) {
  return (
    <div className="px-5 py-4 flex items-start gap-4">
      <div className="w-9 h-9 rounded-xl bg-neutral-100 grid place-items-center shrink-0">
        <Icon className="w-4 h-4 text-neutral-600" strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium text-neutral-900 ltr-num" dir="ltr">
              {label}
            </div>
            <div className="text-xs text-neutral-400 mt-1">
              <span className="font-mono ltr-num" dir="ltr">
                ••••••••••••••••••••
              </span>
              <span className="mx-2">·</span>
              <span>מוסתר. אם איבדת — סבב חדש</span>
            </div>
          </div>
          <form action={rotateAction}>
            <input type="hidden" name="id" value={productId} />
            <button
              type="submit"
              className="text-xs px-3 py-1.5 rounded-lg border border-neutral-200 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-800 transition whitespace-nowrap"
            >
              סבב חדש
            </button>
          </form>
        </div>
        <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
