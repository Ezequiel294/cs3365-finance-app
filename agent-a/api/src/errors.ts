/** Typed errors thrown by services and mapped to HTTP by `ErrorHandler`. */
export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR';
  readonly status = 400;
}

export class UnauthorizedError extends AppError {
  readonly code = 'UNAUTHORIZED';
  readonly status = 401;
  constructor(message = 'Unauthorized') {
    super(message);
  }
}

export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND';
  readonly status = 404;
}

export class ConflictError extends AppError {
  readonly code = 'CONFLICT';
  readonly status = 409;
}

export class FxUnavailableError extends AppError {
  readonly code = 'FX_UNAVAILABLE';
  readonly status = 503;
  constructor(message = 'The BCCR exchange rate is not available right now. Nothing was saved; try again.') {
    super(message);
  }
}

export class PriceUnavailableError extends AppError {
  readonly code = 'PRICE_UNAVAILABLE';
  readonly status = 503;
}

/**
 * Not an HTTP error: thrown by `TransactionService.save` when one of the extra
 * conditional items (a CSV row claim) already exists, so the row is skipped.
 */
export class AlreadyClaimedError extends Error {
  constructor() {
    super('Already claimed');
    this.name = 'AlreadyClaimedError';
  }
}
