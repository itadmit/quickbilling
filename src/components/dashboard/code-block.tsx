"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CodeBlock({
  code,
  language,
}: {
  code: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group" dir="ltr">
      {language && (
        <div className="absolute top-2 left-2 text-[10px] uppercase tracking-wider text-neutral-400 font-mono">
          {language}
        </div>
      )}
      <button
        onClick={onCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-neutral-800/0 group-hover:bg-neutral-800 text-neutral-400 hover:text-white transition opacity-0 group-hover:opacity-100"
        type="button"
        aria-label="העתק"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <pre className="bg-neutral-900 text-neutral-100 rounded-xl p-4 pt-7 overflow-x-auto text-[12.5px] leading-relaxed font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}
