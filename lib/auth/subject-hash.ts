// path: lib/auth/subject-hash.ts
import "server-only";

import { createHmac } from "node:crypto";

import { getEncryptionMasterKeyMaterial } from "@/lib/config/env";
import { emailSchema } from "@/lib/validation/zod-helpers";

/**
 * Stable HMAC identity for authentication-security records (attempts and
 * locks). The identity key is derived from the platform master key under
 * an auth-specific domain, so subject hashes are stable per account, reveal
 * nothing about which accounts exist, and cannot be joined to file-dedupe
 * or device HMACs from other domains. Key material is zeroed after use and
 * no new environment variable is required.
 */
const AUTH_SUBJECT_DOMAIN = "kd-auth-subject:v1";

export function authSubjectHash(email: string): string {
  const normalized = emailSchema.parse(email.trim());
  const master = getEncryptionMasterKeyMaterial();
  try {
    const domainKey = createHmac("sha256", master).update(AUTH_SUBJECT_DOMAIN, "utf8").digest();
    try {
      return createHmac("sha256", domainKey).update(normalized, "utf8").digest("hex");
    } finally {
      domainKey.fill(0);
    }
  } finally {
    master.fill(0);
  }
}
