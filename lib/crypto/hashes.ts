// path: lib/crypto/hashes.ts
import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";

import { getEncryptionMasterKeyMaterial } from "@/lib/config/env";
import { uuidV7Schema } from "@/lib/validation/zod-helpers";
import { z } from "zod";

/**
 * Content-integrity hashing for encrypted files. Plaintext payloads are
 * never hashed into a raw SHA-256 for duplicate detection because that
 * would create a cross-tenant oracle; instead the duplicate-check value is
 * an HMAC keyed with tenant-derived key material.
 */

export interface ContentIntegrity {
  readonly plaintextHmac: string;
  readonly ciphertextSha256: string;
  readonly ciphertextNonce: Buffer;
}

/** SHA-256 of ciphertext bytes: the tamper check at provider switch time. */
export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Tenant-scoped plaintext HMAC. The key is derived from the master key and
 * company id, so the value is stable within a tenant for dedupe yet reveals
 * nothing useful outside it.
 */
export function contentHmacForCompany(companyId: string, bytes: Buffer): string {
  uuidV7Schema.parse(companyId);
  const master = getEncryptionMasterKeyMaterial();
  try {
    const tenantKey = createHmac("sha256", master)
      .update(`kd-content-dedupe:${companyId}`, "utf8")
      .digest();
    try {
      return createHmac("sha256", tenantKey).update(bytes).digest("hex");
    } finally {
      tenantKey.fill(0);
    }
  } finally {
    master.fill(0);
  }
}

/** HTTPS freshness nonce used to bind signed delivery URLs to one issuance. */
export function generateDeliveryNonce(): string {
  return randomBytes(16).toString("base64url");
}

export const signedDownloadClaimsSchema = z.object({
  fileId: uuidV7Schema,
  companyId: uuidV7Schema,
  nonce: z.string().min(16).max(64),
  expiresAtUnix: z.number().int().positive(),
});

export type SignedDownloadClaims = z.infer<typeof signedDownloadClaimsSchema>;
