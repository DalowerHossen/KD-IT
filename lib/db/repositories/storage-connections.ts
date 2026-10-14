// path: lib/db/repositories/storage-connections.ts
import "server-only";

import { z } from "zod";

import { withPgTransaction } from "@/lib/db/pg";
import {
  type TenantContext,
  requireSameCompanyBoundary,
  tenantContextSettings,
} from "@/lib/db/tenant-context";
import { ConflictError, NotFoundError } from "@/lib/errors/app-errors";
import { getEncryptionKeyVersion } from "@/lib/config/env";
import { decryptData, encryptData } from "@/lib/crypto/envelope";
import type { StorageProviderName } from "@/lib/storage/provider-interface";
import { storageProviderSchema } from "@/lib/storage/provider-interface";

/**
 * Storage connection repository. Credential JSON crosses to and from the
 * database only as AES-256-GCM ciphertext envelopes; rows read without
 * credentials for selection and health bookkeeping.
 */

export const CONNECTION_COLUMNS =
  "id, company_id, provider, status, settings, last_health_at, last_health_status, consecutive_failures, health_error, created_at, updated_at, deleted_at, version";

export const storageConnectionRowSchema = z.object({
  id: z.string(),
  company_id: z.string(),
  provider: storageProviderSchema,
  status: z.enum(["disabled", "enabled", "error"]),
  settings: z.record(z.string(), z.unknown()),
  last_health_at: z.string().nullable(),
  last_health_status: z.enum(["healthy", "degraded", "unhealthy"]).nullable(),
  consecutive_failures: z.number().int().min(0),
  health_error: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  version: z.number().int().min(1),
});
export type StorageConnectionRow = z.infer<typeof storageConnectionRowSchema>;

const CREDENTIALS_RESOURCE = "storage-connection-credentials";

export async function listStorageConnections(
  context: TenantContext,
): Promise<StorageConnectionRow[]> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select ${CONNECTION_COLUMNS}
         from app.storage_connections
         where deleted_at is null and company_id = $1
         order by provider`,
        [context.companyId],
      ),
    tenantContextSettings(context),
  );
  return z.array(storageConnectionRowSchema).parse(result.rows);
}

async function getSingleRow(
  context: TenantContext,
  provider: StorageProviderName,
  opts?: { withCredentials: true },
): Promise<Record<string, unknown> | undefined> {
  const columns =
    opts?.withCredentials === true
      ? `${CONNECTION_COLUMNS}, credentials_ciphertext, credentials_nonce, credentials_tag, credentials_key_version`
      : CONNECTION_COLUMNS;
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select ${columns}
         from app.storage_connections
         where deleted_at is null and company_id = $1 and provider = $2
         limit 1`,
        [context.companyId, provider],
      ),
    tenantContextSettings(context),
  );
  return result.rows[0] as Record<string, unknown> | undefined;
}

export async function getStorageConnection(
  context: TenantContext,
  provider: StorageProviderName,
): Promise<StorageConnectionRow | null> {
  const row = await getSingleRow(context, provider);
  return row === undefined ? null : storageConnectionRowSchema.parse(row);
}

/**
 * Registers or replaces a provider connection. Credentials pass through
 * encryptData with AAD bound to the tenant and provider; the plaintext
 * never touches the database.
 */
