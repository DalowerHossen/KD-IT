// path: lib/money/decimal.ts
import Decimal from "decimal.js";

import { InternalError, ValidationError } from "@/lib/errors/app-errors";
import { type UsdAmount, isCanonicalUsdAmount, usdAmountSchema } from "@/lib/money/usd";

/**
 * Step 02 arbitrary-precision USD arithmetic. The Step 01 string contract
 * (lib/money/usd.ts) remains the single boundary format: database numeric
 * columns are parsed as strings by pg type parsers and every TypeScript or
 * JSON edge carries canonical decimal strings. This module adds exact
 * arithmetic, comparison, and allocation on top through decimal.js.
 */

Decimal.set({ precision: 40, toExpNeg: -20, toExpPos: 40, rounding: Decimal.ROUND_HALF_EVEN });

export { Decimal };

/**
 * Parses a canonical USD string into an exact Decimal instance. Rejects
 * anything outside the Step 01 canonical contract, so JavaScript numbers
 * can never enter the monetary pipeline by mistake.
 */
export function usdToDecimal(value: string): Decimal {
  if (!isCanonicalUsdAmount(value)) {
    throw new ValidationError("Amounts must be canonical USD decimal strings.", {
      details: { expected: 'fixed-scale string such as "1250.0000"' },
    });
  }
  return new Decimal(value);
}

/** Serializes a Decimal back to the canonical USD string contract. */
export function decimalToUsd(value: Decimal): UsdAmount {
  if (!value.isFinite()) {
    throw new ValidationError("Monetary values must stay finite.");
  }
  const fixed = value.toFixed(4, Decimal.ROUND_HALF_EVEN);
  const normalized = fixed === "-0.0000" ? "0.0000" : fixed;
  return usdAmountSchema.parse(normalized);
}

function toDecimalAmounts(values: readonly string[]): Decimal[] {
  return values.map((value) => usdToDecimal(value));
}

/** Exact multi-operand addition with canonical string input and output. */
export function usdSum(values: readonly string[]): UsdAmount {
  const total = toDecimalAmounts(values).reduce(
    (accumulator, current) => accumulator.add(current),
    new Decimal(0),
  );
  return decimalToUsd(total);
}

/** Exact subtraction: left minus right, canonical strings in and out. */
export function usdSubtract(left: string, right: string): UsdAmount {
  return decimalToUsd(usdToDecimal(left).sub(usdToDecimal(right)));
}

/** Exact multiplication by a rational factor provided as a string. */
export function usdMultiplyByRatio(amount: string, ratio: string): UsdAmount {
  const ratioDecimal = new Decimal(ratio);
  if (!ratioDecimal.isFinite()) {
    throw new ValidationError("Ratio factors must be finite decimal strings.");
  }
  return decimalToUsd(usdToDecimal(amount).mul(ratioDecimal));
}

/** Exact division by a non-zero rational factor provided as a string. */
export function usdDivideByRatio(amount: string, divisor: string): UsdAmount {
  const divisorDecimal = new Decimal(divisor);
  if (!divisorDecimal.isFinite() || divisorDecimal.isZero()) {
    throw new ValidationError("Divisor factors must be non-zero finite decimal strings.");
  }
  return decimalToUsd(usdToDecimal(amount).div(divisorDecimal));
}

/**
 * Allocates a canonical total across weight shares without drift: every
 * part is rounded to scale 4 and the residual stays with the last part,
 * so the parts always re-sum to the exact total.
 */
export function usdAllocateByWeights(total: string, weights: readonly string[]): UsdAmount[] {
  if (weights.length === 0) {
    throw new ValidationError("At least one weight is required for allocation.");
  }
  const totalDecimal = usdToDecimal(total);
  const weightDecimals = toDecimalAmounts(weights);
  if (weightDecimals.some((weight) => weight.isNegative())) {
    throw new ValidationError("Allocation weights must not be negative.");
  }
  const weightTotal = weightDecimals.reduce(
    (accumulator, current) => accumulator.add(current),
    new Decimal(0),
  );
  if (weightTotal.lte(0)) {
    throw new ValidationError("Allocation weights must sum to a positive value.");
  }

  const parts: Decimal[] = [];
  let distributed = new Decimal(0);
  for (let index = 0; index < weightDecimals.length; index += 1) {
    const weight = weightDecimals[index] ?? unhandledUnexpectedWeight();
    parts.push(
      totalDecimal.mul(weight).div(weightTotal).toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN),
    );
    distributed = distributed.add(parts[index] ?? unhandledUnexpectedWeight());
  }
  const residual = totalDecimal.sub(distributed);
  const lastIndex = parts.length - 1;
  parts[lastIndex] = (parts[lastIndex] ?? unhandledUnexpectedWeight()).add(residual);
  const canon = parts.map((part) => decimalToUsd(part));
  if (usdSum(canon) !== decimalToUsd(totalDecimal)) {
    throw new InternalError("allocation drift detected", {
      details: { totalCanonical: decimalToUsd(totalDecimal), partCount: canon.length },
    });
  }
  return canon;
}

function unhandledUnexpectedWeight(): Decimal {
  throw new ValidationError("Weight list contained an error value.");
}
