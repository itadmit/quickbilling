import Link from "next/link";
import { and, desc, eq, exists, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  customers,
  customerProductLinks,
  subscriptions,
  products,
} from "@/lib/db/schema";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { FilterBar, SearchInput } from "@/components/dashboard/filter-bar";
import { getSelectedProjectId } from "@/lib/selected-project";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const filter = q?.trim();
  const projectId = await getSelectedProjectId();

  const [project] = projectId
    ? await db
        .select()
        .from(products)
        .where(eq(products.id, projectId))
        .limit(1)
    : [null];

  const conds: SQL[] = [];
  if (filter) {
    conds.push(
      or(
        ilike(customers.email, `%${filter}%`),
        ilike(customers.name, `%${filter}%`),
        ilike(customers.phone, `%${filter}%`),
      )!,
    );
  }
  if (projectId) {
    conds.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(customerProductLinks)
          .where(
            and(
              eq(customerProductLinks.customerId, customers.id),
              eq(customerProductLinks.productId, projectId),
            ),
          ),
      ),
    );
  }

  // Active count counts only the selected project's subs when one is chosen
  const activeCountSql = projectId
    ? sql<number>`(
        SELECT COUNT(*)::int FROM ${subscriptions}
        WHERE ${subscriptions.customerId} = ${customers.id}
        AND ${subscriptions.productId} = ${projectId}
        AND ${subscriptions.status} IN ('active','trial','past_due')
      )`
    : sql<number>`(
        SELECT COUNT(*)::int FROM ${subscriptions}
        WHERE ${subscriptions.customerId} = ${customers.id}
        AND ${subscriptions.status} IN ('active','trial','past_due')
      )`;

  const customerRows = await db
    .select({
      id: customers.id,
      email: customers.email,
      name: customers.name,
      phone: customers.phone,
      createdAt: customers.createdAt,
      activeCount: activeCountSql,
    })
    .from(customers)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(customers.createdAt))
    .limit(100);

  return (
    <div>
      <PageHeader
        title="לקוחות"
        subtitle={
          project
            ? `${customerRows.length} לקוחות ב-${project.name}`
            : `${customerRows.length} לקוחות בכל הפרוייקטים`
        }
      />

      <FilterBar>
        <SearchInput
          placeholder="חיפוש לפי אימייל, שם, או טלפון"
          defaultValue={filter}
        />
      </FilterBar>

      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100">
              <Th>שם / אימייל</Th>
              <Th>טלפון</Th>
              <Th>{project ? "סטטוס במנוי" : "מנויים פעילים"}</Th>
              <Th>תאריך</Th>
            </tr>
          </thead>
          <tbody>
            {customerRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-16 text-center text-neutral-400">
                  אין לקוחות {filter ? "התואמים את החיפוש" : project ? `ב-${project.name}` : "במערכת"}
                </td>
              </tr>
            ) : (
              customerRows.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50/50 transition"
                >
                  <td className="px-5 py-4">
                    <Link href={`/customers/${c.id}`} className="block">
                      <div className="font-medium text-neutral-900">
                        {c.name ?? c.email}
                      </div>
                      {c.name && (
                        <div className="text-xs text-neutral-500 ltr-num mt-0.5">
                          {c.email}
                        </div>
                      )}
                    </Link>
                  </td>
                  <td className="px-5 py-4 ltr-num text-neutral-700">
                    {c.phone ?? "—"}
                  </td>
                  <td className="px-5 py-4">
                    {c.activeCount > 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {c.activeCount} פעילים
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400">ללא מנוי</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-neutral-500 text-xs">
                    {formatDate(c.createdAt)}
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
