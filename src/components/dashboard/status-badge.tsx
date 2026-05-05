import { statusLabel } from "@/lib/format";

const VARIANTS: Record<string, { bg: string; text: string; dot: string }> = {
  // subscription
  trial: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  active: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  past_due: { bg: "bg-amber-50", text: "text-amber-800", dot: "bg-amber-500" },
  cancelled: { bg: "bg-neutral-100", text: "text-neutral-600", dot: "bg-neutral-400" },
  expired: { bg: "bg-neutral-100", text: "text-neutral-600", dot: "bg-neutral-400" },
  paused: { bg: "bg-neutral-100", text: "text-neutral-600", dot: "bg-neutral-400" },
  // invoice
  draft: { bg: "bg-neutral-100", text: "text-neutral-600", dot: "bg-neutral-400" },
  pending: { bg: "bg-amber-50", text: "text-amber-800", dot: "bg-amber-500" },
  paid: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  failed: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  refunded: { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  // invoice types
  subscription: { bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-500" },
  addon: { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500" },
  commission: { bg: "bg-fuchsia-50", text: "text-fuchsia-700", dot: "bg-fuchsia-500" },
  manual: { bg: "bg-neutral-100", text: "text-neutral-700", dot: "bg-neutral-500" },
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const v = (status && VARIANTS[status]) || VARIANTS.draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${v.bg} ${v.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${v.dot}`} />
      {statusLabel(status)}
    </span>
  );
}
