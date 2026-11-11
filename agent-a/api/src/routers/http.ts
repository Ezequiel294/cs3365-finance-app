import { HttpError } from '@aws-lambda-powertools/event-handler/http';
import type { Router } from '@aws-lambda-powertools/event-handler/http';
import type { z } from 'zod';
import { AuthContext } from '../auth';
import { AppError, ValidationError } from '../errors';

type ReqCtx = { req: Request; event: unknown; params: Record<string, string> };

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** The caller's Cognito `sub`. */
export function userIdOf(reqCtx: ReqCtx): string {
  return AuthContext.fromCognitoClaims(reqCtx.event).userId;
}

/** Validates a JSON body with a shared Zod schema; problems become a 400. */
export async function bodyOf<S extends z.ZodType>(reqCtx: ReqCtx, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    const text = await reqCtx.req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new ValidationError('The request body is not valid JSON');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.length ? `${issue.path.join('.')}: ` : '';
    throw new ValidationError(`${path}${issue.message}`);
  }
  return result.data;
}

export function queryOf(reqCtx: ReqCtx): URLSearchParams {
  return new URL(reqCtx.req.url).searchParams;
}

/** Validates a query or path value with a Zod schema. */
export function valueOf<S extends z.ZodType>(value: unknown, schema: S, name: string): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(`${name}: ${result.error.issues[0].message}`);
  return result.data;
}

/** The public base URL of this API, for the Gmail script. */
export function apiBaseOf(reqCtx: ReqCtx): string {
  const domain = (reqCtx.event as { requestContext?: { domainName?: string } })?.requestContext?.domainName;
  return domain ? `https://${domain}` : '';
}

/**
 * Maps typed errors to `{code, message}` with their HTTP status:
 * 400 validation, 401 unauthorized, 404 not found, 409 conflict, 503 FX or price
 * unavailable, anything else 500.
 */
export class ErrorHandler {
  register(app: Router): void {
    app.errorHandler(Error, async (error: Error) => this.toResponse(error));
    app.notFound(async () => json(404, { code: 'NOT_FOUND', message: 'Route not found' }));
  }

  toResponse(error: unknown): Response {
    if (error instanceof AppError) {
      return json(error.status, { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) });
    }
    if (error instanceof HttpError) {
      const status = error.statusCode;
      return json(status, { code: status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR', message: error.message });
    }
    console.error(JSON.stringify({ msg: 'Unhandled error', error: (error as Error)?.name, detail: (error as Error)?.message?.slice(0, 200) }));
    return json(500, { code: 'INTERNAL', message: 'Something went wrong' });
  }
}
