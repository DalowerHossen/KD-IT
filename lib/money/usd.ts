// path: lib/money/usd.ts
import { z } from "zod";

/**
 * Canonical USD decimal-string contract. Monetary values cross every
 * TypeScript and JSON boundary as fixed-scale strings such as "1250.0000"
 * and are stored as numeric(18,4). All helpers below operate on digit
 * strings only; binary floating-point arithmetic is never used for money.
 */
export const USD_CURRENCY_CODE = "USD";
export const USD_DECIMAL_PLACES = 4;
export const USD_MAX_INTEGER_DIGITS = 14;

const CANONICAL_USD_PATTERN = /^-?(0|[1-9]\d{0,13})\.\d{4}$/;
const INPUT_USD_PATTERN = /^-?\$?\d{1,3}(,\d{3})*(\.\d{1,4})?$|^-?\$?\d+(\.\d{1,4})?$/;

export const usdAmountSchema = z
  .string()
  .regex(CANONICAL_USD_PATTERN, 'Amounts must be canonical USD strings such as "1250.0000".');

export const usdNonNegativeAmountSchema = usdAmountSchema.refine(
  (value) => !value.startsWith("-"),
  "Amounts must not be negative.",
);

export type UsdAmount = z.infer<typeof usdAmountSchema>;

export function isCanonicalUsdAmount(value: string): value is UsdAmount {
  return CANONICAL_USD_PATTERN.test(value);
}

function stripGrouping(input: string): string {
  return input.replace(/\$/g, "").replace(/,/g, "").trim();
}

/**
 * Converts user-typed or provider-supplied input into the canonical form.
 * Returns null when the value cannot be represented exactly; values with
 * more than four fraction digits are rejected rather than silently rounded.
 */
export function normalizeToCanonicalUsd(input: string): UsdAmount | null {
  const trimmed = stripGrouping(input);
  if (trimmed.length === 0 || !INPUT_USD_PATTERN.test(trimmed)) {
    return null;
  }
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [integerPart = "0", fractionPart = ""] = unsigned.split(".");
  const digits = integerPart.replace(/^0+(?=\d)/, "");
  if (digits.length > USD_MAX_INTEGER_DIGITS) {
    return null;
  }
  const paddedFraction = `${fractionPart}0000`.slice(0, USD_DECIMAL_PLACES);
  const sign = negative && (digits !== "0" || paddedFraction !== "0000") ? "-" : "";
  return `${sign}${digits}.${paddedFraction}`;
}

/** Lexicographic-safe three-way comparison of two canonical USD strings. */
export function compareUsdAmounts(left: UsdAmount, right: UsdAmount): -1 | 0 | 1 {
  if (left === right) {
    return 0;
  }
  const [leftInt = "0", leftFrac = "0000"] = left.replace(/^-/, "").split(".");
  const [rightInt = "0", rightFrac = "0000"] = right.replace(/^-/, "").split(".");
  const leftNegative = left.startsWith("-");
  const rightNegative = right.startsWith("-");
  if (leftNegative !== rightNegative) {
    return leftNegative ? -1 : 1;
  }
  const magnitude = compareMagnitude(
    `${leftInt.padStart(USD_MAX_INTEGER_DIGITS, "0")}${leftFrac}`,
    `${rightInt.padStart(USD_MAX_INTEGER_DIGITS, "0")}${rightFrac}`,
  );
  return leftNegative ? (-magnitude as -1 | 0 | 1) : magnitude;
}

function compareMagnitude(left: string, right: string): -1 | 0 | 1 {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

export interface UsdDisplayOptions {
  /** Fraction digits shown to users: 2 for summary displays, 4 for ledger. */
  readonly fractionDigits?: 2 | 4;
  readonly showCurrencyCode?: boolean;
}

/**
 * Formats a canonical USD string for display with thousands grouping using
 * digit-string manipulation only. Trailing fraction zeros are trimmed down
 * to the requested precision without any rounding of the stored value.
 */
export function formatUsdForDisplay(amount: string, options?: UsdDisplayOptions): string {
  if (!isCanonicalUsdAmount(amount)) {
    throw new Error("formatUsdForDisplay requires a canonical USD decimal string.");
  }
  const fractionDigits = options?.fractionDigits ?? 2;
  const negative = amount.startsWith("-");
  const unsigned = negative ? amount.slice(1) : amount;
  const [integerPart = "0", fractionPart = "0000"] = unsigned.split(".");
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const visibleFraction = fractionPart.slice(0, fractionDigits);
  const suffix = options?.showCurrencyCode === true ? ` ${USD_CURRENCY_CODE}` : "";
  return `${negative ? "-" : ""}$${groupedInteger}.${visibleFraction}${suffix}`;
}
