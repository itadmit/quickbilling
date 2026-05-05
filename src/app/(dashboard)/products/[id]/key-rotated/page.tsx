import Link from "next/link";
import { SecretRow } from "@/components/dashboard/secret-row";

export default async function KeyRotatedPage({
  searchParams,
  params,
}: {
  searchParams: Promise<{ api_key?: string; webhook_secret?: string }>;
  params: Promise<{ id: string }>;
}) {
  const sp = await searchParams;
  const { id } = await params;
  const label = sp.api_key ? "API Key" : "Webhook Secret";
  const value = sp.api_key ?? sp.webhook_secret ?? "";

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{label} סובב בהצלחה</h1>
        <p className="text-sm text-neutral-500 mt-1">
          העתק עכשיו — לא יוצג שוב. אם איבדת, סבב שוב.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-900">
        ⚠️ המפתח הקודם בוטל. עדכן עכשיו את משתנה הסביבה במוצר —
        עד שתעדכן, קריאות API יחזרו 401.
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl">
        <SecretRow label={label} value={value} />
      </div>

      <div className="mt-8 flex gap-3">
        <Link
          href={`/products/${id}`}
          className="bg-neutral-900 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-neutral-800 hover:shadow-md transition"
        >
          חזרה לפרוייקט
        </Link>
      </div>
    </div>
  );
}
