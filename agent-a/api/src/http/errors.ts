/** Typed errors thrown by services. `ErrorHandler` maps each one to an HTTP status and `{code, message}`. */
export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly status: number;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  readonly code: string;
  readonly status = 400;
  constructor(message: string, code = "VALIDATION_FAILED") {
    super(message);
    this.code = code;
  }
}

export class UnauthorizedError extends AppError {
  readonly code = "UNAUTHORIZED";
  readonly status = 401;
  constructor(message = "Unauthorized") {
    super(message);
  }
}

export class NotFoundError extends AppError {
  readonly code = "NOT_FOUND";
  readonly status = 404;
  constructor(message = "Not found") {
    super(message);
  }
}

export class ConflictError extends AppError {
  readonly code: string;
  readonly status = 409;
  constructor(message = "The item changed meanwhile; reload and try again", code = "CONFLICT") {
    super(message);
    this.code = code;
  }
}

export class FxUnavailableError extends AppError {
  readonly code = "FX_UNAVAILABLE";
  readonly status = 503;
  constructor(message = "The exchange rate for that date is not available right now; nothing was saved, please retry") {
    super(message);
  }
}
