import Link from "next/link";
import { ArrowRight, Phone, Hash, Calendar, ExternalLink } from "lucide-react";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import {
  customers,
  customerProductLinks,
  subscriptions,
  paymentMethods,
  invoices,
  products,
  plans,
} from "@/lib/db/schema";
import { formatILS, formatDate, formatDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/dashboard/status-badge";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  if (!customer) notFound();

  const [links, subs, pms, recentInvoices] = await Promise.all([
    db
      .select({ link: customerProductLinks, product: products })
      .from(customerProductLinks)
      .innerJoin(products, eq(customerProductLinks.productId, products.id))
      .where(eq(customerProductLinks.customerId, id)),
    db
      .select({ sub: subscriptions, plan: plans, product: products })
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .innerJoin(products, eq(subscriptions.productId, products.id))
      .where(eq(subscriptions.customerId, id))
      .orderBy(desc(subscriptions.createdAt)),
    db.select().from(paymentMethods).where(eq(paymentMethods.customerId, id)),
    db
      .select({ inv: invoices, product: products })
      .from(invoices)
      .innerJoin(products, eq(invoices.productId, products.id))
      .where(eq(invoices.customerId, id))
      .orderBy(desc(invoices.createdAt))
      .limit(20),
  ]);

  return (
    <div>
      <Link
        href="/customers"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 mb-3"
      >
        <ArrowRight className="w-4 h-4" />
        חזרה ללקוחות
      </Link>

      <div className="mb-8">
        <h1 className="text-[26px] font-semibold tracking-tight text-neutral-900">
          {customer.name ?? customer.email}
        </h1>
        <div className="text-sm text-neutral-500 mt-1 ltr-num">{customer.email}</div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <InfoCard Icon={Phone} label="טלפון" value={customer.phone} />
        <InfoCard Icon={Hash} label="ח.פ. / ת.ז." value={customer.vatNumber} />
        <InfoCard
          Icon={Calendar}
          label="לקוח מאז"
          value={formatDateTime(customer.createdAt)}
        />
      </div>

      <Section title="מנויים">
        {subs.length === 0 ? (
          <Empty>אין מנויים</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100">
                <Th>מוצר</Th>
                <Th>תוכנית</Th>
                <Th>סטטוס</Th>
                <Th>סוף תקופה</Th>
                <Th>מחיר</Th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr
                  key={s.sub.id}
                  className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50/50 transition"
                >
                  <td className="px-5 py-4 text-neutral-900">{s.product.name}</td>
                  <td className="px-5 py-4 text-neutral-700">{s.plan.name}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={s.sub.status} />
                  </td>
                  <td className="px-5 py-4 text-neutral-500 text-xs">
                    {formatDate(s.sub.currentPeriodEnd)}
                  </td>
                  <td className="px-5 py-4 ltr-num font-medium text-neutral-900">
                    {formatILS(s.sub.customMonthlyPrice ?? s.plan.monthlyPrice)}
                    <span className="text-neutral-400 text-xs"> /חודש</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="חשבוניות אחרונות">
        {recentInvoices.length === 0 ? (
          <Empty>אין חשבוניות</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100">
                <Th>חשבונית</Th>
                <Th>מוצר</Th>
                <Th>סוג</Th>
                <Th>סטטוס</Th>
                <Th>סכום</Th>
                <Th>תאריך</Th>
                <Th>PDF</Th>
              </tr>
            </thead>
            <tbody>
              {recentInvoices.map(({ inv, product }) => (
                <tr
                  key={inv.id}
                  className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50/50 transition"
                >
                  <td className="px-5 py-4 font-mono text-xs ltr-num">
                    {inv.invoiceNumber}
                  </td>
                  <td className="px-5 py-4 text-neutral-700">{product.name}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={inv.type} />
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-5 py-4 ltr-num font-medium text-neutral-900">
                    {formatILS(inv.totalAmount)}
                  </td>
                  <td className="px-5 py-4 text-neutral-500 text-xs">
                    {formatDate(inv.createdAt)}
                  </td>
                  <td className="px-5 py-4">
                    {inv.payplusInvoiceUrl && (
                      <a
                        href={inv.payplusInvoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 text-xs"
                      >
                        פתח
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="אמצעי תשלום">
        {pms.length === 0 ? (
          <Empty>אין אמצעי תשלום</Empty>
        ) : (
          <ul className="divide-y divide-neutral-50">
            {pms.map((pm) => (
              <li key={pm.id} className="px-5 py-4 flex items-center justify-between">
                <div>
                  <div className="text-sm text-neutral-900">
                    {pm.cardBrand ?? "כרטיס"}{" "}
                    <span className="ltr-num text-neutral-500">
                      ····{pm.cardLast4 ?? "????"}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500 ltr-num mt-0.5">
                    תוקף: {pm.cardExpiry ?? "—"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {pm.isDefault && (
                    <span className="text-xs px-2.5 py-1 bg-neutral-100 text-neutral-700 rounded-full">
                      ברירת מחדל
                    </span>
                  )}
                  <StatusBadge status={pm.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="מוצרים מקושרים">
        {links.length === 0 ? (
          <Empty>לא מקושר לאף מוצר</Empty>
        ) : (
          <ul className="divide-y divide-neutral-50">
            {links.map(({ link, product }) => (
              <li
                key={`${link.customerId}-${link.productId}`}
                className="px-5 py-4 flex items-center justify-between"
              >
                <div>
                  <div className="text-sm font-medium text-neutral-900">
                    {product.name}
                  </div>
                  <div className="text-xs text-neutral-500 ltr-num mt-0.5">
                    external_id: {link.externalId ?? "—"}
                  </div>
                </div>
                <div className="text-xs text-neutral-400">
                  {formatDate(link.createdAt)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-base font-semibold mb-3 text-neutral-900">{title}</h2>
      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-12 text-sm text-neutral-400 text-center">{children}</div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-3 text-right font-medium text-neutral-500 text-xs uppercase tracking-wide">
      {children}
    </th>
  );
}

function InfoCard({
  Icon,
  label,
  value,
}: {
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-5">
      <div className="flex items-center gap-2 text-xs text-neutral-500 mb-2">
        <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
        {label}
      </div>
      <div className="text-sm text-neutral-900 ltr-num">{value || "—"}</div>
    </div>
  );
}
