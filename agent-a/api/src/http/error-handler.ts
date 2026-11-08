import { HttpError, type Router } from "@aws-lambda-powertools/event-handler/http";
import { AppError } from "./errors";

/**
 * Maps every error to `{code, message}` with an HTTP status: ValidationError 400, UnauthorizedError
 * 401, NotFoundError 404, ConflictError 409, FxUnavailableError 503, anything else 500. Logs carry
 * the error class and route only — never amounts, merchants, account numbers, or email bodies.
 */
export class ErrorHandler {
  register(app: Router): void {
    app.errorHandler(Error, async (error, reqCtx) => this.toResponse(error, reqCtx.route ?? undefined));
  }

  toResponse(error: unknown, route?: string): Response {
    if (error instanceof AppError) {
      if (error.status >= 500) console.warn(JSON.stringify({ msg: "request failed", route, code: error.code }));
      return json(error.status, { code: error.code, message: error.message });
    }
    if (error instanceof HttpError) {
      const status = error.statusCode;
      const code = status === 404 ? "NOT_FOUND" : status === 405 ? "METHOD_NOT_ALLOWED" : "HTTP_ERROR";
      return json(status, { code, message: status === 404 ? "Not found" : error.message });
    }
    console.error(JSON.stringify({ msg: "unhandled error", route, error: (error as Error)?.name }));
    return json(500, { code: "INTERNAL", message: "Something went wrong; please try again" });
  }
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body ?? null), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
