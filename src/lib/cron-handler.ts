import { NextResponse } from "next/server";
import { verifyQStash } from "./qstash";

/**
 * Wraps a cron handler with QStash signature verification + JSON response.
 * In dev (no QSTASH_CURRENT_SIGNING_KEY), verification is bypassed.
 */
export function withCronAuth(
  handler: () => Promise<unknown>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const body = await request.text();
    const ok = await verifyQStash(request, body);
    if (!ok) {
      return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
    }

    const startedAt = Date.now();
    try {
      const result = await handler();
      return NextResponse.json({
        ok: true,
        duration_ms: Date.now() - startedAt,
        result,
      });
    } catch (err) {
      console.error("[cron] error:", err);
      return NextResponse.json(
        {
          ok: false,
          duration_ms: Date.now() - startedAt,
          error: err instanceof Error ? err.message : "Unknown error",
        },
        { status: 500 },
      );
    }
  };
}
