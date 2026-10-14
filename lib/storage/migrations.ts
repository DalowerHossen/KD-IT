// path: lib/storage/migrations.ts
import "server-only";

import { z } from "zod";

import { ConflictError, ExternalServiceError, NotFoundError } from "@/lib/errors/app-errors";
import { pgQuery, withPgTransaction } from "@/lib/db/pg";
import type { TenantContext } from "@/lib/db/tenant-context";
import { tenantContextSettings } from "@/lib/db/tenant-context";
import { sha256Hex } from "@/lib/crypto/hashes";
import { appendAuditEvent } from "@/lib/db/repositories/audit";
import {
  flipFileProvider,
  getFileRecord,
  updateFileRecordVersioned,
} from "@/lib/db/repositories/file-records";
import { tryAcquireJobLeader } from "@/lib/db/repositories/leader";
import { resolveStorageProvider } from "@/lib/storage/provider-selection";
import { storageProviderSchema } from "@/lib/storage/provider-interface";

/**
 * Storage migration executor. Copy ciphertext only (never decrypt across
 * providers), verify integrity against the recorded hash, flip the
 * provider metadata atomically, retain the old object for 30 days, and
 * enqueue its delayed purge. Every job is approval-gated, optimistic
 * locked, and idempotent under retries.
 */

export const STORAGE_RETENTION_DAYS = 30;

export const migrationJobRowSchema = z.object({
  id: z.string(),
  company_id: z.string(),
  file_id: z.string(),
  command_id: z.string(),
  source_provider: storageProviderSchema,
  target_provider: storageProviderSchema,
  status: z.enum([
    "queued",
    "copying",
    "verifying",
    "switching",
    "retaining",
    "completed",
    "failed",
    "cancelled",
  ]),
  copied_bytes: z.string(),
  verified_ciphertext: z.boolean(),
  retain_until: z.string().nullable(),
  error: z.string().nullable(),
  created_at: z.string(),
  version: z.number().int().min(1),
});
export type MigrationJobRow = z.infer<typeof migrationJobRowSchema>;

export const MIGRATION_JOB_COLUMNS =
  "id, company_id, file_id, command_id, source_provider, target_provider, status, copied_bytes, verified_ciphertext, retain_until, error, created_at, version";

async function transitionJobStatus(
  job: MigrationJobRow,
  status: MigrationJobRow["status"],
  extras?: {
    copiedBytes?: number;
    verified?: boolean;
    retainUntil?: string | null;
    error?: string | null;
  },
): Promise<MigrationJobRow> {
  const result = await pgQuery(
    `update app.storage_migration_jobs
     set status = $3,
         copied_bytes = coalesce($4, copied_bytes),
         verified_ciphertext = coalesce($5, verified_ciphertext),
         retain_until = coalesce($6::timestamptz, retain_until),
         error = coalesce($7, error),
         version = version + 1
     where id = $1 and version = $2 and deleted_at is null
     returning ${MIGRATION_JOB_COLUMNS}`,
    [
      job.id,
      job.version,
      status,
      extras?.copiedBytes ?? null,
      extras?.verified ?? null,
      extras?.retainUntil ?? null,
      extras?.error ?? null,
    ],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new ConflictError("Migration job was claimed by another worker.");
  }
  return migrationJobRowSchema.parse(row);
}

/**
 * Runs pending migration jobs for a tenant under a leader lock. One
 * worker handles the queue; idempotent status transitions make retried
 * cycles safe after crashes.
 */
export async function runStorageMigrationCycle(
  context: TenantContext,
): Promise<{ processed: number }> {
  const isLeader = await tryAcquireJobLeader(
    context.companyId,
    "storage.migration-cycle",
    "worker-1",
    600,
  );
  if (!isLeader) {
    return { processed: 0 };
  }
  const pending = await withPgTransaction(
    async (client) =>
      client.query(
        `select ${MIGRATION_JOB_COLUMNS}
         from app.storage_migration_jobs
         where deleted_at is null
           and company_id = $1
           and status in ('queued', 'failed')
         order by created_at
         limit 10`,
        [context.companyId],
      ),
    tenantContextSettings(context),
  );
  const jobs = z.array(migrationJobRowSchema).parse(pending.rows);
  let processed = 0;
  for (const job of jobs) {
    processed += (await executeOneMigration(context, job)) ? 1 : 0;
  }
  return { processed };
}

