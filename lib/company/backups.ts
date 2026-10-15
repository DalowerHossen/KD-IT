// path: lib/company/backups.ts
import "server-only";

import { z } from "zod";

import {
  requirePermission,
  requirePlatformContext,
  requireTenantContext,
} from "@/lib/auth/authorization";
import { requireEntitlement } from "@/lib/company/entitlements";
import { appendAuditEvent } from "@/lib/db/repositories/audit";
import { pgQuery, toDatabaseError, withPgTransaction } from "@/lib/db/pg";
import type { TenantContext } from "@/lib/db/tenant-context";
import { tenantContextSettings } from "@/lib/db/tenant-context";
import { type EncryptionEnvelope, decryptData, encryptData } from "@/lib/crypto/envelope";
import { deserializeEnvelope, serializeEnvelope } from "@/lib/crypto/envelope-format";
import { sha256Hex } from "@/lib/crypto/hashes";
import { getEncryptionKeyVersion } from "@/lib/config/env";
import { ConflictError, NotFoundError } from "@/lib/errors/app-errors";

/**
 * Substep N - encrypted backup requests. A Professional workspace (the "backups"
 * entitlement) requests an encrypted export of its data. The request is
 * fulfilled by a background worker (Step 16): the workspace is snapshot to
 * JSON, encrypted with the Step 02 data-plane envelope (data key derived from
 * the workspace + request id, so nothing extra is stored), the ciphertext is
 * stored here, and its SHA-256 is recorded. The owner downloads the decrypted
 * export within the expiry window. Request/list/download are tenant-scoped
 * (owner); fulfil and expire are platform/worker operations.
 */

const BACKUP_COLUMNS =
  "id, company_id, requested_by, status, fulfilled_at, expires_at, artifact_sha256, artifact_size_bytes, failure_reason, created_at, version";

const BACKUP_TABLES = [
  "company_profiles",
  "company_invoice_settings",
  "custom_domains",
  "memberships",
  "notifications",
  "command_approvals",
  "audit_events",
] as const;

const EXPIRY_INTERVAL = "interval '7 days'";

const backupRequestSchema = z.object({
  id: z.string().min(1).max(64),
  company_id: z.string(),
  requested_by: z.string(),
  status: z.enum(["pending", "processing", "ready", "failed", "expired"]),
  fulfilled_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  artifact_sha256: z.string().nullable(),
  artifact_size_bytes: z.string().nullable(),
  failure_reason: z.string().nullable(),
  created_at: z.string(),
  version: z.number().int().min(1),
});
export type BackupRow = z.infer<typeof backupRequestSchema>;

export interface BackupView {
  readonly id: string;
  readonly status: "pending" | "processing" | "ready" | "failed" | "expired";
  readonly requestedAt: string;
  readonly fulfilledAt: string | null;
  readonly expiresAt: string | null;
  readonly artifactSha256: string | null;
  readonly artifactSizeBytes: number | null;
  readonly failureReason: string | null;
}

function toBackupView(row: Record<string, unknown>): BackupView {
  const parsed = backupRequestSchema.parse(row);
  return {
    id: parsed.id,
    status: parsed.status,
    requestedAt: parsed.created_at,
    fulfilledAt: parsed.fulfilled_at,
    expiresAt: parsed.expires_at,
    artifactSha256: parsed.artifact_sha256,
    artifactSizeBytes:
      parsed.artifact_size_bytes === null ? null : Number(parsed.artifact_size_bytes),
    failureReason: parsed.failure_reason,
  };
}

// ---------------------------------------------------------------------------
// Request lifecycle (tenant).
// ---------------------------------------------------------------------------

