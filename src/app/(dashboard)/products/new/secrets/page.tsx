import Link from "next/link";
import { SecretRow } from "@/components/dashboard/secret-row";

export default async function SecretsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; api_key?: string; webhook_secret?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">הפרוייקט נוצר ✓</h1>
        <p className="text-sm text-neutral-500 mt-1">
          שמור את ה-credentials הללו במקום מאובטח. הם לא יוצגו שוב.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-900">
        ⚠️ שמור את ה-API key עכשיו. אחרי שתעזוב את הדף הזה לא תוכל לראות אותו שוב — תצטרך לסבב מפתח חדש.
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-200">
        {sp.api_key && <SecretRow label="API Key" value={sp.api_key} />}
        {sp.webhook_secret && (
          <SecretRow label="Webhook Secret" value={sp.webhook_secret} />
        )}
      </div>

      <div className="mt-8 flex gap-3">
        <Link
          href={sp.id ? `/products/${sp.id}` : "/products"}
          className="bg-neutral-900 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-neutral-800 hover:shadow-md transition"
        >
          עבור לפרוייקט
        </Link>
      </div>
    </div>
  );
}
