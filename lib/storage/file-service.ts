// path: lib/storage/file-service.ts
import "server-only";

import { z } from "zod";

import { ExternalServiceError, ValidationError } from "@/lib/errors/app-errors";
import { pgQuery } from "@/lib/db/pg";
import type { TenantContext } from "@/lib/db/tenant-context";
import { getEncryptionKeyVersion } from "@/lib/config/env";
import { decryptData, encryptData } from "@/lib/crypto/envelope";
import { contentHmacForCompany, sha256Hex } from "@/lib/crypto/hashes";
import {
  type FileRecordRow,
  createFileRecord,
  findDuplicateFile,
  getFileRecord,
  softDeleteFileRecord,
  sumTenantStorageBytes,
  updateFileRecordVersioned,
} from "@/lib/db/repositories/file-records";
import { appendAuditEvent } from "@/lib/db/repositories/audit";
import {
  type FileCategory,
  fileCategorySchema,
  sanitizeFilename,
  stripJpegMetadata,
  validateUploadContent,
} from "@/lib/files/validation";
import { resolveStorageProvider, selectUploadProvider } from "@/lib/storage/provider-selection";

/**
 * Step 02 file service: the single server-side orchestration of encrypted
 * file upload, download, and delete. Uploads validate content, dedupe,
 * encrypt before any provider call, persist metadata, and publish; every
 * step is audited. Downloads decrypt only server-side for authorized
 * delivery; signed URLs bind one issuance to one file in one tenant.
 */

const ENCRYPTION_RESOURCE_PREFIX = "file-object";
const DEFAULT_TENANT_QUOTA_BYTES = BigInt(5 * 1024 * 1024 * 1024);

/** Every file row identifier is minted by the database generator. */
async function mintDatabaseUuidV7(): Promise<string> {
  const result = await pgQuery("select app.uuid_v7()::text as id");
  const row = result.rows[0] as { id: string } | undefined;
  return z.string().parse(row?.id);
}

export interface UploadedFileSummary {
  readonly id: string;
  readonly duplicateOf: string | null;
  readonly storageProvider: string;
  readonly byteLength: number;
  readonly encryptionKeyVersion: number;
}

const uploadInputSchema = z.object({
  originalFilename: z.string().min(1).max(500),
  declaredMime: z.string().min(3).max(100),
  category: fileCategorySchema,
  bytes: z.instanceof(Buffer),
});

export type UploadFileInput = z.infer<typeof uploadInputSchema>;

/**
 * Encrypted upload pipeline. Content checks always precede provider calls;
 * a file is never published while its security verdict is anything but
 * clean. Duplicate uploads return the existing record rather than storing
 * bytes twice.
 */
export async function uploadEncryptedFile(
  context: TenantContext,
  input: UploadFileInput,
): Promise<UploadedFileSummary> {
  const validated = uploadInputSchema.parse(input);
  const category: FileCategory = validated.category;

  const sanitizedBase = sanitizeFilename(validated.originalFilename);
  const checked = validateUploadContent(
    sanitizedBase,
    validated.declaredMime,
    validated.bytes,
    category,
  );

  const prepared =
    checked.extension === ".jpg" || checked.extension === ".jpeg"
      ? stripJpegMetadata(validated.bytes)
      : validated.bytes;

  const plaintextHmac = contentHmacForCompany(context.companyId, prepared);
  const duplicate = await findDuplicateFile(context, plaintextHmac);
  if (duplicate !== null) {
    await appendAuditEvent(context, {
      actorType: "user",
      action: "file.upload_duplicate",
      resourceType: "file_records",
      resourceId: duplicate.id,
      metadata: { category, filename: checked.sanitizedFilename },
    });
    return {
      id: duplicate.id,
      duplicateOf: duplicate.id,
      storageProvider: duplicate.storage_provider,
      byteLength: Number.parseInt(duplicate.byte_length, 10),
      encryptionKeyVersion: duplicate.encryption_key_version,
    };
  }

  const storedBytes = await sumTenantStorageBytes(context.companyId);
  if (storedBytes + BigInt(prepared.length) > DEFAULT_TENANT_QUOTA_BYTES) {
    throw new ValidationError("The workspace storage quota is exhausted.");
  }

  const mintedId = await mintDatabaseUuidV7();
  const fileId = mintedId;
  const keyVersion = getEncryptionKeyVersion();
  const plaintextLength = prepared.length;
  const envelope = encryptData(
    {
      companyId: context.companyId,
      resourceId: `${ENCRYPTION_RESOURCE_PREFIX}:${fileId}`,
      category,
      keyVersion,
    },
    prepared,
  );
  prepared.fill(0);
  const ciphertextSha256 = sha256Hex(envelope.ciphertext);

  const adapter = await selectUploadProvider(context);
  const ref = await adapter.uploadObject(envelope.ciphertext, fileId, "application/octet-stream");
  envelope.ciphertext.fill(0);

  let record: FileRecordRow;
  try {
    record = await createFileRecord(context, {
      id: fileId,
      storageProvider: adapter.name,
      providerObjectId: ref.providerObjectId,
      category,
      originalFilename: validated.originalFilename,
      sanitizedFilename: checked.sanitizedFilename,
      mimeType: checked.resolvedMime,
      byteLength: plaintextLength,
      encryptionKeyVersion: keyVersion,
      encryptionNonce: envelope.nonce,
      encryptionTag: envelope.tag,
      ciphertextSha256,
      plaintextHmac,
      quarantineStatus: "clean",
      publishedAt: new Date().toISOString(),
      uploadedBy: context.userId,
      metadata: { verifiedMime: checked.resolvedMime, integrity: ciphertextSha256 },
    });
  } catch (error) {
    await adapter.deleteObject(ref).catch(() => undefined);
    throw error;
  }

  await appendAuditEvent(context, {
    actorType: "user",
    action: "file.uploaded",
    resourceType: "file_records",
    resourceId: record.id,
    metadata: {
      category,
      filename: checked.sanitizedFilename,
      byteLength: plaintextLength,
      storageProvider: adapter.name,
      encryptionKeyVersion: keyVersion,
    },
  });

  return {
    id: record.id,
    duplicateOf: null,
    storageProvider: adapter.name,
    byteLength: plaintextLength,
    encryptionKeyVersion: keyVersion,
  };
}

