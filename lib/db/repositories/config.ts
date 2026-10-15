// path: lib/db/repositories/config.ts
import "server-only";

import { z } from "zod";

import { withPgTransaction } from "@/lib/db/pg";
import {
  PLATFORM_COMPANY_ID,
  type TenantContext,
  requireSameCompanyBoundary,
  tenantContextSettings,
} from "@/lib/db/tenant-context";
import { ConflictError, NotFoundError } from "@/lib/errors/app-errors";

/**
 * Configuration repository: tenant- and platform-scoped configuration
 * entries with optimistic-lock mutations and identical column lists in
 * every read.
 */

export const CONFIGURATION_COLUMNS =
  "id, company_id, config_key, value, scope, description, created_at, updated_at, deleted_at, version";

export const configurationEntryRowSchema = z.object({
  id: z.string(),
  company_id: z.string(),
  config_key: z.string().regex(/^[a-z][a-z0-9_.-]{1,120}$/),
  value: z.record(z.string(), z.unknown()),
  scope: z.enum(["platform", "tenant"]),
  description: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  version: z.number().int().min(1),
});
export type ConfigurationEntryRow = z.infer<typeof configurationEntryRowSchema>;

export async function getConfigurationValue(
  context: TenantContext,
  key: string,
): Promise<unknown | null> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select value
         from app.configuration_entries
         where deleted_at is null
           and config_key = $2
           and (company_id = $1 or company_id = $3)
         order by (company_id = $1) desc
         limit 1`,
        [context.companyId, key, PLATFORM_COMPANY_ID],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0] as { value: unknown } | undefined;
  return row === undefined ? null : row.value;
}

export async function listConfigurationEntries(
  context: TenantContext,
): Promise<ConfigurationEntryRow[]> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select ${CONFIGURATION_COLUMNS}
         from app.configuration_entries
         where deleted_at is null and (company_id = $1 or company_id = $2)
         order by config_key`,
        [context.companyId, PLATFORM_COMPANY_ID],
      ),
    tenantContextSettings(context),
  );
  return z.array(configurationEntryRowSchema).parse(result.rows);
}

/**
 * Creates or updates a configuration entry with optimistic locking. The
 * caller supplies the last observed version; SQL rejects concurrent
 * writers before any value flips, and the change audit fires through the
 * row trigger.
 */
export async function upsertConfigurationEntry(
  context: TenantContext,
  entry: {
    readonly key: string;
    readonly value: Record<string, unknown>;
    readonly scope: "platform" | "tenant";
    readonly expectedVersion: number;
    readonly description?: string;
    readonly targetCompanyId?: string;
  },
): Promise<ConfigurationEntryRow> {
  const companyId = entry.targetCompanyId ?? context.companyId;
  if (entry.scope === "tenant") {
    requireSameCompanyBoundary(context, companyId);
  }
  const result = await withPgTransaction(async (client) => {
    const existing = await client.query(
      `select ${CONFIGURATION_COLUMNS}
         from app.configuration_entries
         where deleted_at is null and company_id = $1 and config_key = $2
         for update`,
      [companyId, entry.key],
    );
    const existingRow = existing.rows[0] as ConfigurationEntryRow | undefined;
    if (existingRow === undefined) {
      const inserted = await client.query(
        `insert into app.configuration_entries (company_id, config_key, value, scope, description)
           values ($1, $2, $3::jsonb, $4, $5)
           returning ${CONFIGURATION_COLUMNS}`,
        [companyId, entry.key, JSON.stringify(entry.value), entry.scope, entry.description ?? null],
      );
      return inserted;
    }
    if (existingRow.version !== entry.expectedVersion) {
      throw new ConflictError("Configuration changed by another operator. Reload and retry.");
    }
    return client.query(
      `update app.configuration_entries
         set value = $3::jsonb, description = $4, version = $5 + 1
         where company_id = $1 and config_key = $2 and deleted_at is null and version = $5
         returning ${CONFIGURATION_COLUMNS}`,
      [
        companyId,
        entry.key,
        JSON.stringify(entry.value),
        entry.description ?? null,
        entry.expectedVersion,
      ],
    );
  }, tenantContextSettings(context));
  const row = result.rows[0];
  if (row === undefined) {
    throw new ConflictError("Configuration changed by another operator. Reload and retry.");
  }
  return configurationEntryRowSchema.parse(row);
}

/** Soft-deletes a configuration entry under optimistic locking. */
export async function deleteConfigurationEntry(
  context: TenantContext,
  key: string,
  expectedVersion: number,
  targetCompanyId?: string,
): Promise<void> {
  const companyId = targetCompanyId ?? context.companyId;
  requireSameCompanyBoundary(context, companyId);
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `update app.configuration_entries
         set deleted_at = clock_timestamp(), version = version + 1
         where company_id = $1 and config_key = $2 and deleted_at is null and version = $3
         returning id`,
        [companyId, key, expectedVersion],
      ),
    tenantContextSettings(context),
  );
  if (result.rows[0] === undefined) {
    const exists = await withPgTransaction(
      async (client) =>
        client.query(
          `select id, version from app.configuration_entries
           where company_id = $1 and config_key = $2 and deleted_at is null`,
          [companyId, key],
        ),
      tenantContextSettings(context),
    );
    if (exists.rows[0] === undefined) {
      throw new NotFoundError("Configuration entry not found.");
    }
    throw new ConflictError("Configuration changed by another operator. Reload and retry.");
  }
}