/** Requests an encrypted backup (owner, "backups" entitlement). */
export async function requestBackup(context: TenantContext): Promise<BackupView> {
  await requireTenantContext(context);
  await requirePermission(context, "backup.request");
  await requireEntitlement(context, "backups");

  const active = await pgQuery(
    `select id from app.backup_requests
      where company_id = $1 and status in ('pending', 'processing') and deleted_at is null`,
    [context.companyId],
  );
  if (active.rows.length > 0) {
    throw new ConflictError("You already have a backup request in progress.");
  }

  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `insert into app.backup_requests (company_id, requested_by, status)
         values ($1, $2, 'pending')
         returning ${BACKUP_COLUMNS}`,
        [context.companyId, context.userId],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw toDatabaseError(new Error("backup request insert returned no row"));
  }
  await appendAuditEvent(context, {
    actorType: "user",
    action: "backup.requested",
    resourceType: "backup_requests",
    resourceId: row.id as string,
    actorId: context.userId,
    metadata: {},
  });
  return toBackupView(row);
}

/** Lists the workspace's backup requests (owner). */
export async function listBackups(context: TenantContext): Promise<BackupView[]> {
  await requireTenantContext(context);
  await requirePermission(context, "backup.read");
  const result = await pgQuery(
    `select ${BACKUP_COLUMNS}
       from app.backup_requests
      where company_id = $1 and deleted_at is null
      order by created_at desc, id desc`,
    [context.companyId],
  );
  return z
    .array(backupRequestSchema)
    .parse(result.rows)
    .map((row) => toBackupView(row as never));
}

export interface BackupDownload {
  readonly snapshot: unknown;
  readonly artifactSha256: string;
  readonly artifactSizeBytes: number | null;
}

/** Downloads the decrypted export of a ready, unexpired backup (owner). */
export async function downloadBackup(
  context: TenantContext,
  requestId: string,
): Promise<BackupDownload> {
  await requireTenantContext(context);
  await requirePermission(context, "backup.read");
  const result = await pgQuery(
    `select ${BACKUP_COLUMNS}, artifact,
            (expires_at is null or expires_at > clock_timestamp()) as not_expired
       from app.backup_requests
      where id = $1 and company_id = $2 and deleted_at is null`,
    [requestId, context.companyId],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new NotFoundError("This backup was not found.");
  }
  const view = toBackupView(row);
  if (view.status !== "ready") {
    throw new ConflictError("This backup is not ready to download.");
  }
  if (row.not_expired === false) {
    throw new ConflictError("This backup has expired.");
  }
  if (row.artifact === null || !(row.artifact instanceof Buffer)) {
    throw new ConflictError("This backup has no stored artifact.");
  }
  const envelope = deserializeEnvelope(row.artifact);
  const plaintext = decryptData(
    { companyId: context.companyId, resourceId: requestId, category: "backup" },
    envelope,
  );
  await appendAuditEvent(context, {
    actorType: "user",
    action: "backup.downloaded",
    resourceType: "backup_requests",
    resourceId: requestId,
    actorId: context.userId,
    metadata: {},
  });
  return {
    snapshot: JSON.parse(plaintext.toString("utf8")),
    artifactSha256: view.artifactSha256 as string,
    artifactSizeBytes: view.artifactSizeBytes,
  };
}

// ---------------------------------------------------------------------------
// Worker operations (platform).
// ---------------------------------------------------------------------------

