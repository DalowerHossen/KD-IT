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
 * owns the metadata ledger: provider, object id, encryption envelope,
 * integrity hashes, migration and quarantine state, optimistic version.
 */

export const FILE_RECORD_COLUMNS =
  "id, company_id, storage_provider, provider_object_id, provider_parent_ref, category, original_filename, sanitized_filename, mime_type, byte_length, encryption_key_version, encryption_nonce, encryption_tag, ciphertext_sha256, plaintext_hmac, migration_state, quarantine_status, published_at, uploaded_by, uploaded_at, metadata, created_at, updated_at, deleted_at, version";

export const fileRecordRowSchema = z.object({
  id: uuidV7Schema,
  company_id: uuidV7Schema,
  storage_provider: storageProviderSchema,
  provider_object_id: z.string().min(1).max(1024),
  provider_parent_ref: z.string().nullable(),
  category: fileCategorySchema,
  original_filename: z.string(),
  sanitized_filename: z.string(),
  mime_type: z.string(),
  byte_length: z.string(),
  encryption_key_version: z.number().int().min(1),
  encryption_nonce: z.instanceof(Buffer),
  encryption_tag: z.instanceof(Buffer),
  ciphertext_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  plaintext_hmac: z.string().regex(/^[0-9a-f]{64}$/),
  migration_state: z.enum(["stable", "migrating", "retaining"]),
  quarantine_status: z.enum(["clean", "pending", "quarantined", "released"]),
  published_at: z.string().nullable(),
  uploaded_by: z.string().nullable(),
  uploaded_at: z.string().nullable(),
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
  readonly originalFilename: string;
  readonly sanitizedFilename: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly encryptionKeyVersion: number;
  readonly encryptionNonce: Buffer;
  readonly encryptionTag: Buffer;
  readonly ciphertextSha256: string;
  readonly plaintextHmac: string;
  readonly quarantineStatus: FileRecordRow["quarantine_status"];
  readonly publishedAt: string | null;
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
           id, company_id, storage_provider, provider_object_id, category,
           original_filename, sanitized_filename, mime_type, byte_length,
           encryption_key_version, encryption_nonce, encryption_tag,
           ciphertext_sha256, plaintext_hmac, quarantine_status, published_at, uploaded_by, uploaded_at, metadata
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, clock_timestamp(), $18::jsonb)
         returning ${FILE_RECORD_COLUMNS}`,
        [
          input.id,
          context.companyId,
          input.storageProvider,
          input.providerObjectId,
          input.category,
          input.originalFilename,
          input.sanitizedFilename,
          input.mimeType,
          input.byteLength,
          input.encryptionKeyVersion,
          input.encryptionNonce,
          input.encryptionTag,
          input.ciphertextSha256,
          input.plaintextHmac,
          input.quarantineStatus,
          input.publishedAt,
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
         where company_id = $1 and plaintext_hmac = $2 and deleted_at is null and quarantine_status = 'clean'
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
      `select coalesce(sum(byte_length), 0)::text as total_bytes
       from app.file_records
       where company_id = $1 and deleted_at is null`,
      [companyId],
    ),
  );
  const row = result.rows[0] as { total_bytes: string } | undefined;
  return BigInt(row?.total_bytes ?? "0");
}

/**
 * Versioned metadata update used by quarantine and publication flows.
 * Optimistic-lock conflicts surface as generic conflicts, never as leaks
 * about whether a file row exists in another tenant.
 */
export async function updateFileRecordVersioned(
  context: TenantContext,
  fileId: string,
  expectedVersion: number,
  patch: Partial<
    Pick<FileRecordRow, "quarantine_status" | "published_at" | "migration_state"> & {
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
         set quarantine_status = coalesce($3, quarantine_status),
             published_at = coalesce($4, published_at),
             migration_state = coalesce($5, migration_state),
             metadata = coalesce($6::jsonb, metadata),
             version = version + 1
         where id = $1 and company_id = $2 and deleted_at is null and version = $7
         returning ${FILE_RECORD_COLUMNS}`,
        [
          fileId,
          context.companyId,
          patch.quarantine_status ?? null,
          patch.published_at ?? null,
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

/** Atomic provider flip executed only by the verified migration executor. */
export async function flipFileProvider(
  context: TenantContext,
  fileId: string,
  target: FileRecordRow["storage_provider"],
  targetObjectId: string,
  expectedVersion: number,
): Promise<FileRecordRow> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `update app.file_records
         set storage_provider = $3,
             provider_object_id = $4,
             migration_state = 'retaining',
             version = version + 1
         where id = $1 and company_id = $2 and deleted_at is null and version = $5 and migration_state = 'migrating'
         returning ${FILE_RECORD_COLUMNS}`,
        [fileId, context.companyId, target, targetObjectId, expectedVersion],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new ConflictError("File migration lock expired. Refetch and retry.");
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
         set deleted_at = clock_timestamp(), version = version + 1
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
