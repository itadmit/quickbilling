import { NextResponse } from "next/server";
import {
  authenticateProductRequest,
  ApiAuthError,
  type AuthenticatedRequest,
} from "./api-auth";
import { lookupIdempotency, storeIdempotency } from "./idempotency";

type HandlerResult = {
  status: number;
  body: unknown;
};

type Handler = (
  ctx: AuthenticatedRequest,
  routeParams: Record<string, string>,
) => Promise<HandlerResult>;

/**
 * Wraps a route handler with HMAC auth + idempotency + JSON serialization.
 *
 * Usage in `src/app/api/v1/.../route.ts`:
 *
 *     export const POST = withProductAuth(async (ctx, params) => {
 *       const body = ctx.parsedBody as MySchema;
 *       // ... do work
 *       return { status: 201, body: { ... } };
 *     });
 */
export function withProductAuth(
  handler: Handler,
): (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response> {
  return async (request, context) => {
    let ctx: AuthenticatedRequest;
    try {
      ctx = await authenticateProductRequest(request);
    } catch (err) {
      if (err instanceof ApiAuthError) {
        return NextResponse.json(
          { error: err.code, message: err.message },
          { status: err.status },
        );
      }
      console.error("[api-auth] unexpected error:", err);
      return NextResponse.json(
        { error: "INTERNAL_ERROR", message: "Authentication failed" },
        { status: 500 },
      );
    }

    const params = (await context.params) ?? {};

    if (ctx.idempotencyKey) {
      try {
        const cached = await lookupIdempotency({
          key: ctx.idempotencyKey,
          productId: ctx.product.id,
          rawBody: ctx.rawBody,
        });
        if (cached) {
          return NextResponse.json(cached.body, {
            status: cached.status,
            headers: { "X-Idempotent-Replay": "true" },
          });
        }
      } catch (err) {
        if ((err as { code?: string }).code === "IDEMPOTENCY_MISMATCH") {
          return NextResponse.json(
            {
              error: "IDEMPOTENCY_MISMATCH",
              message: (err as Error).message,
            },
            { status: 409 },
          );
        }
        throw err;
      }
    }

    let result: HandlerResult;
    try {
      result = await handler(ctx, params);
    } catch (err) {
      console.error("[handler] error:", err);
      result = {
        status: 500,
        body: {
          error: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "Unknown error",
        },
      };
    }

    if (ctx.idempotencyKey && result.status < 500) {
      await storeIdempotency({
        key: ctx.idempotencyKey,
        productId: ctx.product.id,
        rawBody: ctx.rawBody,
        responseStatus: result.status,
        responseBody: result.body,
      });
    }

    return NextResponse.json(result.body, { status: result.status });
  };
}
