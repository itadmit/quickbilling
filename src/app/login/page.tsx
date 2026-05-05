import { signIn, auth } from "@/lib/auth/nextauth";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

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
    <div dir="rtl" className="min-h-screen grid place-items-center px-6">
      <div className="w-full max-w-sm bg-white border border-neutral-200 rounded-2xl shadow-sm p-8">
        <h1 className="text-2xl font-semibold mb-1">Quick Commerce</h1>
        <p className="text-sm text-neutral-500 mb-8">
          Billing Hub — לוח בקרה פנימי
        </p>

        {params.error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            ההתחברות נכשלה. בדוק את האימייל והסיסמה.
          </div>
        )}

        <form action={login} className="space-y-4">
          <input
            type="hidden"
            name="callbackUrl"
            value={params.callbackUrl || "/customers"}
          />
          <div>
            <label
              htmlFor="email"
              className="block text-sm text-neutral-700 mb-1"
            >
              אימייל
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              dir="ltr"
              className="w-full text-left rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm text-neutral-700 mb-1"
            >
              סיסמה
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              dir="ltr"
              className="w-full text-left rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-3 bg-neutral-900 text-white font-medium rounded-lg px-4 py-2.5 hover:bg-neutral-800 transition"
          >
            התחברות
          </button>
        </form>
      </div>
    </div>
  );
}
