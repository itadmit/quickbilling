"use client";

import { useState } from "react";
import { Trash2, AlertTriangle } from "lucide-react";

export function DeleteProjectButton({
  productId,
  productSlug,
  productName,
  hasDependencies,
  subCount,
  invoiceCount,
  action,
}: {
  productId: string;
  productSlug: string;
  productName: string;
  hasDependencies: boolean;
  subCount: number;
  invoiceCount: number;
  action: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");

  return (
    <div className="bg-white border border-red-200 rounded-2xl p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-red-50 grid place-items-center shrink-0">
          <Trash2 className="w-4 h-4 text-red-700" strokeWidth={1.75} />
        </div>
        <div className="flex-1">
          <div className="font-medium text-neutral-900">מחיקת פרוייקט</div>
          <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
            מחיקה היא בלתי הפיכה. כל הקישורים, התוכניות וה-webhook endpoints יוסרו.
            לא ניתן למחוק פרוייקט עם מנויים או חשבוניות קיימים — רק להפוך אותו לכבוי.
          </p>
        </div>
      </div>

      {hasDependencies ? (
        <div className="text-sm text-neutral-600 bg-neutral-50 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <strong>לא ניתן למחוק.</strong> לפרוייקט יש{" "}
            <span className="ltr-num">{subCount}</span> מנויים ו-
            <span className="ltr-num">{invoiceCount}</span> חשבוניות.
            לחץ על &quot;כבה&quot; למעלה כדי להפסיק קריאות API חדשות.
          </div>
        </div>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 text-sm text-red-700 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50 hover:border-red-300 transition"
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
          מחק פרוייקט
        </button>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="id" value={productId} />
          <div className="text-sm text-neutral-700">
            כדי לאשר, הקלד את ה-slug של הפרוייקט:{" "}
            <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded ltr-num">
              {productSlug}
            </code>
          </div>
          <input
            name="confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={productSlug}
            className="w-full text-left ltr-num font-mono border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
            dir="ltr"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={confirm !== productSlug}
              className="inline-flex items-center gap-1.5 bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3.5 h-3.5" />
              מחק את {productName}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirm("");
              }}
              className="text-sm text-neutral-600 px-4 py-2 rounded-lg hover:bg-neutral-100 transition"
            >
              ביטול
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
