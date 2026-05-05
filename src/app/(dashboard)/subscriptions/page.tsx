import Link from "next/link";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { customers, plans, products, subscriptions } from "@/lib/db/schema";
import { formatDate, formatILS } from "@/lib/format";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { FilterBar, FilterSelect } from "@/components/dashboard/filter-bar";
import { getSelectedProjectId } from "@/lib/selected-project";

export const dynamic = "force-dynamic";

const STATUSES = ["trial", "active", "past_due", "cancelled", "expired", "paused"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_OPTIONS = [
  { value: "trial", label: "טריאל" },
  { value: "active", label: "פעיל" },
  { value: "past_due", label: "חוב" },
  { value: "cancelled", label: "מבוטל" },
  { value: "expired", label: "פג תוקף" },
  { value: "paused", label: "מושהה" },
];

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: Status }>;
}) {
  const { status } = await searchParams;
  const projectId = await getSelectedProjectId();

  const [project] = projectId
    ? await db.select().from(products).where(eq(products.id, projectId)).limit(1)
    : [null];

  const conds: SQL[] = [];
  if (status && (STATUSES as readonly string[]).includes(status)) {
    conds.push(eq(subscriptions.status, status));
  }
  if (projectId) conds.push(eq(subscriptions.productId, projectId));

  const rows = await db
    .select({
      sub: subscriptions,
      customer: customers,
      plan: plans,
      product: products,
    })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .innerJoin(products, eq(subscriptions.productId, products.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(subscriptions.createdAt))
    .limit(200);

  return (
    <div>
      <PageHeader
        title="מנויים"
        subtitle={
          project
            ? `${rows.length} מנויים ב-${project.name}`
            : `${rows.length} מנויים בכל הפרוייקטים`
        }
      />

      <FilterBar>
        <FilterSelect
          name="status"
          defaultValue={status}
          placeholder="כל הסטטוסים"
          options={STATUS_OPTIONS}
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
              <Th>לקוח</Th>
              {!project && <Th>פרוייקט</Th>}
              <Th>תוכנית</Th>
              <Th>סטטוס</Th>
              <Th>סוף תקופה</Th>
              <Th>מחיר</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={project ? 5 : 6}
                  className="px-5 py-16 text-center text-neutral-400"
                >
                  אין מנויים
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.sub.id}
                  className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50/50 transition"
                >
                  <td className="px-5 py-4">
                    <Link
                      href={`/customers/${r.customer.id}`}
                      className="font-medium text-neutral-900 hover:text-emerald-700"
                    >
                      {r.customer.name ?? r.customer.email}
                    </Link>
                  </td>
                  {!project && (
                    <td className="px-5 py-4 text-neutral-700">
                      {r.product.name}
                    </td>
                  )}
                  <td className="px-5 py-4 text-neutral-700">{r.plan.name}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={r.sub.status} />
                  </td>
                  <td className="px-5 py-4 text-neutral-500 text-xs">
                    {formatDate(r.sub.currentPeriodEnd)}
                  </td>
                  <td className="px-5 py-4 ltr-num font-medium text-neutral-900">
                    {formatILS(r.sub.customMonthlyPrice ?? r.plan.monthlyPrice)}
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
