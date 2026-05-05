import { db } from "@/lib/db/client";
import { platformSettings, staffUsers } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, staff] = await Promise.all([
    db.select().from(platformSettings),
    db.select().from(staffUsers),
  ]);

  return (
    <div>
      <PageHeader title="הגדרות" subtitle="הגדרות פלטפורמה ומשתמשי צוות" />

      <h2 className="text-base font-semibold mb-3 text-neutral-900">הגדרות פלטפורמה</h2>
      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100">
              <Th>מפתח</Th>
              <Th>ערך</Th>
              <Th>תיאור</Th>
              <Th>קטגוריה</Th>
              <Th>עודכן</Th>
            </tr>
          </thead>
          <tbody>
            {settings.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-neutral-400">
                  אין הגדרות
                </td>
              </tr>
            ) : (
              settings.map((s) => (
                <tr
                  key={s.key}
                  className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50/50 transition"
                >
                  <td className="px-5 py-4 font-mono text-xs ltr-num text-neutral-900">
                    {s.key}
                  </td>
                  <td className="px-5 py-4 font-mono text-xs ltr-num text-emerald-700">
                    {JSON.stringify(s.value)}
                  </td>
                  <td className="px-5 py-4 text-neutral-600 text-xs">
                    {s.description ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-neutral-500 text-xs">{s.category}</td>
                  <td className="px-5 py-4 text-neutral-500 text-xs">
                    {formatDateTime(s.updatedAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="text-base font-semibold mb-3 text-neutral-900">משתמשי צוות</h2>
      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100">
              <Th>אימייל</Th>
              <Th>שם</Th>
              <Th>תפקיד</Th>
              <Th>פעיל</Th>
              <Th>התחברות אחרונה</Th>
            </tr>
          </thead>
          <tbody>
            {staff.map((u) => (
              <tr
                key={u.id}
                className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50/50 transition"
              >
                <td className="px-5 py-4 ltr-num text-neutral-900">{u.email}</td>
                <td className="px-5 py-4 text-neutral-700">{u.name ?? "—"}</td>
                <td className="px-5 py-4">
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                    {u.role}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs ${u.active ? "text-emerald-700" : "text-neutral-400"}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${u.active ? "bg-emerald-500" : "bg-neutral-400"}`}
                    />
                    {u.active ? "פעיל" : "כבוי"}
                  </span>
                </td>
                <td className="px-5 py-4 text-neutral-500 text-xs">
                  {formatDateTime(u.lastLoginAt)}
                </td>
              </tr>
            ))}
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
