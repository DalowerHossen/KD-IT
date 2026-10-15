// path: lib/auth/password-policy.ts
import { z } from "zod";

/**
 * Shared password policy: minimum 12 characters with uppercase,
 * lowercase, number, and special character classes. Passwords are NFC
 * normalized before validation, capped at 72 bytes because the provider
 * hashes with bcrypt (bytes beyond 72 would be silently dropped), and
 * re-validated on the server on every set. Strength feedback uses machine
 * codes; user-facing copy lives in the i18n strings module.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_BYTES = 72;

const UPPERCASE_CLASS = /[A-Z]/;
const LOWERCASE_CLASS = /[a-z]/;
const DIGIT_CLASS = /[0-9]/;
const SPECIAL_CLASS = /[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~-]/;

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export const passwordSchema = z
  .string()
  .min(1, "A password is required.")
  .max(256, "Passwords are limited to 256 characters.")
  .transform((value) => value.normalize("NFC"))
  .refine((value) => value.length >= PASSWORD_MIN_LENGTH, {
    message: "Passwords must be at least 12 characters.",
  })
  .refine((value) => utf8ByteLength(value) <= PASSWORD_MAX_BYTES, {
    message: "Passwords are limited to 72 bytes.",
  })
  .refine((value) => UPPERCASE_CLASS.test(value), {
    message: "Passwords must include an uppercase letter.",
  })
  .refine((value) => LOWERCASE_CLASS.test(value), {
    message: "Passwords must include a lowercase letter.",
  })
  .refine((value) => DIGIT_CLASS.test(value), {
    message: "Passwords must include a number.",
  })
  .refine((value) => SPECIAL_CLASS.test(value), {
    message: "Passwords must include a special character.",
  });

export type PasswordStrengthWarning =
  "too-short" | "missing-classes" | "common-pattern" | "repeated-chars";

export interface PasswordStrength {
  readonly score: 0 | 1 | 2 | 3 | 4;
  readonly warnings: readonly PasswordStrengthWarning[];
}

const COMMON_PATTERNS = [
  "password",
  "qwerty",
  "123456",
  "letmein",
  "welcome",
  "admin",
  "kdsolution",
];

function countClasses(value: string): number {
  let classes = 0;
  if (UPPERCASE_CLASS.test(value)) {
    classes += 1;
  }
  if (LOWERCASE_CLASS.test(value)) {
    classes += 1;
  }
  if (DIGIT_CLASS.test(value)) {
    classes += 1;
  }
  if (SPECIAL_CLASS.test(value)) {
    classes += 1;
  }
  return classes;
}

/**
 * Deterministic client-safe strength estimate. Breach status is unknown
 * here; the server re-evaluates and adds the breach verdict.
 */
export function evaluatePasswordStrength(password: string): PasswordStrength {
  const value = password.normalize("NFC");
  const warnings: PasswordStrengthWarning[] = [];
  if (value.length < PASSWORD_MIN_LENGTH) {
    warnings.push("too-short");
  }
  const classes = countClasses(value);
  if (classes < 4) {
    warnings.push("missing-classes");
  }
  const lowered = value.toLowerCase();
  if (COMMON_PATTERNS.some((pattern) => lowered.includes(pattern))) {
    warnings.push("common-pattern");
  }
  if (/(.)\1\1/.test(value)) {
    warnings.push("repeated-chars");
  }

  let score: PasswordStrength["score"] = 0;
  if (value.length >= PASSWORD_MIN_LENGTH && classes >= 4) {
    score = 3;
    if (value.length >= 16 && warnings.length === 0) {
      score = 4;
    } else if (warnings.length > 0) {
      score = 2;
    }
  } else if (value.length >= 8 && classes >= 3) {
    score = 2;
  } else if (value.length >= 1) {
    score = 1;
  }
  return { score, warnings };
}
