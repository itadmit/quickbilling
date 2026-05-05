"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function SecretRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="px-5 py-4 flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-neutral-500 mb-1.5">{label}</div>
        <div className="font-mono text-sm ltr-num truncate text-neutral-900" dir="ltr">
          {value}
        </div>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition ${
          copied
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-white border-neutral-200 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"
        }`}
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5" strokeWidth={2} />
            הועתק
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5" strokeWidth={2} />
            העתק
          </>
        )}
      </button>
    </div>
  );
}
