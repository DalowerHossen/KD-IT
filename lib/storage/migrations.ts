// path: lib/storage/migrations.ts
import "server-only";

import { z } from "zod";

import { ConflictError, ExternalServiceError } from "@/lib/errors/app-errors";
import { pgQuery, withPgTransaction } from "@/lib/db/pg";
import type { TenantContext } from "@/lib/db/tenant-context";
import { tenantContextSettings } from "@/lib/db/tenant-context";
import { sha256Hex } from "@/lib/crypto/hashes";
import { appendAuditEvent } from "@/lib/db/repositories/audit";
import { tryAcquireJobLeader } from "@/lib/db/repositories/leader";
import { resolveStorageProvider } from "@/lib/storage/provider-selection";
import { type StorageProviderName, storageProviderSchema } from "@/lib/storage/provider-interface";

/**
 * Storage migration executor. Drives the database-side per-file state
 * machine (app.file_migration + app.storage_fm_*), so every transition is
 * validated inside a single transaction under an optimistic lock version.
 * Ciphertext is copied verbatim (never decrypted across providers),
 * integrity-checked against the recorded hash, the provider reference is
 * switched atomically by the database, and the old object is retained for
 * 30 days before the purge worker removes it. Every migration is
 * approval-gated (command id), leader-locked, and idempotent under retry.
 */

export const STORAGE_RETENTION_DAYS = 30;

export const fileMigrationStateSchema = z.enum([
  "pending",
  "copying",
  "verifying",
  "switching",
  "retention",
  "completed",
  "failed",
]);
export type FileMigrationState = z.infer<typeof fileMigrationStateSchema>;

export const fileMigrationRowSchema = z.object({
  id: z.string(),
  company_id: z.string(),
  file_id: z.string(),
  command_id: z.string(),
  state: fileMigrationStateSchema,
  source_provider: storageProviderSchema,
  source_object_id: z.string(),
  source_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  target_provider: storageProviderSchema,
  target_object_id: z.string().nullable(),
  copied_sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  retry_count: z.number().int().min(0),
  error: z.string().nullable(),
  retention_until: z.string().nullable(),
  lock_version: z.number().int().min(0),
});
export type FileMigrationRow = z.infer<typeof fileMigrationRowSchema>;

const FILE_MIGRATION_COLUMNS =
  "id, company_id, file_id, command_id, state, source_provider, source_object_id, source_sha256, target_provider, target_object_id, copied_sha256, retry_count, error, retention_until, lock_version";

const FILE_MIGRATION_COMPOSITE_TYPES = `
  id::text, company_id::text, file_id::text, command_id::text, state::text,
  source_provider::text, source_object_id::text, source_sha256::text,
  target_provider::text, target_object_id::text, copied_sha256::text,
  retry_count, error, retention_until::text, lock_version
`;

function parseCompositeRows(rows: unknown[]): FileMigrationRow[] {
  return z.array(fileMigrationRowSchema).parse(rows);
}

/**
 * Approval-gated entry point: freezes the source snapshot, marks the file
 * migrating, and opens the single active migration row for the file.
 * Returns the migration id; conflict if another migration is active.
 */
export async function startFileMigration(
  context: TenantContext,
  fileId: string,
  commandId: string,
  targetProvider: StorageProviderName,
): Promise<string> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select app.storage_fm_prepare_copy($1::uuid, $2::uuid, $3)::text as migration_id`,
        [fileId, commandId, targetProvider],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0] as { migration_id: string } | undefined;
  if (row === undefined) {
    throw new ConflictError("Migration could not be opened for this file.");
  }
  await appendAuditEvent(context, {
    actorType: "service",
    action: "storage.migration_started",
    resourceType: "app.file_migration",
    resourceId: row.migration_id,
    actorId: context.userId,
    metadata: { fileId, targetProvider, commandId },
  });
  return row.migration_id;
}

async function transitionMigration(
  context: TenantContext,
  migrationId: string,
  fromState: FileMigrationState,
  toState: FileMigrationState | "failed",
  lockVersion: number,
  extras?: {
    targetObjectId?: string | null;
    copiedSha256?: string | null;
    retentionUntil?: string | null;
    error?: string | null;
  },
): Promise<FileMigrationRow> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select ${FILE_MIGRATION_COMPOSITE_TYPES}
         from app.storage_fm_transition(
           $1::uuid, $2, $3, $4, $5, $6::timestamptz, $7, $8
         )`,
        [
          migrationId,
          fromState,
          toState,
          extras?.targetObjectId ?? null,
          extras?.copiedSha256 ?? null,
          extras?.retentionUntil ?? null,
          lockVersion,
          extras?.error ?? null,
        ],
      ),
    tenantContextSettings(context),
  );
  const rows = parseCompositeRows(result.rows);
  const row = rows[0];
  if (row === undefined) {
    throw new ConflictError("Migration transition was rejected by the state machine.");
  }
  return row;
}

/**
 * One leader-locked cycle over pending/retryable migrations for a tenant.
 * Retried cycles resume from the recorded state, idempotently.
 */
