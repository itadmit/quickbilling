import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/nextauth";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthed = !!req.auth?.user;
  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/v1") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/cron") ||
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
