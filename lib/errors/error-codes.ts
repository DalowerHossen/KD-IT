// path: lib/errors/error-codes.ts

/** Machine-readable error codes shared by the API envelope and the logger. */
export const ERROR_CODES = {
  BAD_REQUEST: "BAD_REQUEST",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  MFA_REQUIRED: "MFA_REQUIRED",
  REAUTH_REQUIRED: "REAUTH_REQUIRED",
  RATE_LIMITED: "RATE_LIMITED",
  CONFIGURATION: "CONFIGURATION",
  DATABASE: "database_error",
  EXTERNAL_SERVICE: "EXTERNAL_SERVICE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
