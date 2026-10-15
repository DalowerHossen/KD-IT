// path: lib/db/repositories/file-records.ts
import "server-only";

import { z } from "zod";

import { withPgTransaction } from "@/lib/db/pg";
import {
  type TenantContext,
  requireOwnedRow,
  tenantContextSettings,
} from "@/lib/db/tenant-context";
import { ConflictError, NotFoundError } from "@/lib/errors/app-errors";
import { fileCategorySchema } from "@/lib/files/validation";
import { storageProviderSchema } from "@/lib/storage/provider-interface";
import { uuidV7Schema } from "@/lib/validation/zod-helpers";

/**
 * File record repository. Byte-level content never lives here; this module
 * owns the metadata ledger: provider reference, encryption envelope
 * (base64 nonce/tag), integrity hashes, upload/quarantine state, migration
 * state, optimistic version. Column names mirror migration 007 exactly.
 */

export const FILE_RECORD_COLUMNS =
  "id, company_id, category, storage_provider, provider_object_id, original_name, sanitized_name, mime_type, extension, byte_size, encryption_ciphertext_sha256, plaintext_hmac, encryption_nonce_b64, encryption_tag_b64, encryption_key_version, upload_state, uploaded_by, uploaded_at, migration_state, metadata, created_at, updated_at, deleted_at, version";

export const fileUploadStateSchema = z.enum([
  "scanning",
  "clean",
  "quarantined",
  "deleted",
  "materializing",
]);
export type FileUploadState = z.infer<typeof fileUploadStateSchema>;

export const fileRecordRowSchema = z.object({
  id: uuidV7Schema,
  company_id: uuidV7Schema,
  category: fileCategorySchema,
  storage_provider: storageProviderSchema,
  provider_object_id: z.string().min(1).max(1024),
  original_name: z.string().min(1).max(250),
  sanitized_name: z.string().min(1).max(250),
  mime_type: z.string().min(1),
  extension: z.string().regex(/^\.[a-z0-9]{1,10}$/),
  byte_size: z.string(),
  encryption_ciphertext_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  plaintext_hmac: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  encryption_nonce_b64: z.string().min(1).nullable(),
  encryption_tag_b64: z.string().min(1).nullable(),
  encryption_key_version: z.number().int().min(1),
  upload_state: fileUploadStateSchema,
  uploaded_by: z.string().nullable(),
  uploaded_at: z.string().nullable(),
  migration_state: z.enum(["stable", "migrating"]),
  metadata: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  version: z.number().int().min(1),
});
export type FileRecordRow = z.infer<typeof fileRecordRowSchema>;

export interface NewFileRecordInput {
  readonly id: string;
  readonly storageProvider: FileRecordRow["storage_provider"];
  readonly providerObjectId: string;
  readonly category: FileRecordRow["category"];
  readonly originalName: string;
  readonly sanitizedName: string;
  readonly mimeType: string;
  readonly extension: string;
  readonly byteSize: number;
  readonly encryptionCiphertextSha256: string;
  readonly plaintextHmac: string;
  readonly encryptionNonceB64: string;
  readonly encryptionTagB64: string;
  readonly encryptionKeyVersion: number;
  readonly uploadedBy: string | null;
  readonly metadata?: Record<string, unknown>;
}

export async function createFileRecord(
  context: TenantContext,
  input: NewFileRecordInput,
): Promise<FileRecordRow> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `insert into app.file_records (
           id, company_id, category, storage_provider, provider_object_id,
           original_name, sanitized_name, mime_type, extension, byte_size,
           encryption_ciphertext_sha256, plaintext_hmac,
           encryption_nonce_b64, encryption_tag_b64, encryption_key_version,
           upload_state, uploaded_by, uploaded_at, metadata
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                 'clean', $16, clock_timestamp(), $17::jsonb)
         returning ${FILE_RECORD_COLUMNS}`,
        [
          input.id,
          context.companyId,
          input.category,
          input.storageProvider,
          input.providerObjectId,
          input.originalName,
          input.sanitizedName,
          input.mimeType,
          input.extension,
          input.byteSize,
          input.encryptionCiphertextSha256,
          input.plaintextHmac,
          input.encryptionNonceB64,
          input.encryptionTagB64,
          input.encryptionKeyVersion,
          input.uploadedBy,
          JSON.stringify(input.metadata ?? {}),
        ],
      ),
    tenantContextSettings(context),
  );
  return fileRecordRowSchema.parse(result.rows[0]);
}

