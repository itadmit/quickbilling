import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/nextauth";

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const isAuthed = !!req.auth?.user;

  // PayPlus can deliver the post-payment redirect as either GET (params
  // in URL) or POST (params in form body), depending on the dashboard
  // setting. Convert POST→GET via 303 so the page (which only reads
  // searchParams) renders identically in both cases.
  if (
    req.method === "POST" &&
    (pathname === "/billing/success" || pathname === "/billing/failed")
  ) {
    const formData = await req.formData();
    const target = req.nextUrl.clone();
    target.search = "";
    for (const [k, v] of formData.entries()) {
      target.searchParams.set(k, typeof v === "string" ? v : "");
    }
    return NextResponse.redirect(target, 303);
  }

  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/v1") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/billing/") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  if (isPublic) return;

  if (!isAuthed) {
    // Build the redirect URL on the same origin as the incoming request.
    // Using req.nextUrl preserves protocol + host from the actual request
    // (including Vercel's x-forwarded-host) — we never want to leak
    // localhost or any other env-var-derived host.
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?callbackUrl=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  // Skip the middleware for any path that contains a file extension —
  // i.e. anything served from /public (fonts, illustrations, images, etc.).
  // Without this, requests for /fonts/ping-regular.woff2 hit the auth check
  // and get a 200 HTML redirect to /login, which the browser then tries to
  // parse as a font and chokes on with "OTS parsing error: invalid sfntVersion".
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
