import Link from "next/link";
import { Plus, PackageOpen } from "lucide-react";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products, plans, subscriptions } from "@/lib/db/schema";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const rows = await db
    .select({
      product: products,
      planCount: sql<number>`(SELECT COUNT(*)::int FROM ${plans} WHERE ${plans.productId} = ${products.id} AND ${plans.active})`,
      subCount: sql<number>`(SELECT COUNT(*)::int FROM ${subscriptions} WHERE ${subscriptions.productId} = ${products.id} AND ${subscriptions.status} IN ('active','trial','past_due'))`,
    })
    .from(products);

  return (
    <div>
      <PageHeader
        title="פרוייקטים"
        subtitle="ניהול הפרוייקטים המחוברים ל-Hub"
        actions={
          <Link
            href="/products/new"
            className="inline-flex items-center gap-2 bg-emerald-600 text-white rounded-full px-5 py-2.5 text-sm font-medium hover:bg-emerald-700 transition"
          >
            <Plus className="w-4 h-4" />
            פרוייקט חדש
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4">
        {rows.map(({ product, planCount, subCount }) => (
          <Link
            key={product.id}
            href={`/products/${product.id}`}
            className="bg-white border border-neutral-200 rounded-2xl p-6 hover:border-emerald-300 hover:shadow-sm transition block"
          >
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 grid place-items-center">
                  <PackageOpen className="w-5 h-5 text-emerald-700" strokeWidth={1.75} />
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900">{product.name}</h3>
                  <div className="text-xs text-neutral-500 ltr-num mt-0.5">
                    /{product.slug}
                  </div>
                </div>
              </div>
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

            <div className="grid grid-cols-3 gap-4 py-4 border-y border-neutral-100">
              <div>
                <div className="text-2xl font-semibold text-neutral-900 tabular-nums">
                  {planCount}
                </div>
                <div className="text-xs text-neutral-500 mt-0.5">תוכניות</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-neutral-900 tabular-nums">
                  {subCount}
                </div>
                <div className="text-xs text-neutral-500 mt-0.5">מנויים</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-neutral-900 ltr-num">
                  {product.invoicePrefix}
                </div>
                <div className="text-xs text-neutral-500 mt-0.5">קידומת</div>
              </div>
            </div>

            <div className="mt-4 text-xs text-neutral-400">
              נוצר {formatDate(product.createdAt)}
            </div>
          </Link>
        ))}

        {rows.length === 0 && (
          <div className="col-span-2 bg-white border border-dashed border-neutral-300 rounded-2xl p-16 text-center">
            <PackageOpen className="w-10 h-10 mx-auto text-neutral-300 mb-3" strokeWidth={1.5} />
            <div className="text-neutral-600 mb-1">אין פרוייקטים עדיין</div>
            <Link
              href="/products/new"
              className="text-emerald-700 hover:text-emerald-900 text-sm"
            >
              צור פרוייקט ראשון →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