export async function upsertStorageConnection(
  context: TenantContext,
  input: {
    readonly provider: StorageProviderName;
    readonly credentials: Record<string, unknown> | null;
    readonly settings: Record<string, unknown>;
    readonly enabled: boolean;
    readonly expectedVersion: number | null;
  },
): Promise<StorageConnectionRow> {
  requireSameCompanyBoundary(context, context.companyId);
  const serializedCredentials =
    input.credentials === null ? null : Buffer.from(JSON.stringify(input.credentials), "utf8");
  const envelope =
    serializedCredentials === null
      ? null
      : encryptData(
          {
            companyId: context.companyId,
            resourceId: `${CREDENTIALS_RESOURCE}:${input.provider}`,
            category: "storage-connection-credentials",
            keyVersion: getEncryptionKeyVersion(),
          },
          serializedCredentials,
        );
  const result = await withPgTransaction(async (client) => {
    const existing = await client.query(
      `select version from app.storage_connections
         where deleted_at is null and company_id = $1 and provider = $2
         for update`,
      [context.companyId, input.provider],
    );
    const existingRow = existing.rows[0] as { version: number } | undefined;
    if (existingRow === undefined) {
      return client.query(
        `insert into app.storage_connections (
             company_id, provider, status, settings,
             credentials_ciphertext, credentials_nonce, credentials_tag, credentials_key_version
           )
           values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
           returning ${CONNECTION_COLUMNS}`,
        [
          context.companyId,
          input.provider,
          input.enabled ? "enabled" : "disabled",
          JSON.stringify(input.settings),
          envelope?.ciphertext ?? null,
          envelope?.nonce ?? null,
          envelope?.tag ?? null,
          envelope?.keyVersion ?? null,
        ],
      );
    }
    if (input.expectedVersion === null || input.expectedVersion !== existingRow.version) {
      throw new ConflictError("Storage connection changed by another operator. Reload and retry.");
    }
    return client.query(
      `update app.storage_connections
         set status = $3, settings = $4::jsonb,
             credentials_ciphertext = coalesce($5, credentials_ciphertext),
             credentials_nonce = coalesce($6, credentials_nonce),
             credentials_tag = coalesce($7, credentials_tag),
             credentials_key_version = coalesce($8, credentials_key_version),
             version = version + 1
         where deleted_at is null and company_id = $1 and provider = $2 and version = $9
         returning ${CONNECTION_COLUMNS}`,
      [
        context.companyId,
        input.provider,
        input.enabled ? "enabled" : "disabled",
        JSON.stringify(input.settings),
        envelope?.ciphertext ?? null,
        envelope?.nonce ?? null,
        envelope?.tag ?? null,
        envelope?.keyVersion ?? null,
        input.expectedVersion,
      ],
    );
  }, tenantContextSettings(context));
  const row = result.rows[0];
  if (row === undefined) {
    throw new ConflictError("Storage connection changed by another operator. Reload and retry.");
  }
  return storageConnectionRowSchema.parse(row);
}

/** Decrypts connection credentials for adapter construction, in-memory only. */
export async function loadConnectionCredentials(
  context: TenantContext,
  provider: StorageProviderName,
): Promise<Record<string, unknown>> {
  const row = await getSingleRow(context, provider, { withCredentials: true });
  if (row === undefined) {
    throw new NotFoundError("Storage connection not found.");
  }
  const ciphertext = row["credentials_ciphertext"];
  const nonce = row["credentials_nonce"];
  const tag = row["credentials_tag"];
  const keyVersion = row["credentials_key_version"];
  if (
    !(ciphertext instanceof Buffer) ||
    !(nonce instanceof Buffer) ||
    !(tag instanceof Buffer) ||
    typeof keyVersion !== "number"
  ) {
    throw new NotFoundError("Storage connection has no registered credentials.");
  }
  const plaintext = decryptData(
    {
      companyId: context.companyId,
      resourceId: `${CREDENTIALS_RESOURCE}:${provider}`,
      category: "storage-connection-credentials",
    },
    { ciphertext, nonce, tag, keyVersion },
  );
  try {
    return z.record(z.string(), z.unknown()).parse(JSON.parse(plaintext.toString("utf8")));
  } finally {
    plaintext.fill(0);
  }
}

export async function setStorageConnectionStatus(
  context: TenantContext,
  provider: StorageProviderName,
  status: "enabled" | "disabled" | "error",
  expectedVersion: number,
): Promise<StorageConnectionRow> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `update app.storage_connections
         set status = $3, consecutive_failures = case when $3 = 'enabled' then 0 else consecutive_failures end,
             health_error = case when $3 = 'enabled' then null else health_error end,
             version = version + 1
         where deleted_at is null and company_id = $1 and provider = $2 and version = $4
         returning ${CONNECTION_COLUMNS}`,
        [context.companyId, provider, status, expectedVersion],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new ConflictError("Storage connection changed by another operator. Reload and retry.");
  }
  return storageConnectionRowSchema.parse(row);
}

export async function recordStorageHealth(
  companyId: string,
  provider: StorageProviderName,
  health: "healthy" | "degraded" | "unhealthy",
  errorMessage: string | null,
): Promise<void> {
  await withPgTransaction(async (client) =>
    client.query(
      `update app.storage_connections
       set last_health_at = clock_timestamp(), last_health_status = $3,
           consecutive_failures = case when $3 = 'healthy' then 0 else consecutive_failures + 1 end,
           health_error = $4, version = version + 1
       where deleted_at is null and company_id = $1 and provider = $2`,
      [companyId, provider, health, errorMessage === null ? null : errorMessage.slice(0, 300)],
    ),
  );
}
