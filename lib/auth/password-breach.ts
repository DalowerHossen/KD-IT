// path: lib/auth/password-breach.ts
import "server-only";

import { createHash } from "node:crypto";

/**
 * Password breach checking through k-anonymity (Have I Been Pwned range
 * API): only the first five characters of the SHA-1 hash leave the
 * platform, and the suffix match happens locally. When the breach service
 * is unreachable or slow, callers fail open with an audit event instead of
 * blocking authentication on a third-party outage; the result carries a
 * checked flag so callers can say so honestly.
 */
const BREACH_RANGE_URL = "https://api.pwnedpasswords.com/range/";
const BREACH_TIMEOUT_MS = 5000;

export interface BreachHashParts {
  readonly prefix: string;
  readonly suffix: string;
}

/** Splits the uppercase SHA-1 into the range prefix and local suffix. */
export function sha1BreachParts(password: string): BreachHashParts {
  const digest = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  return { prefix: digest.slice(0, 5), suffix: digest.slice(5) };
}

export interface BreachCheckResult {
  readonly checked: boolean;
  readonly breached: boolean;
  readonly occurrences: number;
}

const UNCHECKED_RESULT: BreachCheckResult = {
  checked: false,
  breached: false,
  occurrences: 0,
};

/**
 * Parses a range response body (`SUFFIX:COUNT` lines) for the suffix.
 * Pure and deterministic so offline acceptance can prove the matching.
 */
export function parseBreachResponse(body: string, suffix: string): BreachCheckResult {
  const wanted = suffix.toUpperCase();
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") {
      continue;
    }
    const separator = trimmed.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const candidate = trimmed.slice(0, separator).toUpperCase();
    if (candidate === wanted) {
      const occurrences = Number.parseInt(trimmed.slice(separator + 1), 10);
      return {
        checked: true,
        breached: true,
        occurrences: Number.isNaN(occurrences) ? 1 : Math.max(occurrences, 1),
      };
    }
  }
  return { checked: true, breached: false, occurrences: 0 };
}

export interface BreachCheckOptions {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

/**
 * Checks a password against the breach corpus. Network failures, timeouts,
 * and malformed responses return an unchecked result; no password or hash
 * material is ever logged here.
 */
export async function checkPasswordBreach(
  password: string,
  options?: BreachCheckOptions,
): Promise<BreachCheckResult> {
  const parts = sha1BreachParts(password);
  const fetchImpl = options?.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${BREACH_RANGE_URL}${parts.prefix}`, {
      method: "GET",
      headers: { Accept: "text/plain", "Add-Padding": "true" },
      signal: AbortSignal.timeout(options?.timeoutMs ?? BREACH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return UNCHECKED_RESULT;
    }
    const body = await response.text();
    return parseBreachResponse(body, parts.suffix);
  } catch {
    return UNCHECKED_RESULT;
  }
}
