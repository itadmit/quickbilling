export function formatILS(value: number | string | null | undefined): string {
  if (value == null) return "—";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const STATUS_LABELS: Record<string, string> = {
  trial: "טריאל",
  active: "פעיל",
  past_due: "חוב",
  cancelled: "מבוטל",
  expired: "פג תוקף",
  paused: "מושהה",
  draft: "טיוטה",
  pending: "ממתין",
  paid: "שולם",
  failed: "נכשל",
  refunded: "הוחזר",
  subscription: "מנוי",
  addon: "תוסף",
  commission: "עמלה",
  manual: "ידני",
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return STATUS_LABELS[status] ?? status;
}

const STATUS_COLORS: Record<string, string> = {
  trial: "bg-blue-100 text-blue-700",
  active: "bg-emerald-100 text-emerald-700",
  past_due: "bg-amber-100 text-amber-800",
  cancelled: "bg-neutral-200 text-neutral-700",
  expired: "bg-neutral-200 text-neutral-700",
  paused: "bg-neutral-200 text-neutral-700",
  paid: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-700",
  refunded: "bg-purple-100 text-purple-700",
  draft: "bg-neutral-100 text-neutral-700",
};

export function statusColor(status: string | null | undefined): string {
  if (!status) return "bg-neutral-100 text-neutral-600";
  return STATUS_COLORS[status] ?? "bg-neutral-100 text-neutral-700";
}
