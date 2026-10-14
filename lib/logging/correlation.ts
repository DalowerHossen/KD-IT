// path: lib/logging/correlation.ts

/**
 * Shared correlation and request-integrity constants. This module is pure and
 * runtime-agnostic so it can be imported by proxy.ts (edge), server code, and
 * client code without boundary violations.
 */
export const CORRELATION_ID_HEADER = "x-correlation-id";
export const NONCE_HEADER = "x-nonce";

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function isValidCorrelationId(value: string | null | undefined): value is string {
  return typeof value === "string" && CORRELATION_ID_PATTERN.test(value);
}

export function createCorrelationId(): string {
  return crypto.randomUUID();
}
