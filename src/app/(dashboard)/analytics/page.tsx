import { eq } from "drizzle-orm";
import { TrendingUp, Users, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db/client";
import { platformSettings, products } from "@/lib/db/schema";
import { formatILS, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { getSelectedProjectId } from "@/lib/selected-project";

export const dynamic = "force-dynamic";

interface ProductSnapshot {
  product_id: string;
  product_slug: string;
  active_count: number;
  trial_count: number;
  past_due_count: number;
  mrr: number;
  arr: number;
  revenue_this_month: number;
}

interface Snapshot {
  generated_at: string;
  total: { mrr: number; arr: number; active_subscriptions: number };
  per_product: ProductSnapshot[];
}

export default async function AnalyticsPage() {
  const [row] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, "metrics_rollup_v1"))
    .limit(1);

  const snapshot = (row?.value ?? null) as Snapshot | null;
  const projectId = await getSelectedProjectId();

  const [project] = projectId
    ? await db.select().from(products).where(eq(products.id, projectId)).limit(1)
    : [null];

  // If a project is selected, show only its row
  const projectMetrics: ProductSnapshot | undefined = projectId
    ? snapshot?.per_product.find((p) => p.product_id === projectId)
    : undefined;

  const total = projectMetrics
    ? {
        mrr: projectMetrics.mrr,
        arr: projectMetrics.arr,
        active_subscriptions: projectMetrics.active_count,
      }
    : snapshot?.total;

  return (
    <div>
      <PageHeader
        title="אנליטיקה"
        subtitle={
          snapshot
            ? `${project ? `${project.name} • ` : ""}עודכן: ${formatDateTime(snapshot.generated_at)}`
            : "Snapshot עדיין לא נוצר — הרץ את ה-cron metrics-rollup"
        }
      />

      {!snapshot || !total ? (
        <div className="bg-white border border-dashed border-neutral-300 rounded-2xl p-16 text-center">
          <TrendingUp
            className="w-10 h-10 mx-auto text-neutral-300 mb-3"
            strokeWidth={1.5}
          />
          <div className="text-neutral-600 mb-1">אין נתונים עדיין</div>
          <div className="text-sm text-neutral-500">
            הרץ{" "}
            <code className="font-mono ltr-num bg-neutral-100 px-2 py-0.5 rounded text-xs">
              POST /api/cron/metrics-rollup
            </code>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-8">
            <Stat label="MRR" value={formatILS(total.mrr)} Icon={TrendingUp} />
            <Stat label="ARR" value={formatILS(total.arr)} Icon={TrendingUp} />
            <Stat
              label="מנויים פעילים"
              value={String(total.active_subscriptions)}
              Icon={Users}
            />
          </div>

          {!projectId && (
            <>
              <h2 className="text-base font-semibold mb-3 text-neutral-900">
                פר פרוייקט
              </h2>
              <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100">
                      <Th>פרוייקט</Th>
                      <Th>פעילים</Th>
                      <Th>טריאל</Th>
                      <Th>חוב</Th>
                      <Th>MRR</Th>
                      <Th>הכנסות החודש</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.per_product.map((p) => (
                      <tr
                        key={p.product_id}
                        className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50/50 transition"
                      >
                        <td className="px-5 py-4 font-medium text-neutral-900">
                          {p.product_slug}
                        </td>
                        <td className="px-5 py-4 ltr-num">{p.active_count}</td>
                        <td className="px-5 py-4 ltr-num">{p.trial_count}</td>
                        <td className="px-5 py-4">
                          {p.past_due_count > 0 ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 font-medium">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {p.past_due_count}
                            </span>
                          ) : (
                            <span className="text-neutral-400">0</span>
                          )}
                        </td>
                        <td className="px-5 py-4 ltr-num font-medium text-neutral-900">
                          {formatILS(p.mrr)}
                        </td>
                        <td className="px-5 py-4 ltr-num text-neutral-900">
                          {formatILS(p.revenue_this_month)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {projectMetrics && (
            <div className="grid grid-cols-3 gap-4">
              <Stat
                label="טריאל"
                value={String(projectMetrics.trial_count)}
                Icon={Users}
              />
              <Stat
                label="חוב"
                value={String(projectMetrics.past_due_count)}
                Icon={AlertTriangle}
              />
              <Stat
                label="הכנסות החודש"
                value={formatILS(projectMetrics.revenue_this_month)}
                Icon={TrendingUp}
              />
            </div>
          )}
        </>
      )}
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

function Stat({
  label,
  value,
  Icon,
}: {
  label: string;
  value: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-neutral-500">{label}</div>
        <div className="w-9 h-9 rounded-xl bg-emerald-50 grid place-items-center">
          <Icon className="w-4 h-4 text-emerald-700" strokeWidth={1.75} />
        </div>
      </div>
      <div className="text-3xl font-semibold tabular-nums ltr-num text-neutral-900">
        {value}
      </div>
    </div>
  );
}