async function executeOneMigration(context: TenantContext, job: MigrationJobRow): Promise<boolean> {
  const file = await getFileRecord(context, job.file_id).catch(() => null);
  if (file === null) {
    await transitionJobStatus(job, "failed", { error: "file missing" }).catch(() => undefined);
    return false;
  }

  let current: MigrationJobRow;
  try {
    current = await transitionJobStatus(job, "copying");
    await updateFileRecordVersioned(context, file.id, file.version, {
      migration_state: "migrating",
    });
  } catch {
    return false;
  }

  try {
    const sourceAdapter = await resolveStorageProvider(context, current.source_provider);
    const targetAdapter = await resolveStorageProvider(context, current.target_provider);
    const ciphertext = await sourceAdapter.downloadObject({
      providerObjectId: file.provider_object_id,
      etag: null,
    });
    const observed = sha256Hex(ciphertext);
    if (observed !== file.ciphertext_sha256) {
      ciphertext.fill(0);
      throw new ExternalServiceError(
        "Source ciphertext did not match its recorded integrity hash.",
      );
    }

    current = await transitionJobStatus(current, "verifying", {
      verified: true,
      copiedBytes: ciphertext.length,
    });
    const uploaded = await targetAdapter.uploadObject(
      ciphertext,
      file.id,
      "application/octet-stream",
    );
    ciphertext.fill(0);

    current = await transitionJobStatus(current, "switching");
    await flipFileProvider(
      context,
      file.id,
      current.target_provider,
      uploaded.providerObjectId,
      file.version + 1,
    );

    const retainUntil = new Date(Date.now() + STORAGE_RETENTION_DAYS * 86_400_000).toISOString();
    current = await transitionJobStatus(current, "retaining", { retainUntil });
    await transitionJobStatus(current, "completed");

    await pgQuery(
      `insert into app.queue_jobs (company_id, kind, payload, run_at, dedupe_key)
       values ($1, 'storage.purge_provider_object', $2::jsonb, $3::timestamptz, $4)
       on conflict (company_id, kind, dedupe_key) where dedupe_key is not null and status in ('queued', 'claimed', 'failed_retryable')
       do nothing`,
      [
        context.companyId,
        JSON.stringify({
          fileId: file.id,
          provider: current.source_provider,
          providerObjectId: file.provider_object_id,
        }),
        retainUntil,
        `purge:${file.id}:${current.source_provider}`,
      ],
    );

    await appendAuditEvent(context, {
      actorType: "worker",
      action: "storage.migrated",
      resourceType: "storage_migration_jobs",
      resourceId: current.id,
      actorId: context.userId,
      metadata: {
        fileId: file.id,
        sourceProvider: current.source_provider,
        targetProvider: current.target_provider,
        retainedUntil: retainUntil,
      },
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "migration failure";
    await transitionJobStatus(current, "failed", { error: message.slice(0, 300) }).catch(
      () => undefined,
    );
    await appendAuditEvent(context, {
      actorType: "worker",
      action: "storage.migration_failed",
      resourceType: "storage_migration_jobs",
      resourceId: job.id,
      metadata: { fileId: file.id },
    }).catch(() => undefined);
    return false;
  }
}

/**
 * Purge worker: removes retained source objects after their retention
 * window, completing the migration lifecycle exactly once per object.
 */
export async function runStoragePurgeForJob(
  context: TenantContext,
  payload: {
    fileId: string;
    provider: z.infer<typeof storageProviderSchema>;
    providerObjectId: string;
  },
): Promise<void> {
  const adapter = await resolveStorageProvider(context, payload.provider).catch(() => null);
  if (adapter === null) {
    throw new NotFoundError("Source provider is unavailable for purge.");
  }
  await adapter.deleteObject({ providerObjectId: payload.providerObjectId, etag: null });
  await appendAuditEvent(context, {
    actorType: "worker",
    action: "storage.purged_retained_object",
    resourceType: "file_records",
    resourceId: payload.fileId,
    metadata: { provider: payload.provider },
  });
}