/** Fulfils a pending request: snapshot -> encrypt -> store -> ready. */
export async function fulfilBackupRequest(
  context: TenantContext,
  requestId: string,
): Promise<BackupView> {
  await requirePlatformContext(context);

  const loaded = await pgQuery(
    `select id, company_id, status, version from app.backup_requests where id = $1 and deleted_at is null`,
    [requestId],
  );
  const current = loaded.rows[0];
  if (current === undefined) {
    throw new NotFoundError("This backup request was not found.");
  }
  const request = z
    .object({
      id: z.string(),
      company_id: z.string(),
      status: z.enum(["pending", "processing", "ready", "failed", "expired"]),
      version: z.number().int().min(1),
    })
    .parse(current);
  if (request.status !== "pending") {
    throw new ConflictError("This backup request is not pending fulfilment.");
  }

  let snapshotJson: string;
  try {
    snapshotJson = await withPgTransaction(async (client) => {
      const name = (
        await client.query(`select display_name from app.companies where id = $1`, [
          request.company_id,
        ])
      ).rows[0]?.display_name;
      return await buildSnapshot(client, request.company_id, typeof name === "string" ? name : "");
    }, tenantContextSettings(context));
  } catch (error) {
    await markFailed(context, requestId, error);
    throw error;
  }

  let envelope: EncryptionEnvelope;
  try {
    envelope = encryptData(
      {
        companyId: request.company_id,
        resourceId: requestId,
        category: "backup",
        keyVersion: getEncryptionKeyVersion(),
      },
      Buffer.from(snapshotJson, "utf8"),
    );
  } catch (error) {
    await markFailed(context, requestId, error);
    throw error;
  }

  const artifact = serializeEnvelope(envelope);
  const sha256 = sha256Hex(envelope.ciphertext);
  const size = envelope.ciphertext.length;

  const updated = await withPgTransaction(async (client) => {
    const res = await client.query(
      `update app.backup_requests
            set status = 'ready', fulfilled_at = clock_timestamp(),
                expires_at = clock_timestamp() + ${EXPIRY_INTERVAL},
                artifact = $3, artifact_sha256 = $4, artifact_size_bytes = $5
          where id = $1 and version = $2 and status = 'pending'
          returning ${BACKUP_COLUMNS}, artifact`,
      [requestId, request.version, artifact, sha256, size],
    );
    if (res.rows.length === 0) {
      throw new ConflictError("This backup request is no longer pending.");
    }
    return res.rows[0] as Record<string, unknown>;
  }, tenantContextSettings(context));

  await appendAuditEvent(context, {
    actorType: "user",
    action: "backup.fulfilled",
    resourceType: "backup_requests",
    resourceId: requestId,
    actorId: context.userId,
    metadata: { sha256, size },
  });
  return toBackupView(updated);
}

/** Marks ready backups past their expiry as expired and clears the artifact. */
export async function expireBackups(context: TenantContext): Promise<number> {
  await requirePlatformContext(context);
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `update app.backup_requests
            set status = 'expired', artifact = null, failure_reason = null
          where status = 'ready' and expires_at is not null and expires_at <= clock_timestamp()
          returning id`,
      ),
    tenantContextSettings(context),
  );
  const count = result.rows.length;
  if (count > 0) {
    await appendAuditEvent(context, {
      actorType: "user",
      action: "backup.expired",
      resourceType: "backup_requests",
      resourceId: "batch",
      actorId: context.userId,
      metadata: { count },
    });
  }
  return count;
}

async function markFailed(
  context: TenantContext,
  requestId: string,
  error: unknown,
): Promise<void> {
  const reason = error instanceof Error ? error.message.slice(0, 500) : "Unknown fulfilment error.";
  await withPgTransaction(
    async (client) =>
      client.query(
        `update app.backup_requests
            set status = 'failed', failure_reason = $2
          where id = $1 and status in ('pending', 'processing')`,
        [requestId, reason],
      ),
    tenantContextSettings(context),
  ).catch(() => {
    // The original fulfilment error is authoritative; never mask it.
  });
}

// ---------------------------------------------------------------------------
// Snapshot + envelope serialization.
// ---------------------------------------------------------------------------

function jsonSafeReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Buffer) {
    return { __kd: "base64", data: value.toString("base64") };
  }
  if (value instanceof Date) {
    return { __kd: "date", data: value.toISOString() };
  }
  return value;
}

async function buildSnapshot(
  client: { query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[] }> },
  companyId: string,
  displayName: string,
): Promise<string> {
  const snapshot: Record<string, unknown> = {
    manifest: {
      kind: "kd-tenant-backup",
      version: 1,
      generatedAt: new Date().toISOString(),
      companyId,
      displayName,
      tables: ["companies", ...BACKUP_TABLES],
    },
    companies: (await client.query(`select * from app.companies where id = $1`, [companyId])).rows,
  };
  for (const table of BACKUP_TABLES) {
    snapshot[table] = (
      await client.query(`select * from app."${table}" where company_id = $1`, [companyId])
    ).rows;
  }
  return JSON.stringify(snapshot, jsonSafeReplacer);
}
