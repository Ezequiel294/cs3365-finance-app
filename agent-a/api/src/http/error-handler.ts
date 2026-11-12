import type { Router } from '@aws-lambda-powertools/event-handler/http';
import { AppError } from './errors';
import { json } from './respond';

/** Maps typed errors to `{code, message}` with an HTTP status; anything else is a 500. */
export class ErrorHandler {
  register(app: Router): void {
    app.errorHandler(Error, async (error: Error) => this.toResponse(error));
    app.notFound(async () => json(404, { code: 'NOT_FOUND', message: 'No such route.' }));
    app.methodNotAllowed(async () => json(405, { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }));
  }

  toResponse(error: unknown): Response {
    if (error instanceof AppError) {
      return json(error.status, {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
        ...(error.details ? { details: error.details } : {}),
      });
    }
    // Never log bodies, amounts, or merchant names; the error name and message are enough.
    console.error(JSON.stringify({ msg: 'unhandled error', name: (error as Error)?.name, error: (error as Error)?.message }));
    return json(500, { code: 'INTERNAL', message: 'Something went wrong. Try again in a moment.' });
  }
}
