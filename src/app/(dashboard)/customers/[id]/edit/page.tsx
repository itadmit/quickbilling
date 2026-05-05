import Link from "next/link";
import { ArrowRight, CreditCard, Plus, X, RotateCw, AlertTriangle } from "lucide-react";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import {
  customers,
  paymentMethods,
  subscriptions,
  subscriptionAddons,
  plans,
  products,
} from "@/lib/db/schema";
import { formatILS, formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/dashboard/status-badge";
import {
  updateCustomer,
  updateSubscription,
  addAddon,
  updateAddon,
  cancelAddon,
  generateCardUpdateLink,
  deletePaymentMethod,
} from "../actions";

export const dynamic = "force-dynamic";

const SAVED_LABELS: Record<string, string> = {
  customer: "פרטי הלקוח עודכנו",
  sub: "המנוי עודכן",
  addon: "התוסף עודכן",
  pm: "אמצעי התשלום עודכן",
};

export default async function EditCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  if (!customer) notFound();

  const [pms, subs, allAddons] = await Promise.all([
    db.select().from(paymentMethods).where(eq(paymentMethods.customerId, id)),
    db
      .select({ sub: subscriptions, plan: plans, product: products })
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .innerJoin(products, eq(subscriptions.productId, products.id))
      .where(eq(subscriptions.customerId, id))
      .orderBy(desc(subscriptions.createdAt)),
    db.select().from(subscriptionAddons),
  ]);
  const subIds = new Set(subs.map((s) => s.sub.id));
  const addonsBySub = new Map<string, typeof allAddons>();
  for (const a of allAddons) {
    if (!subIds.has(a.subscriptionId)) continue;
    const arr = addonsBySub.get(a.subscriptionId) ?? [];
    arr.push(a);
    addonsBySub.set(a.subscriptionId, arr);
  }

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <Link
        href={`/customers/${id}`}
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 mb-3"
      >
        <ArrowRight className="w-4 h-4" />
        חזרה ללקוח
      </Link>

      <div className="mb-8">
        <h1 className="text-[26px] font-semibold tracking-tight text-neutral-900">
          עריכת לקוח
        </h1>
        <p className="text-sm text-neutral-500 mt-1 ltr-num">{customer.email}</p>
      </div>

      {saved && (
        <div className="mb-6 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
          {SAVED_LABELS[saved] ?? "נשמר"}
        </div>
      )}

      {/* ───────── Customer details ───────── */}
      <Section title="פרטי לקוח">
        <form action={updateCustomer} className="space-y-4">
          <input type="hidden" name="id" value={customer.id} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="שם">
              <input
                type="text"
                name="name"
                defaultValue={customer.name ?? ""}
                className="input"
                placeholder="ישראל ישראלי"
              />
            </Field>
            <Field label="אימייל" required>
              <input
                type="email"
                name="email"
                defaultValue={customer.email}
                required
                className="input ltr-num"
                dir="ltr"
              />
            </Field>
            <Field label="טלפון">
              <input
                type="tel"
                name="phone"
                defaultValue={customer.phone ?? ""}
                className="input ltr-num"
                placeholder="+972500000000"
                dir="ltr"
              />
            </Field>
            <Field label="ח.פ. / ת.ז.">
              <input
                type="text"
                name="vat_number"
                defaultValue={customer.vatNumber ?? ""}
                className="input ltr-num"
                placeholder="123456789"
                dir="ltr"
              />
            </Field>
          </div>
          <Field label="הערות פנימיות">
            <textarea
              name="notes"
              defaultValue={customer.notes ?? ""}
              rows={2}
              className="input"
              placeholder="לא נראה ללקוח."
            />
          </Field>
          <SaveBar />
        </form>
      </Section>

      {/* ───────── Payment methods ───────── */}
      <Section title="אמצעי תשלום">
        {pms.length === 0 ? (
          <Empty>אין אמצעי תשלום</Empty>
        ) : (
          <ul className="divide-y divide-neutral-100 -mx-6">
            {pms.map((pm) => (
              <li key={pm.id} className="px-6 py-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-neutral-50 grid place-items-center mt-0.5">
                    <CreditCard className="w-5 h-5 text-neutral-500" strokeWidth={1.75} />
                  </div>
                  <div>
                    <div className="text-sm text-neutral-900 font-medium">
                      {pm.cardBrand ?? "כרטיס"}{" "}
                      <span className="ltr-num text-neutral-500 font-normal">
                        ····{pm.cardLast4 ?? "????"}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-500 ltr-num mt-0.5">
                      תוקף: {pm.cardExpiry ?? "—"}
                    </div>
                    <div className="text-[11px] text-neutral-400 ltr-num font-mono mt-1.5 break-all">
                      token: {pm.payplusTokenUid}
                    </div>
                    {pm.payplusCustomerUid && (
                      <div className="text-[11px] text-neutral-400 ltr-num font-mono break-all">
                        customer_uid: {pm.payplusCustomerUid}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    {pm.isDefault && (
                      <span className="text-xs px-2.5 py-1 bg-neutral-100 text-neutral-700 rounded-full">
                        ברירת מחדל
                      </span>
                    )}
                    <StatusBadge status={pm.status} />
                  </div>
                  {pm.status === "active" && (
                    <form action={deletePaymentMethod}>
                      <input type="hidden" name="customer_id" value={customer.id} />
                      <input type="hidden" name="pm_id" value={pm.id} />
                      <button
                        type="submit"
                        className="text-xs text-red-600 hover:text-red-800 inline-flex items-center gap-1"
                      >
                        <X className="w-3 h-3" /> הסר
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <form action={generateCardUpdateLink} className="mt-4 pt-4 border-t border-neutral-100 -mx-6 px-6">
          <input type="hidden" name="customer_id" value={customer.id} />
          <p className="text-xs text-neutral-500 mb-3">
            לחיצה תפנה את הדפדפן לעמוד תשלום של PayPlus להוספת כרטיס חדש. הטוקן יישמר במערכת אוטומטית בסיום.
          </p>
          <button
            type="submit"
            className="inline-flex items-center gap-2 bg-neutral-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-neutral-700 transition"
          >
            <RotateCw className="w-4 h-4" />
            הוסף / החלף כרטיס
          </button>
        </form>
      </Section>

      {/* ───────── Subscriptions ───────── */}
      <Section title="מנויים">
        {subs.length === 0 ? (
          <Empty>אין מנויים</Empty>
        ) : (
          <div className="space-y-6 -mx-6">
            {subs.map(({ sub, plan, product }) => {
              const addons = addonsBySub.get(sub.id) ?? [];
              const remaining =
                sub.totalPayments != null
                  ? Math.max(0, sub.totalPayments - sub.paymentsCharged)
                  : null;
              return (
                <div
                  key={sub.id}
                  className="px-6 py-5 border-b border-neutral-100 last:border-0"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-semibold text-neutral-900">
                        {product.name}{" "}
                        <span className="text-neutral-400 font-normal">·</span>{" "}
                        <span className="text-neutral-700">{plan.name}</span>
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        תקופה נוכחית: {formatDate(sub.currentPeriodStart)} →{" "}
                        {formatDate(sub.currentPeriodEnd)}
                      </div>
                    </div>
                    <StatusBadge status={sub.status} />
                  </div>

                  <form action={updateSubscription} className="space-y-4 bg-neutral-50/60 rounded-xl p-4">
                    <input type="hidden" name="customer_id" value={customer.id} />
                    <input type="hidden" name="sub_id" value={sub.id} />

                    <div className="grid grid-cols-3 gap-3">
                      <Field
                        label="מחיר חודשי"
                        hint={`מחיר תוכנית: ${formatILS(plan.monthlyPrice)}. ריק = לפי תוכנית.`}
                      >
                        <input
                          type="number"
                          name="custom_monthly_price"
                          defaultValue={sub.customMonthlyPrice ?? ""}
                          step="0.01"
                          min="0"
                          className="input ltr-num"
                          dir="ltr"
                          placeholder={String(plan.monthlyPrice)}
                        />
                      </Field>
                      <Field
                        label="סה״כ תשלומים"
                        hint="ריק = הוראת קבע ללא הגבלה"
                      >
                        <input
                          type="number"
                          name="total_payments"
                          defaultValue={sub.totalPayments ?? ""}
                          min="1"
                          step="1"
                          className="input ltr-num"
                          dir="ltr"
                          placeholder="קבוע"
                        />
                      </Field>
                      <Field
                        label="תשלומים שכבר חויבו"
                        hint={
                          remaining != null
                            ? `נותרו ${remaining} תשלומים`
                            : "מספר חיובים מוצלחים עד כה"
                        }
                      >
                        <input
                          type="number"
                          name="payments_charged"
                          defaultValue={sub.paymentsCharged}
                          min="0"
                          step="1"
                          className="input ltr-num"
                          dir="ltr"
                        />
                      </Field>
                    </div>

                    <Field label="פעולת סטטוס">
                      <select name="status_action" className="input" defaultValue="">
                        <option value="">— ללא שינוי —</option>
                        <option value="cancel_at_period_end">בטל בסוף התקופה הנוכחית</option>
                        <option value="cancel_now">בטל מיידית</option>
                        <option value="pause">השהה</option>
                        <option value="resume">שחזר / הפעל שוב</option>
                      </select>
                    </Field>

                    {sub.cancelAtPeriodEnd && (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        מסומן לביטול בסוף התקופה ({formatDate(sub.currentPeriodEnd)})
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 bg-emerald-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-emerald-700 transition"
                      >
                        שמירה
                      </button>
                    </div>
                  </form>

                  {/* Addons */}
                  <div className="mt-5">
                    <h4 className="text-sm font-medium text-neutral-700 mb-2">
                      תוספים{" "}
                      <span className="text-neutral-400 font-normal">
                        ({addons.filter((a) => a.status === "active").length} פעילים)
                      </span>
                    </h4>

                    {addons.length > 0 && (
                      <ul className="space-y-2 mb-3">
                        {addons.map((a) => (
                          <li
                            key={a.id}
                            className="flex items-center gap-2 px-3 py-2 bg-white border border-neutral-200 rounded-lg"
                          >
                            <form
                              action={updateAddon}
                              className="flex items-center gap-2 flex-1"
                            >
                              <input type="hidden" name="customer_id" value={customer.id} />
                              <input type="hidden" name="addon_id" value={a.id} />
                              <input
                                type="text"
                                name="name"
                                defaultValue={a.name}
                                className="input flex-1"
                                disabled={a.status !== "active"}
                              />
                              <input
                                type="number"
                                name="monthly_price"
                                defaultValue={a.monthlyPrice}
                                step="0.01"
                                min="0"
                                className="input ltr-num w-28"
                                dir="ltr"
                                disabled={a.status !== "active"}
                              />
                              <StatusBadge status={a.status} />
                              {a.status === "active" && (
                                <button
                                  type="submit"
                                  className="text-xs text-emerald-700 hover:text-emerald-900 px-2"
                                >
                                  שמור
                                </button>
                              )}
                            </form>
                            {a.status === "active" && (
                              <form action={cancelAddon}>
                                <input type="hidden" name="customer_id" value={customer.id} />
                                <input type="hidden" name="addon_id" value={a.id} />
                                <button
                                  type="submit"
                                  className="text-xs text-red-600 hover:text-red-800 inline-flex items-center gap-1"
                                >
                                  <X className="w-3 h-3" /> בטל
                                </button>
                              </form>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    <form
                      action={addAddon}
                      className="flex items-end gap-2 bg-emerald-50/60 border border-emerald-100 rounded-lg p-3"
                    >
                      <input type="hidden" name="customer_id" value={customer.id} />
                      <input type="hidden" name="sub_id" value={sub.id} />
                      <Field label="שם תוסף" small>
                        <input
                          type="text"
                          name="name"
                          required
                          className="input"
                          placeholder="חבילת תוספים"
                        />
                      </Field>
                      <Field label="מחיר לחודש" small>
                        <input
                          type="number"
                          name="monthly_price"
                          required
                          step="0.01"
                          min="0.01"
                          className="input ltr-num w-28"
                          dir="ltr"
                          placeholder="49.00"
                        />
                      </Field>
                      <Field label="מחזור" small>
                        <select name="billing_interval" className="input w-28" defaultValue="monthly">
                          <option value="monthly">חודשי</option>
                          <option value="yearly">שנתי</option>
                          <option value="one_time">חד פעמי</option>
                        </select>
                      </Field>
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 bg-emerald-600 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-emerald-700 transition"
                      >
                        <Plus className="w-3.5 h-3.5" /> הוסף תוסף
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

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
        .input:disabled {
          background: #fafafa;
          color: #737373;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 bg-white border border-neutral-200 rounded-2xl p-6">
      <h2 className="text-base font-semibold text-neutral-900 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-8 text-sm text-neutral-400 text-center">{children}</div>;
}

function Field({
  label,
  required,
  hint,
  small,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={small ? "" : "min-w-0"}>
      <label className="text-xs font-medium block mb-1 text-neutral-700">
        {label} {required && <span className="text-emerald-600">*</span>}
      </label>
      {children}
      {hint && <div className="text-[11px] text-neutral-500 mt-1">{hint}</div>}
    </div>
  );
}

function SaveBar() {
  return (
    <div className="flex justify-end pt-2">
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 bg-emerald-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-emerald-700 transition"
      >
        שמירה
      </button>
    </div>
  );
}