export async function getFileRecord(
  context: TenantContext,
  fileId: string,
): Promise<FileRecordRow> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select ${FILE_RECORD_COLUMNS}
         from app.file_records
         where id = $1 and deleted_at is null`,
        [fileId],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new NotFoundError("File not found.");
  }
  return fileRecordRowSchema.parse(requireOwnedRow(context, row as FileRecordRow));
}

/** Duplicate detection within one tenant via the HMAC-protected content hash. */
export async function findDuplicateFile(
  context: TenantContext,
  plaintextHmac: string,
): Promise<FileRecordRow | null> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select ${FILE_RECORD_COLUMNS}
         from app.file_records
         where company_id = $1 and plaintext_hmac = $2 and deleted_at is null
           and upload_state = 'clean'
         order by created_at desc
         limit 1`,
        [context.companyId, plaintextHmac],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0];
  return row === undefined ? null : fileRecordRowSchema.parse(row);
}

export interface FileListQuery {
  readonly limit: number;
  readonly cursor?: string;
  readonly category?: string;
}

export async function listFileRecords(
  context: TenantContext,
  query: FileListQuery,
): Promise<FileRecordRow[]> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select ${FILE_RECORD_COLUMNS}
         from app.file_records
         where deleted_at is null
           and company_id = $1
           and ($2::text is null or category = $2)
           and ($3::timestamptz is null or created_at < $3)
         order by created_at desc, id desc
         limit $4`,
        [context.companyId, query.category ?? null, query.cursor ?? null, query.limit],
      ),
    tenantContextSettings(context),
  );
  return z.array(fileRecordRowSchema).parse(result.rows);
}

export async function sumTenantStorageBytes(companyId: string): Promise<bigint> {
  const result = await withPgTransaction(async (client) =>
    client.query(
      `select coalesce(sum(byte_size), 0)::text as total_bytes
       from app.file_records
       where company_id = $1 and deleted_at is null`,
      [companyId],
    ),
  );
  const row = result.rows[0] as { total_bytes: string } | undefined;
  return BigInt(row?.total_bytes ?? "0");
}

/**
 * Versioned metadata update used by quarantine and migration flows.
 * Optimistic-lock conflicts surface as generic conflicts, never as leaks
 * about whether a file row exists in another tenant.
 */
export async function updateFileRecordVersioned(
  context: TenantContext,
  fileId: string,
  expectedVersion: number,
  patch: Partial<
    Pick<FileRecordRow, "upload_state" | "uploaded_at" | "migration_state"> & {
      metadata: Record<string, unknown>;
    }
  >,
): Promise<FileRecordRow> {
  const current = await getFileRecord(context, fileId);
  if (current.version !== expectedVersion) {
    throw new ConflictError("File metadata changed concurrently. Reload and retry.");
  }
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `update app.file_records
         set upload_state = coalesce($3, upload_state),
             uploaded_at = coalesce($4::timestamptz, uploaded_at),
             migration_state = coalesce($5, migration_state),
             metadata = coalesce($6::jsonb, metadata),
             version = version + 1
         where id = $1 and company_id = $2 and deleted_at is null and version = $7
         returning ${FILE_RECORD_COLUMNS}`,
        [
          fileId,
          context.companyId,
          patch.upload_state ?? null,
          patch.uploaded_at ?? null,
          patch.migration_state ?? null,
          patch.metadata !== undefined ? JSON.stringify(patch.metadata) : null,
          expectedVersion,
        ],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new ConflictError("File metadata changed concurrently. Reload and retry.");
  }
  return fileRecordRowSchema.parse(row);
}

/** Soft delete with optimistic lock; physical provider deletion follows. */
export async function softDeleteFileRecord(
  context: TenantContext,
  fileId: string,
  expectedVersion: number,
): Promise<FileRecordRow> {
  await getFileRecord(context, fileId);
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `update app.file_records
         set deleted_at = clock_timestamp(), upload_state = 'deleted', version = version + 1
         where id = $1 and company_id = $2 and deleted_at is null and version = $3
         returning ${FILE_RECORD_COLUMNS}`,
        [fileId, context.companyId, expectedVersion],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new ConflictError("File metadata changed concurrently. Reload and retry.");
  }
  return fileRecordRowSchema.parse(row);
}
