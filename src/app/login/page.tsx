import { signIn, auth } from "@/lib/auth/nextauth";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import {
  ShieldCheck,
  Zap,
  TrendingUp,
  Users,
} from "lucide-react";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  if (session?.user) {
    redirect(params.callbackUrl || "/customers");
  }

  async function login(formData: FormData) {
    "use server";
    const email = String(formData.get("email") || "");
    const password = String(formData.get("password") || "");
    const callbackUrl =
      String(formData.get("callbackUrl") || "") || "/customers";

    try {
      await signIn("credentials", {
        email,
        password,
        redirectTo: callbackUrl,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect(
          `/login?error=CredentialsSignin&callbackUrl=${encodeURIComponent(callbackUrl)}`,
        );
      }
      throw err;
    }
  }

  return (
    <div dir="rtl" className="min-h-screen grid lg:grid-cols-2 font-sans">
      {/* Brand panel — visible only on lg+, otherwise pushed off-screen */}
      <aside className="hidden lg:flex relative bg-[#022c27] text-white flex-col justify-between p-12 overflow-hidden">
        {/* Decorative gradient blobs */}
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-emerald-500 blur-[120px]" />
          <div className="absolute -bottom-32 -right-20 w-80 h-80 rounded-full bg-emerald-400 blur-[140px]" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 grid place-items-center">
              <Zap className="w-4 h-4 text-emerald-300" strokeWidth={2} />
            </div>
            <div className="text-[14px] font-medium tracking-wide text-white/90">
              Quick Commerce
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="text-[32px] xl:text-[40px] font-semibold tracking-tight leading-[1.15] mb-4">
            ניהול חיובים מרכזי
            <br />
            לכל המוצרים שלך
          </h2>
          <p className="text-white/70 text-[15px] leading-relaxed mb-10">
            פלטפורמה אחת לתשלומים, מנויים, חשבוניות ועמלות —
            כל הפרוייקטים, מקום אחד.
          </p>

          <ul className="space-y-4 text-sm">
            <Bullet Icon={ShieldCheck}>
              סליקה מאובטחת דרך PayPlus עם token חוזר
            </Bullet>
            <Bullet Icon={Users}>
              חיפוש לקוחות חוצה-מוצרים בלחיצה אחת
            </Bullet>
            <Bullet Icon={TrendingUp}>
              MRR, churn, ודוחות בזמן אמת
            </Bullet>
          </ul>
        </div>

        <div className="relative z-10 text-xs text-white/40">
          © {new Date().getFullYear()} Quick Commerce · Internal Tool
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center px-6 py-12 bg-neutral-50">
        <div className="w-full max-w-sm">
          {/* Mobile-only top brand */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 grid place-items-center">
                <Zap className="w-4 h-4 text-emerald-700" strokeWidth={2} />
              </div>
              <div className="text-[14px] font-medium text-neutral-700">
                Quick Commerce
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-[26px] font-semibold tracking-tight text-neutral-900 mb-1">
              ברוכים הבאים
            </h1>
            <p className="text-sm text-neutral-500">
              התחבר לחשבון Billing Hub כדי להמשיך
            </p>
          </div>

          {params.error && (
            <div className="mb-5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
              <span className="font-medium">שגיאה:</span>
              <span>בדוק את האימייל והסיסמה ונסה שוב.</span>
            </div>
          )}

          <form action={login} className="space-y-4">
            <input
              type="hidden"
              name="callbackUrl"
              value={params.callbackUrl || "/customers"}
            />

            <Field
              label="אימייל"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
            />

            <Field
              label="סיסמה"
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
            />

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 text-white font-medium rounded-xl px-4 py-3 text-sm hover:bg-emerald-700 hover:shadow-md active:scale-[0.99] transition shadow-sm shadow-emerald-600/20"
            >
              התחברות
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-neutral-200 text-center text-xs text-neutral-500">
            הגישה מותרת רק לצוות הפנימי של Quick Commerce.
            <br />
            לבעיות התחברות, פנה למנהל המערכת.
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  id,
  name,
  type,
  autoComplete,
  placeholder,
}: {
  label: string;
  id: string;
  name: string;
  type: string;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[13px] font-medium text-neutral-700 mb-1.5"
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        placeholder={placeholder}
        dir="ltr"
        className="w-full text-left rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm font-sans placeholder:text-neutral-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition"
      />
    </div>
  );
}

function Bullet({
  Icon,
  children,
}: {
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 text-white/80">
      <div className="w-6 h-6 rounded-md bg-white/10 grid place-items-center shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-emerald-300" strokeWidth={1.75} />
      </div>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}
