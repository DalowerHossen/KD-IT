// path: lib/auth/password-hash.ts
import "server-only";

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { InternalError } from "@/lib/errors/app-errors";

/**
 * Server-side password hashing for the reuse-history store. The provider
 * remains the authentication verifier; these scrypt verifiers exist only
 * so the previous-password check never needs a provider round trip.
 * Format: scrypt$v1$N$r$p$saltB64$keyB64. Verification is constant-time
 * over the derived key.
 */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

/**
 * promisify picks the three-argument scrypt overload, so the handle is cast
 * to the documented four-argument form (password, salt, key length,
 * options). The runtime call matches Node's scrypt signature exactly.
 */
const scryptAsync = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** Derives a versioned scrypt verifier for storage in password history. */
export async function hashPasswordHistoryEntry(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = (await scryptAsync(password, salt, KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  })) as Buffer;
  return `scrypt$v1$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

interface ParsedHistoryHash {
  readonly n: number;
  readonly r: number;
  readonly p: number;
  readonly salt: Buffer;
  readonly key: Buffer;
}

function parseHistoryHash(stored: string): ParsedHistoryHash | null {
  const parts = stored.split("$");
  if (parts.length !== 7 || parts[0] !== "scrypt" || parts[1] !== "v1") {
    return null;
  }
  const n = Number(parts[2]);
  const r = Number(parts[3]);
  const p = Number(parts[4]);
  if (
    !Number.isInteger(n) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    n <= 0 ||
    r <= 0 ||
    p <= 0
  ) {
    return null;
  }
  try {
    const salt = Buffer.from(parts[5] ?? "", "base64");
    const key = Buffer.from(parts[6] ?? "", "base64");
    if (salt.length === 0 || key.length === 0) {
      return null;
    }
    return { n, r, p, salt, key };
  } catch {
    return null;
  }
}

/**
 * Constant-time comparison of a candidate password against a stored
 * history verifier. Malformed stored verifiers fail closed.
 */
export async function verifyPasswordHistoryEntry(
  password: string,
  stored: string,
): Promise<boolean> {
  const parsed = parseHistoryHash(stored);
  if (parsed === null) {
    throw new InternalError("Password history entry is malformed.");
  }
  const candidate = (await scryptAsync(password, parsed.salt, parsed.key.length, {
    N: parsed.n,
    r: parsed.r,
    p: parsed.p,
    maxmem: 64 * 1024 * 1024,
  })) as Buffer;
  if (candidate.length !== parsed.key.length) {
    return false;
  }
  return timingSafeEqual(candidate, parsed.key);
}
