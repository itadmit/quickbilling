"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";

interface PlanDraft {
  code: string;
  name: string;
  monthly_price: number;
  trial_days?: number;
}

export function ProductWizard({
  action,
}: {
  action: (formData: FormData) => Promise<unknown>;
}) {
  const [step, setStep] = useState(1);
  const [details, setDetails] = useState({
    slug: "",
    name: "",
    base_url: "",
    invoice_prefix: "",
    default_trial_days: 14,
    default_fee_percentage: "",
  });
  const [plans, setPlans] = useState<PlanDraft[]>([
    { code: "starter", name: "Starter", monthly_price: 199 },
    { code: "pro", name: "Pro", monthly_price: 599 },
  ]);
  const [submitting, setSubmitting] = useState(false);

  // Enter never submits — only the explicit "Create" button does.
  // On steps 1-2, Enter advances. On step 3, Enter does nothing.
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (step < 3) {
      setStep(step + 1);
    }
  };

  const submitProject = async () => {
    setSubmitting(true);
    const fd = new FormData();
    Object.entries(details).forEach(([k, v]) => fd.append(k, String(v)));
    fd.append("plans", JSON.stringify(plans));
    try {
      await action(fd);
    } catch (err) {
      if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
      alert("שגיאה: " + (err instanceof Error ? err.message : "לא ידועה"));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-4">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`flex-1 h-1.5 rounded-full ${s <= step ? "bg-neutral-900" : "bg-neutral-200"}`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold mb-4">פרטים בסיסיים</h2>
          <Field label="שם הפרוייקט" required>
            <input
              type="text"
              required
              value={details.name}
              onChange={(e) => setDetails({ ...details, name: e.target.value })}
              placeholder="QuickChat"
              className="input"
            />
          </Field>
          <Field label="Slug (מזהה לוגי)" required hint="באנגלית, lowercase, ללא רווחים">
            <input
              type="text"
              required
              value={details.slug}
              onChange={(e) => setDetails({ ...details, slug: e.target.value })}
              placeholder="quickchat"
              pattern="[a-z0-9-]+"
              className="input ltr-num"
            />
          </Field>
          <Field label="קידומת חשבונית" required hint="2-5 תווים, יופיע בכל invoice number (QC-2025-000001)">
            <input
              type="text"
              required
              value={details.invoice_prefix}
              onChange={(e) => setDetails({ ...details, invoice_prefix: e.target.value.toUpperCase() })}
              placeholder="QC"
              maxLength={5}
              className="input ltr-num"
            />
          </Field>
          <Field label="Base URL (אתר המוצר)">
            <input
              type="url"
              value={details.base_url}
              onChange={(e) => setDetails({ ...details, base_url: e.target.value })}
              placeholder="https://quickchat.co.il"
              className="input ltr-num"
            />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold mb-4">תכונות עסקיות</h2>
          <Field label="ימי טריאל ברירת מחדל">
            <input
              type="number"
              min={0}
              value={details.default_trial_days}
              onChange={(e) =>
                setDetails({ ...details, default_trial_days: Number(e.target.value) })
              }
              className="input ltr-num"
            />
          </Field>
          <Field
            label="עמלת ברירת מחדל (אחוז)"
            hint="ריק אם המוצר לא גובה עמלות. למשל 0.005 = 0.5%"
          >
            <input
              type="number"
              step="0.0001"
              min={0}
              max={1}
              value={details.default_fee_percentage}
              onChange={(e) =>
                setDetails({ ...details, default_fee_percentage: e.target.value })
              }
              placeholder="0.005"
              className="input ltr-num"
            />
          </Field>
        </div>
      )}

      {step === 3 && (
        <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">תוכניות מנוי</h2>
            <button
              type="button"
              onClick={() =>
                setPlans([...plans, { code: "", name: "", monthly_price: 0 }])
              }
              className="inline-flex items-center gap-1.5 text-sm text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2} />
              תוכנית
            </button>
          </div>

          {plans.map((p, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end pb-3 border-b border-neutral-100 last:border-0">
              <div className="col-span-3">
                <label className="text-xs text-neutral-500">Code</label>
                <input
                  type="text"
                  value={p.code}
                  onChange={(e) => {
                    const next = [...plans];
                    next[i].code = e.target.value;
                    setPlans(next);
                  }}
                  placeholder="pro"
                  className="input ltr-num"
                />
              </div>
              <div className="col-span-4">
                <label className="text-xs text-neutral-500">שם</label>
                <input
                  type="text"
                  value={p.name}
                  onChange={(e) => {
                    const next = [...plans];
                    next[i].name = e.target.value;
                    setPlans(next);
                  }}
                  placeholder="Pro"
                  className="input"
                />
              </div>
              <div className="col-span-3">
                <label className="text-xs text-neutral-500">₪ חודשי</label>
                <input
                  type="number"
                  step="0.01"
                  value={p.monthly_price}
                  onChange={(e) => {
                    const next = [...plans];
                    next[i].monthly_price = Number(e.target.value);
                    setPlans(next);
                  }}
                  className="input ltr-num"
                />
              </div>
              <button
                type="button"
                onClick={() => setPlans(plans.filter((_, j) => j !== i))}
                className="col-span-2 inline-flex items-center justify-center gap-1 text-xs text-neutral-500 hover:text-red-700 hover:bg-red-50 px-2 py-2 rounded-lg transition"
                aria-label="הסר תוכנית"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                הסר
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={step === 1}
          onClick={() => setStep(step - 1)}
          className="inline-flex items-center gap-1.5 text-sm text-neutral-600 px-4 py-2 rounded-lg hover:bg-neutral-100 hover:text-neutral-900 transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-600 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" strokeWidth={2} />
          הקודם
        </button>
        {step < 3 ? (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            className="inline-flex items-center gap-1.5 bg-neutral-900 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-neutral-800 hover:shadow-md active:scale-[0.98] transition"
          >
            הבא
            <ChevronLeft className="w-4 h-4" strokeWidth={2} />
          </button>
        ) : (
          <button
            type="button"
            onClick={submitProject}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 bg-emerald-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-emerald-700 hover:shadow-md active:scale-[0.98] transition disabled:opacity-50 disabled:hover:bg-emerald-600 disabled:hover:shadow-none disabled:cursor-not-allowed"
          >
            {submitting ? "יוצר..." : "צור פרוייקט"}
          </button>
        )}
      </div>

      <style>{`
        .input {
          width: 100%;
          border: 1px solid #e5e5e5;
          background: white;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        .input:focus { outline: none; border-color: #525252; }
      `}</style>
    </form>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-sm font-medium block mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <div className="text-xs text-neutral-500 mt-1">{hint}</div>}
    </div>
  );
}
