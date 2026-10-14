// path: lib/storage/signed-urls.ts
import "server-only";

import { createHmac } from "node:crypto";

import { ForbiddenError } from "@/lib/errors/app-errors";
import {
  contentHmacForCompany,
  generateDeliveryNonce,
  signedDownloadClaimsSchema,
  type SignedDownloadClaims,
} from "@/lib/crypto/hashes";

/**
 * Signed download delivery. Tokens are self-contained HMAC claims usable
 * exactly once for one file in one tenant until they expire; signatures
 * derive from tenant-scoped key material, never from a global static
 * secret.
 */

export const SIGNED_URL_TTL_SECONDS = 300;
export const SIGNED_URL_PATH_PREFIX = "/api/v1/files/deliver";

function signingKey(companyId: string): Buffer {
  // HMAC key derivation piggybacks the tenant dedupe key stream with a
  // purpose tag, keeping delivery signatures isolated from content hashes.
  const seed = contentHmacForCompany(
    companyId,
    Buffer.from(`signed-url-purpose:${companyId}`, "utf8"),
  );
  return Buffer.from(seed, "hex");
}

function signClaims(companyId: string, claimsPart: string): string {
  return createHmac("sha256", signingKey(companyId)).update(claimsPart, "utf8").digest("base64url");
}

export function issueSignedDownloadToken(companyId: string, fileId: string): string {
  const claims: SignedDownloadClaims = {
    fileId,
    companyId,
    nonce: generateDeliveryNonce(),
    expiresAtUnix: Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS,
  };
  const claimsPart = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${claimsPart}.${signClaims(companyId, claimsPart)}`;
}

/** Verifies a token; fail-closed on any signature, shape, or expiry issue. */
export function verifySignedDownloadToken(token: string): SignedDownloadClaims {
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new ForbiddenError("Download link is invalid.");
  }
  const [claimsPart, signature] = parts as [string, string];
  let parsed: SignedDownloadClaims;
  try {
    const claimsJson = JSON.parse(Buffer.from(claimsPart, "base64url").toString("utf8")) as unknown;
    parsed = signedDownloadClaimsSchema.parse(claimsJson);
  } catch {
    throw new ForbiddenError("Download link is invalid.");
  }
  const expected = signClaims(parsed.companyId, claimsPart);
  if (expected !== signature) {
    throw new ForbiddenError("Download link is invalid.");
  }
  if (parsed.expiresAtUnix < Math.floor(Date.now() / 1000)) {
    throw new ForbiddenError("Download link has expired.");
  }
  return parsed;
}

export function buildSignedDownloadPath(token: string): string {
  return `${SIGNED_URL_PATH_PREFIX}?token=${encodeURIComponent(token)}`;
}