export async function runFileMigrationCycle(
  context: TenantContext,
): Promise<{ processed: number }> {
  const isLeader = await tryAcquireJobLeader(
    context.companyId,
    "storage.file-migration-cycle",
    "worker-1",
    600,
  );
  if (!isLeader) {
    return { processed: 0 };
  }
  const pending = await withPgTransaction(
    async (client) =>
      client.query(
        `select ${FILE_MIGRATION_COLUMNS}
         from app.file_migration
         where deleted_at is null
           and company_id = $1
           and state in ('pending', 'failed')
           and retry_count < 5
         order by created_at
         limit 10`,
        [context.companyId],
      ),
    tenantContextSettings(context),
  );
  const rows = z.array(fileMigrationRowSchema).parse(pending.rows);
  let processed = 0;
  for (const row of rows) {
    processed += (await executeOneFileMigration(context, row)) ? 1 : 0;
  }
  return { processed };
}

async function executeOneFileMigration(
  context: TenantContext,
  job: FileMigrationRow,
): Promise<boolean> {
  let current: FileMigrationRow;
  try {
    current = await transitionMigration(
      context,
      job.id,
      job.state === "failed" ? "failed" : "pending",
      "copying",
      job.lock_version,
    );
  } catch {
    return false;
  }

  try {
    const sourceAdapter = await resolveStorageProvider(context, current.source_provider);
    const targetAdapter = await resolveStorageProvider(context, current.target_provider);
    const ciphertext = await sourceAdapter.downloadObject({
      providerObjectId: current.source_object_id,
      etag: null,
    });
    const observed = sha256Hex(ciphertext);
    if (observed !== current.source_sha256) {
      ciphertext.fill(0);
      throw new ExternalServiceError(
        "Source ciphertext did not match its recorded integrity hash.",
      );
    }
    const uploaded = await targetAdapter.uploadObject(
      ciphertext,
      current.file_id,
      "application/octet-stream",
    );
    ciphertext.fill(0);

    current = await transitionMigration(
      context,
      current.id,
      "copying",
      "verifying",
      current.lock_version,
      {
        targetObjectId: uploaded.providerObjectId,
        copiedSha256: observed,
      },
    );

    const verifyAdapter = targetAdapter;
    const verifyBytes = await verifyAdapter.downloadObject({
      providerObjectId: uploaded.providerObjectId,
      etag: null,
    });
    const verifiedHash = sha256Hex(verifyBytes);
    verifyBytes.fill(0);
    if (verifiedHash !== current.source_sha256) {
      throw new ExternalServiceError("Target ciphertext failed post-copy integrity verification.");
    }

    const retentionUntil = new Date(Date.now() + STORAGE_RETENTION_DAYS * 86_400_000).toISOString();
    current = await transitionMigration(
      context,
      current.id,
      "verifying",
      "switching",
      current.lock_version,
      { retentionUntil },
    );

    const finalized = await withPgTransaction(
      async (client) =>
        client.query(
          `select ${FILE_MIGRATION_COMPOSITE_TYPES}
           from app.storage_fm_finalize($1::uuid, $2)`,
          [current.id, current.lock_version],
        ),
      tenantContextSettings(context),
    );
    const after = parseCompositeRows(finalized.rows)[0];
    if (after === undefined || after.state !== "completed") {
      throw new ConflictError("Finalize did not complete the migration.");
    }

    await pgQuery(
      `insert into app.queue_jobs (company_id, kind, payload, run_at, dedupe_key)
       values ($1, 'storage.purge_provider_object', $2::jsonb, $3::timestamptz, $4)
       on conflict (company_id, kind, dedupe_key)
       where dedupe_key is not null and status in ('queued', 'claimed', 'failed_retryable')
       do nothing`,
      [
        context.companyId,
        JSON.stringify({
          fileId: current.file_id,
          provider: current.source_provider,
          providerObjectId: current.source_object_id,
        }),
        retentionUntil,
        `purge:${current.file_id}:${current.source_provider}`,
      ],
    );

    await appendAuditEvent(context, {
      actorType: "worker",
      action: "storage.migrated",
      resourceType: "app.file_migration",
      resourceId: current.id,
      actorId: context.userId,
      metadata: {
        fileId: current.file_id,
        sourceProvider: current.source_provider,
        targetProvider: current.target_provider,
        retainedUntil: retentionUntil,
      },
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "migration failure";
    await transitionMigration(context, current.id, current.state, "failed", current.lock_version, {
      error: message.slice(0, 300),
    }).catch(() => undefined);
    await appendAuditEvent(context, {
      actorType: "worker",
      action: "storage.migration_failed",
      resourceType: "app.file_migration",
      resourceId: current.id,
      metadata: { fileId: current.file_id },
    }).catch(() => undefined);
    return false;
  }
}

/**
 * Purge worker: removes retained source objects after their retention
 * window. Exactly-once at the provider level; the delayed queue job is
 * deduped per file and provider.
 */
export async function runStoragePurgeForJob(
  context: TenantContext,
  payload: {
    fileId: string;
    provider: z.infer<typeof storageProviderSchema>;
    providerObjectId: string;
  },
): Promise<void> {
  const adapter = await resolveStorageProvider(context, payload.provider);
  await adapter.deleteObject({ providerObjectId: payload.providerObjectId, etag: null });
  await appendAuditEvent(context, {
    actorType: "worker",
    action: "storage.purged_retained_object",
    resourceType: "file_records",
    resourceId: payload.fileId,
    metadata: { provider: payload.provider },
  });
}
