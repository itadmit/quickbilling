import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { updateProject } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!product) notFound();

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href={`/products/${id}`}
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 mb-3"
      >
        <ArrowRight className="w-4 h-4" />
        חזרה לפרוייקט
      </Link>

      <div className="mb-8">
        <h1 className="text-[26px] font-semibold tracking-tight text-neutral-900">
          עריכת פרוייקט
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          ה-slug ו-API keys לא ניתנים לעריכה. כדי לסבב מפתח, חזור לעמוד
          הפרוייקט.
        </p>
      </div>

      <form action={updateProject} className="space-y-6">
        <input type="hidden" name="id" value={product.id} />

        <Section title="פרטים בסיסיים">
          <Field label="שם הפרוייקט" required>
            <input
              type="text"
              name="name"
              defaultValue={product.name}
              required
              className="input"
              placeholder="QuickChat"
            />
          </Field>
          <Field
            label="Slug"
            hint="לא ניתן לעריכה — שינוי slug ישבור אינטגרציות קיימות."
          >
            <input
              type="text"
              defaultValue={product.slug}
              disabled
              className="input ltr-num bg-neutral-50 text-neutral-500 cursor-not-allowed"
              dir="ltr"
            />
          </Field>
          <Field
            label="קידומת חשבונית"
            required
            hint="חייב להיות ייחודי בכלל המערכת. משפיע רק על חשבוניות חדשות."
          >
            <input
              type="text"
              name="invoice_prefix"
              defaultValue={product.invoicePrefix}
              required
              maxLength={5}
              className="input ltr-num"
              placeholder="QC"
              dir="ltr"
            />
          </Field>
          <Field label="Base URL (אתר המוצר)">
            <input
              type="url"
              name="base_url"
              defaultValue={product.baseUrl ?? ""}
              className="input ltr-num"
              placeholder="https://quickchat.co.il"
              dir="ltr"
            />
          </Field>
        </Section>

        <Section title="הגדרות עסקיות">
          <Field label="ימי טריאל ברירת מחדל" required>
            <input
              type="number"
              name="default_trial_days"
              defaultValue={product.defaultTrialDays}
              min={0}
              required
              className="input ltr-num"
              dir="ltr"
            />
          </Field>
          <Field
            label="עמלת ברירת מחדל (אחוז)"
            hint="ריק = ללא עמלה. למשל 0.005 = 0.5%"
          >
            <input
              type="number"
              name="default_fee_percentage"
              defaultValue={product.defaultFeePercentage ?? ""}
              step="0.0001"
              min={0}
              max={1}
              className="input ltr-num"
              placeholder="0.005"
              dir="ltr"
            />
          </Field>
        </Section>

        <div className="flex items-center justify-between pt-2">
          <Link
            href={`/products/${id}`}
            className="text-sm text-neutral-600 px-4 py-2 rounded-lg hover:bg-neutral-100 transition"
          >
            ביטול
          </Link>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 bg-emerald-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-emerald-700 hover:shadow-md active:scale-[0.99] transition"
          >
            שמירה
          </button>
        </div>
      </form>

      <style>{`
        .input {
          width: 100%;
          border: 1px solid #e5e5e5;
          background: white;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        .input:focus {
          outline: none;
          border-color: #10b981;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
        }
      `}</style>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-4">
      <h2 className="text-base font-semibold text-neutral-900 mb-1">{title}</h2>
      {children}
    </div>
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
      <label className="text-sm font-medium block mb-1.5 text-neutral-700">
        {label} {required && <span className="text-emerald-600">*</span>}
      </label>
      {children}
      {hint && <div className="text-xs text-neutral-500 mt-1.5">{hint}</div>}
    </div>
  );
}
