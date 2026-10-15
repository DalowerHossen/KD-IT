// path: lib/errors/app-errors.ts
import { ERROR_CODES, type ErrorCode } from "@/lib/errors/error-codes";

export interface AppErrorOptions {
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
}

/**
 * Base class of the typed error taxonomy. Operational errors carry a message
 * that is safe to show to callers; non-operational errors are replaced with a
 * generic message at the API boundary so internals never leak.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;
  readonly isOperational: boolean;

  constructor(
    code: ErrorCode,
    httpStatus: number,
    message: string,
    options?: AppErrorOptions & { readonly isOperational?: boolean },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = options?.details;
    this.isOperational = options?.isOperational ?? true;
  }

  /** Message that is safe to expose outside the platform. */
  toPublicMessage(): string {
    return this.isOperational ? this.message : "An unexpected error occurred.";
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, options?: AppErrorOptions) {
    super(ERROR_CODES.BAD_REQUEST, 400, message, options);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, options?: AppErrorOptions) {
    super(ERROR_CODES.VALIDATION_FAILED, 400, message, options);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication is required for this request.", options?: AppErrorOptions) {
    super(ERROR_CODES.UNAUTHORIZED, 401, message, options);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource.", options?: AppErrorOptions) {
    super(ERROR_CODES.FORBIDDEN, 403, message, options);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested resource was not found.", options?: AppErrorOptions) {
    super(ERROR_CODES.NOT_FOUND, 404, message, options);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, options?: AppErrorOptions) {
    super(ERROR_CODES.CONFLICT, 409, message, options);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please try again later.", options?: AppErrorOptions) {
    super(ERROR_CODES.RATE_LIMITED, 429, message, options);
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, options?: AppErrorOptions) {
    super(ERROR_CODES.CONFIGURATION, 500, message, options);
  }
}

export class DatabaseError extends AppError {
  constructor(message = "A database operation failed.", options?: AppErrorOptions) {
    super(ERROR_CODES.DATABASE, 500, message, options);
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, options?: AppErrorOptions) {
    super(ERROR_CODES.EXTERNAL_SERVICE, 502, message, options);
  }
}

export class InternalError extends AppError {
  constructor(message = "An unexpected error occurred.", options?: AppErrorOptions) {
    super(ERROR_CODES.INTERNAL_ERROR, 500, message, { ...options, isOperational: false });
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
