import { X } from "lucide-react";
import { Logo } from "@/components/logo";

export const dynamic = "force-dynamic";

export default async function BillingFailedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  const get = (k: string): string | undefined => {
    const v = p[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const description = get("status_description");
  const code = get("status_code");
  const fourDigits = get("four_digits");
  const date = get("date");
  const moreInfo = get("more_info");

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="absolute top-6 right-8">
        <Logo size="md" tone="dark" />
      </div>

      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 ring-8 ring-rose-50/40">
          <X className="h-8 w-8 text-rose-600" strokeWidth={2.5} />
        </div>

        <h1 className="text-[28px] font-semibold tracking-tight text-neutral-900 mb-2">
          התשלום לא הושלם
        </h1>
        <p className="text-[14px] text-neutral-500 mb-10">
          {description ?? "אירעה תקלה בעת ביצוע העסקה. הכרטיס לא חויב."}
        </p>

        <dl className="text-right space-y-3 rounded-2xl border border-neutral-200 bg-white px-5 py-5">
          {code && <Row label="קוד שגיאה" value={code} />}
          {fourDigits && <Row label="כרטיס" value={`•••• ${fourDigits}`} />}
          {date && <Row label="תאריך" value={date} />}
          {moreInfo && <Row label="הערה" value={moreInfo} />}
        </dl>

        <p className="mt-8 text-[12px] text-neutral-400">
          ניתן לסגור את החלון ולנסות שוב.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-[13px]">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="ltr-num text-neutral-900 font-medium">{value}</dd>
    </div>
  );
}
