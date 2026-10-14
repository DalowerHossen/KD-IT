// path: lib/logging/redaction.ts

/**
 * PII and secret redaction for structured log output. Every value entering a
 * log line passes through this module so secrets, credentials, and direct
 * identifiers never reach log sinks.
 */
const SENSITIVE_KEY_PATTERN =
  /(password|passcode|secret|token|authorization|cookie|api[-_]?key|apikey|credential|private[-_]?key|card[-_]?(number|cvv|cvc)|\bcvv\b|\bcvc\b|ssn|totp|otp|backup[-_]?code|session[-_]?id)/i;

const EMAIL_PATTERN = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

const REDACTED = "[redacted]";
const MAX_DEPTH = 6;
const MAX_STRING_LENGTH = 512;

function maskEmails(value: string): string {
  return value.replace(EMAIL_PATTERN, "$1***$2");
}

function truncate(value: string): string {
  return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value;
}

function redactEntry(key: string, value: unknown, depth: number): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return REDACTED;
  }
  return redactValue(value, depth);
}

function redactValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return truncate(maskEmails(value));
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (depth >= MAX_DEPTH) {
    return "[truncated]";
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, depth + 1));
  }
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(source)) {
      result[key] = redactEntry(key, entry, depth + 1);
    }
    return result;
  }
  return String(value);
}

/** Redacts a structured log context object before serialization. */
export function redactContext(context: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(context)) {
    result[key] = redactEntry(key, entry, 0);
  }
  return result;
}