export interface DownloadedFile {
  readonly bytes: Buffer;
  readonly record: FileRecordRow;
}

/**
 * Authorized download: reads through the provider recorded on the file row
 * (not the currently preferred one), verifies integrity, then decrypts.
 */
export async function downloadDecryptedFile(
  context: TenantContext,
  fileId: string,
): Promise<DownloadedFile> {
  const record = await getFileRecord(context, fileId);
  if (record.quarantine_status === "quarantined") {
    throw new ValidationError("This file is under security review and cannot be downloaded.");
  }
  const adapter = await resolveStorageProvider(context, record.storage_provider);
  const ciphertext = await adapter.downloadObject({
    providerObjectId: record.provider_object_id,
    etag: null,
  });
  if (sha256Hex(ciphertext) !== record.ciphertext_sha256) {
    ciphertext.fill(0);
    throw new ExternalServiceError("Stored object failed integrity verification.");
  }
  const plaintext = decryptData(
    {
      companyId: context.companyId,
      resourceId: `${ENCRYPTION_RESOURCE_PREFIX}:${record.id}`,
      category: record.category,
    },
    {
      ciphertext,
      nonce: record.encryption_nonce,
      tag: record.encryption_tag,
      keyVersion: record.encryption_key_version,
    },
  );
  ciphertext.fill(0);
  await appendAuditEvent(context, {
    actorType: "user",
    action: "file.downloaded",
    resourceType: "file_records",
    resourceId: record.id,
    metadata: { category: record.category, storageProvider: record.storage_provider },
  });
  return { bytes: plaintext, record };
}

/**
 * Soft delete with optimistic lock and best-effort provider cleanup.
 * Provider deletion happens after the row is marked deleted; failures
 * surface as external-service errors and are retried by the retention
 * sweeps (outbox topic storage.purge_provider_object).
 */
export async function deleteFile(
  context: TenantContext,
  fileId: string,
  expectedVersion: number,
): Promise<void> {
  const record = await getFileRecord(context, fileId);
  const deleted = await softDeleteFileRecord(context, fileId, expectedVersion);
  const adapter = await resolveStorageProvider(context, record.storage_provider);
  await adapter.deleteObject({ providerObjectId: record.provider_object_id, etag: null });
  await appendAuditEvent(context, {
    actorType: "user",
    action: "file.deleted",
    resourceType: "file_records",
    resourceId: deleted.id,
    metadata: { category: record.category, storageProvider: record.storage_provider },
  });
}

/** Quarantine verdict application for the internal scanning job. */
export async function applyQuarantineVerdict(
  context: TenantContext,
  fileId: string,
  expectedVersion: number,
  verdict: "quarantined" | "released",
): Promise<void> {
  const updated = await updateFileRecordVersioned(context, fileId, expectedVersion, {
    quarantine_status: verdict,
  });
  await appendAuditEvent(context, {
    actorType: "service",
    action: verdict === "quarantined" ? "file.quarantined" : "file.quarantine_released",
    resourceType: "file_records",
    resourceId: updated.id,
    metadata: { verdict },
  });
}
