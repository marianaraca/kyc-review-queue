import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "@/lib/logger";
import type { ApiResponse } from "@/lib/types";
import { auth } from "@/auth";
import type { Role } from "@/lib/types";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json<ApiResponse<T>>({ success: true, data }, { status });
}

export function fail(error: string, status = 400, details?: unknown) {
  return NextResponse.json<ApiResponse<never>>({ success: false, error, details }, { status });
}

export type SessionUser = { email: string; name: string; role: Role };

/**
 * Wraps a route handler with auth, structured logging and uniform error mapping.
 * Every handler in this app goes through here, which is what makes adding the
 * next internal tool mostly copy-paste.
 */
export function withApi(
  handler: (ctx: { req: Request; user: SessionUser; params: Record<string, string> }) => Promise<Response>,
  opts: { roles?: Role[] } = {}
) {
  return async (req: Request, route?: { params?: Record<string, string> }) => {
    const started = Date.now();
    const url = new URL(req.url);
    const base = { method: req.method, path: url.pathname };
    try {
      const session = await auth();
      const user = session?.user as SessionUser | undefined;
      if (!user?.email) {
        logger.warn("api.unauthorized", { ...base, status: 401 });
        return fail("Unauthorized", 401);
      }
      if (opts.roles && !opts.roles.includes(user.role)) {
        logger.warn("api.forbidden", { ...base, status: 403, actor: user.email, role: user.role });
        return fail("Forbidden for role " + user.role, 403);
      }
      const res = await handler({ req, user, params: route?.params ?? {} });
      logger.info("api.request", {
        ...base,
        status: res.status,
        actor: user.email,
        role: user.role,
        duration_ms: Date.now() - started,
      });
      return res;
    } catch (err) {
      if (err instanceof ZodError) {
        logger.warn("api.validation_error", { ...base, status: 422, issues: err.issues });
        return fail("Validation failed", 422, err.issues);
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error("api.unhandled_error", { ...base, status: 500, error: message });
      return fail("Internal server error", 500);
    }
  };
}
