import { signIn, auth } from "@/lib/auth/nextauth";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { Logo } from "@/components/logo";

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
    <div
      dir="rtl"
      className="min-h-screen grid grid-cols-1 lg:grid-cols-[7fr_3fr] font-sans bg-white"
    >
      {/* Form panel — 80% (start side in RTL = right) */}
      <main className="relative flex items-center justify-center px-6 py-12">
        {/* Brand mark, top-right */}
        <div className="absolute top-6 right-8">
          <Logo size="md" tone="dark" />
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-10">
            <h1 className="text-[34px] font-bold tracking-tight text-neutral-900 mb-2">
              היי, שנתחבר?
            </h1>
            <p className="text-[14px] text-neutral-500">
              ברוך הבא ל-Billing Hub. התחבר כדי להמשיך.
            </p>
          </div>

          {params.error && (
            <div className="mb-5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
              <span className="font-medium">שגיאה:</span>
              <span>בדוק את האימייל והסיסמה ונסה שוב.</span>
            </div>
          )}

          <form action={login} className="space-y-5">
            <input
              type="hidden"
              name="callbackUrl"
              value={params.callbackUrl || "/customers"}
            />

            <Field
              label="מייל"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />

            <Field
              label="סיסמה"
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />

            <div className="pt-2">
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 text-white font-medium rounded-full px-6 py-3 text-[15px] hover:bg-emerald-700 active:scale-[0.99] transition"
              >
                כניסה
              </button>
            </div>
          </form>

          <div className="mt-12 text-center text-xs text-neutral-400">
            הגישה מותרת רק לצוות הפנימי של Quick Commerce.
          </div>
        </div>
      </main>

      {/* Illustration panel — 20% (end side in RTL = left) */}
      <aside
        aria-hidden="true"
        className="hidden lg:block"
        style={{
          background:
            "#1a7870 url(/illustrations/signin-hero.svg) center no-repeat",
          backgroundSize: "100%",
        }}
      />
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
  required,
}: {
  label: string;
  id: string;
  name: string;
  type: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[13px] font-medium text-neutral-700 mb-1.5"
      >
        {label} {required && <span className="text-emerald-600">*</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        dir="ltr"
        className="w-full text-left bg-transparent border-0 border-b border-neutral-300 px-0 py-2 text-[15px] placeholder:text-neutral-400 focus:outline-none focus:border-emerald-600 focus:ring-0 transition"
      />
    </div>
  );
}
