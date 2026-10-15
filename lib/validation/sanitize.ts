// path: lib/validation/sanitize.ts

/**
 * Input normalization and contextual sanitization shared by client and
 * server. Every untrusted string passes these controls before validation:
 * Unicode NFC normalization, null-byte and zero-width or bidi-control
 * removal, whitespace collapse, and output-safe HTML escaping.
 */
const ZERO_WIDTH_AND_BIDI_PATTERN = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;
const NULL_BYTE_PATTERN = /\x00/g;
const HORIZONTAL_WHITESPACE_PATTERN = /[\t\f\v ]+/g;

const HTML_ESCAPE_LOOKUP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const HTML_ESCAPE_PATTERN = /[&<>"']/g;

/** Normalizes untrusted text without changing its language or meaning. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFC")
    .replace(NULL_BYTE_PATTERN, "")
    .replace(ZERO_WIDTH_AND_BIDI_PATTERN, "")
    .trim();
}

/** Normalizes and caps plain free-text input such as names and messages. */
export function sanitizePlainText(input: string, maxLength: number): string {
  const normalized = normalizeText(input).replace(HORIZONTAL_WHITESPACE_PATTERN, " ");
  return normalized.slice(0, maxLength).trim();
}

/** Escapes plain text for safe interpolation into HTML contexts. */
export function escapeHtml(input: string): string {
  return input.replace(HTML_ESCAPE_PATTERN, (character) => HTML_ESCAPE_LOOKUP[character] ?? "");
}

/**
 * Validates that a redirect target stays on this origin. Protocol-relative
 * URLs, credentials, control characters, and traversal segments fail closed.
 */
export function isSafeRelativePath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) {
    return false;
  }
  if (/[\x00-\x1F\x7F]/.test(path)) {
    return false;
  }
  const segments = path.split("/");
  return !segments.includes("..");
}
