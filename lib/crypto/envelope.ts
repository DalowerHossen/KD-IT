// path: lib/crypto/envelope.ts
import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { getEncryptionKeyVersion, getEncryptionMasterKeyMaterial } from "@/lib/config/env";
import { InternalError, ValidationError } from "@/lib/errors/app-errors";
import { uuidV7Schema } from "@/lib/validation/zod-helpers";
import { z } from "zod";

/**
 * Step 02 data-plane encryption envelope. Every encryption operation uses
 * AES-256-GCM with a unique nonce, tenant-scoped and resource-scoped data
 * keys derived from the configured master key with HKDF-SHA256, and
 * additional authenticated data binding the plaintext context so that
 * ciphertexts can never be moved across tenants, categories, resources, or
 * key versions without detection.
 */

export const ENCRYPTION_ALGORITHM = "aes-256-gcm";
export const NONCE_LENGTH_BYTES = 12;
export const TAG_LENGTH_BYTES = 16;
export const DATA_KEY_LENGTH_BYTES = 32;
export const KEY_VERSION_LABEL_PREFIX = "v";

export const encryptionContextSchema = z.object({
  companyId: uuidV7Schema,
  resourceId: z.string().min(1).max(200),
  category: z.string().regex(/^[a-z][a-z0-9_-]{1,40}$/),
  keyVersion: z.number().int().min(1),
});

export type EncryptionContext = z.infer<typeof encryptionContextSchema>;

export const encryptionEnvelopeSchema = z.object({
  ciphertext: z.instanceof(Buffer),
  nonce: z.instanceof(Buffer).refine((value) => value.length === NONCE_LENGTH_BYTES, {
    message: "nonce must contain exactly 12 bytes",
  }),
  tag: z.instanceof(Buffer).refine((value) => value.length === TAG_LENGTH_BYTES, {
    message: "tag must contain exactly 16 bytes",
  }),
  keyVersion: z.number().int().min(1),
});

export type EncryptionEnvelope = z.infer<typeof encryptionEnvelopeSchema>;

function buildAad(context: EncryptionContext): Buffer {
  return Buffer.from(
    `${context.companyId}:${context.resourceId}:${context.category}:key-version:${context.keyVersion}`,
    "utf8",
  );
}

function deriveDataKey(context: EncryptionContext): Buffer {
  const master = getEncryptionMasterKeyMaterial();
  try {
    return Buffer.from(
      hkdfSync(
        "sha256",
        master,
        Buffer.from(`kd-data-plane:v${context.keyVersion}`, "utf8"),
        Buffer.from(`${context.companyId}:${context.resourceId}:${context.category}`, "utf8"),
        DATA_KEY_LENGTH_BYTES,
      ),
    );
  } finally {
    master.fill(0);
  }
}

/**
 * Encrypts plaintext with a fresh nonce per call and returns the full
 * envelope. Never reuse this return value for another resource: context is
 * baked into both the key and the authenticated data.
 */
export function encryptData(context: EncryptionContext, plaintext: Buffer): EncryptionEnvelope {
  const validated = encryptionContextSchema.parse(context);
  const nonce = randomBytes(NONCE_LENGTH_BYTES);
  const dataKey = deriveDataKey(validated);
  try {
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, dataKey, nonce);
    cipher.setAAD(buildAad(validated));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return encryptionEnvelopeSchema.parse({
      ciphertext,
      nonce,
      tag,
      keyVersion: validated.keyVersion,
    });
  } finally {
    dataKey.fill(0);
  }
}

/**
 * Decrypts an envelope after validating that the supplied context matches
 * the recorded envelope key version. Authentication failure raises a
 * generic decryption error that never exposes plaintext or key material.
 */
export function decryptData(
  context: Omit<EncryptionContext, "keyVersion">,
  envelope: EncryptionEnvelope,
): Buffer {
  const validated = encryptionEnvelopeSchema.parse(envelope);
  const contextWithVersion = encryptionContextSchema.parse({
    companyId: context.companyId,
    resourceId: context.resourceId,
    category: context.category,
    keyVersion: validated.keyVersion,
  });
  const dataKey = deriveDataKey(contextWithVersion);
  try {
    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, dataKey, validated.nonce);
    decipher.setAAD(buildAad(contextWithVersion));
    decipher.setAuthTag(validated.tag);
    return Buffer.concat([decipher.update(validated.ciphertext), decipher.final()]);
  } catch {
    throw new InternalError("ciphertext could not be decrypted");
  } finally {
    dataKey.fill(0);
  }
}

/**
 * Rotates an envelope to the active configured key version. Derives the old
 * key from the envelope's recorded version and the new key from the active
 * version, so key changes never require plaintext secrets in configuration.
 */
export function rotateEnvelope(
  context: Omit<EncryptionContext, "keyVersion">,
  envelope: EncryptionEnvelope,
): EncryptionEnvelope {
  const plaintext = decryptData(context, envelope);
  try {
    return encryptData(
      {
        companyId: context.companyId,
        resourceId: context.resourceId,
        category: context.category,
        keyVersion: getEncryptionKeyVersion(),
      },
      plaintext,
    );
  } finally {
    plaintext.fill(0);
  }
}

/** Non-secret label for logs and audit records, such as "v3". */
export function keyVersionLabel(keyVersion: number): string {
  if (!Number.isInteger(keyVersion) || keyVersion < 1) {
    throw new ValidationError("Key versions are positive integers.");
  }
  return `${KEY_VERSION_LABEL_PREFIX}${keyVersion}`;
}

/**
 * Timing-safe secret-value comparison restricted to the exact legitimate
 * use: comparing a presented credential with one already in memory.
 */
export function constantTimeEqual(left: Buffer, right: Buffer): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

/** Active key version as a label, for context builders and audit lines. */
export function activeKeyVersionLabel(): string {
  return keyVersionLabel(getEncryptionKeyVersion());
}
