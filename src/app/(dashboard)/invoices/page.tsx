import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { customers, invoices, products } from "@/lib/db/schema";
import { formatDateTime, formatILS } from "@/lib/format";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { FilterBar, FilterSelect } from "@/components/dashboard/filter-bar";
import { getSelectedProjectId } from "@/lib/selected-project";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = [
  { value: "draft", label: "טיוטה" },
  { value: "pending", label: "ממתין" },
  { value: "paid", label: "שולם" },
  { value: "failed", label: "נכשל" },
  { value: "cancelled", label: "מבוטל" },
  { value: "refunded", label: "הוחזר" },
];
const TYPE_OPTIONS = [
  { value: "subscription", label: "מנוי" },
  { value: "addon", label: "תוסף" },
  { value: "commission", label: "עמלה" },
  { value: "manual", label: "ידני" },
];
const STATUSES = STATUS_OPTIONS.map((s) => s.value);
const TYPES = TYPE_OPTIONS.map((t) => t.value);

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const projectId = await getSelectedProjectId();

  const [project] = projectId
    ? await db.select().from(products).where(eq(products.id, projectId)).limit(1)
    : [null];

  const conds: SQL[] = [];
  if (sp.status && STATUSES.includes(sp.status))
    conds.push(eq(invoices.status, sp.status as never));
  if (sp.type && TYPES.includes(sp.type))
    conds.push(eq(invoices.type, sp.type as never));
  if (projectId) conds.push(eq(invoices.productId, projectId));

  const rows = await db
    .select({
      inv: invoices,
      customer: customers,
      product: products,
    })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .innerJoin(products, eq(invoices.productId, products.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(invoices.createdAt))
    .limit(200);

  return (
    <div>
      <PageHeader
        title="חשבוניות"
        subtitle={
          project
            ? `${rows.length} חשבוניות ב-${project.name}`
            : `${rows.length} חשבוניות בכל הפרוייקטים`
        }
      />

      <FilterBar>
        <FilterSelect
          name="status"
          defaultValue={sp.status}
          placeholder="כל הסטטוסים"
          options={STATUS_OPTIONS}
        />
        <FilterSelect
          name="type"
          defaultValue={sp.type}
          placeholder="כל הסוגים"
          options={TYPE_OPTIONS}
        />
        <button
          type="submit"
          className="bg-emerald-600 text-white rounded-full px-5 py-2 text-sm font-medium hover:bg-emerald-700 transition"
        >
          סנן
        </button>
      </FilterBar>

      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100">
              <Th>חשבונית</Th>
              <Th>לקוח</Th>
              {!project && <Th>פרוייקט</Th>}
              <Th>סוג</Th>
              <Th>סטטוס</Th>
              <Th>סכום</Th>
              <Th>תאריך</Th>
              <Th>PDF</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={project ? 7 : 8}
                  className="px-5 py-16 text-center text-neutral-400"
                >
                  אין חשבוניות
                </td>
              </tr>
            ) : (
              rows.map(({ inv, customer, product }) => (
                <tr
                  key={inv.id}
                  className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50/50 transition"
                >
                  <td className="px-5 py-4 font-mono text-xs ltr-num text-neutral-900">
                    {inv.invoiceNumber}
                  </td>
                  <td className="px-5 py-4">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="text-neutral-900 hover:text-emerald-700"
                    >
                      {customer.name ?? customer.email}
                    </Link>
                  </td>
                  {!project && (
                    <td className="px-5 py-4 text-neutral-700">{product.name}</td>
                  )}
                  <td className="px-5 py-4">
                    <StatusBadge status={inv.type} />
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-5 py-4 ltr-num font-medium text-neutral-900">
                    {formatILS(inv.totalAmount)}
                  </td>
                  <td className="px-5 py-4 text-neutral-500 text-xs ltr-num whitespace-nowrap">
                    {formatDateTime(inv.createdAt).replace(", ", " | ")}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      {inv.payplusInvoiceUrl && (
                        <a
                          href={inv.payplusInvoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 text-xs"
                        >
                          חשבונית
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {inv.payplusRefundInvoiceUrl && (
                        <a
                          href={inv.payplusRefundInvoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-rose-700 hover:text-rose-900 text-xs"
                        >
                          זיכוי
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
