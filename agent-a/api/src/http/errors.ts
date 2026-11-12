/** Typed errors thrown by services; ErrorHandler maps them to HTTP responses. */
export abstract class AppError extends Error {
  abstract readonly status: number;
  constructor(
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  readonly status = 400;
  constructor(message: string, fields?: Record<string, string>, code = 'VALIDATION_ERROR') {
    super(code, message, fields);
  }
}

export class UnauthorizedError extends AppError {
  readonly status = 401;
  constructor(message = 'Not signed in or the key is not valid.') {
    super('UNAUTHORIZED', message);
  }
}

export class NotFoundError extends AppError {
  readonly status = 404;
  constructor(message = 'Not found.', code = 'NOT_FOUND') {
    super(code, message);
  }
}

export class ConflictError extends AppError {
  readonly status = 409;
  constructor(message: string, code = 'CONFLICT', details?: Record<string, unknown>, fields?: Record<string, string>) {
    super(code, message, fields, details);
  }
}

export class FxUnavailableError extends AppError {
  readonly status = 503;
  constructor(readonly date: string) {
    super(
      'FX_UNAVAILABLE',
      `The exchange rate for ${date} is not available yet. Nothing was saved. Try again in a moment.`,
      undefined,
      { date },
    );
  }
}

export class PriceUnavailableError extends AppError {
  readonly status = 503;
  constructor(message = 'Price service unavailable, retrying') {
    super('PRICE_UNAVAILABLE', message);
  }
}

/**
 * Thrown by TransactionService.save when one of the extra conditional writes (a CSV row
 * claim) already exists. Not an HTTP error: the pipeline counts the row as skipped.
 */
export class AlreadyClaimedError extends Error {
  constructor() {
    super('Already claimed');
    this.name = 'AlreadyClaimedError';
  }
}
