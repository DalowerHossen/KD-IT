// path: lib/crypto/envelope-format.ts
import "server-only";

import { type EncryptionEnvelope, encryptionEnvelopeSchema } from "@/lib/crypto/envelope";

/**
 * Wire format for a Step 02 data-plane envelope persisted in a database bytea
 * column: a 4-byte big-endian key version, the 12-byte nonce, the 16-byte GCM
 * tag, then the ciphertext. Defined once and shared by every feature that
 * stores an encrypted artifact at rest (substep N backups, substep O KYC
 * details) so the layout cannot drift between readers and writers.
 */
export const ENVELOPE_KEY_VERSION_BYTES = 4;
export const ENVELOPE_HEADER_BYTES = 4 + 12 + 16;

export function serializeEnvelope(envelope: EncryptionEnvelope): Buffer {
  const keyVersion = Buffer.alloc(ENVELOPE_KEY_VERSION_BYTES);
  keyVersion.writeUInt32BE(envelope.keyVersion, 0);
  return Buffer.concat([keyVersion, envelope.nonce, envelope.tag, envelope.ciphertext]);
}

export function deserializeEnvelope(data: Buffer): EncryptionEnvelope {
  const keyVersion = data.readUInt32BE(0);
  const nonce = data.subarray(4, 16);
  const tag = data.subarray(16, 32);
  const ciphertext = data.subarray(32);
  return encryptionEnvelopeSchema.parse({ ciphertext, nonce, tag, keyVersion });
}
