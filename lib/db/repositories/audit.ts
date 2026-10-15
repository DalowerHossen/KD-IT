// path: lib/db/repositories/audit.ts
import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { pgQuery, toDatabaseError, withPgTransaction } from "@/lib/db/pg";
import { type TenantContext, tenantContextSettings } from "@/lib/db/tenant-context";
import { uuidV7Schema } from "@/lib/validation/zod-helpers";

/**
 * Audit repository. The only write path into app.audit_events is the
 * SECURITY DEFINER SQL function app.audit_append, which computes the
 * SHA-256 hash chain inside the same transaction as the audited mutation.
 * This module translates fail-closed, non-enumerating errors for callers.
 */

export const AUDIT_EVENT_COLUMNS =
  "id, company_id, sequence, action, resource_type, resource_id, actor_id, actor_type, correlation_id, ip_address, user_agent_hash, metadata, prev_hash, current_hash, created_at";

export const auditEventRowSchema = z.object({
  id: uuidV7Schema,
  company_id: uuidV7Schema,
  sequence: z.string(),
  action: z.string(),
  resource_type: z.string(),
  resource_id: uuidV7Schema.nullable(),
  actor_id: uuidV7Schema.nullable(),
  actor_type: z.string(),
  correlation_id: uuidV7Schema.nullable(),
  ip_address: z.string().nullable(),
  user_agent_hash: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  prev_hash: z.string().regex(/^[0-9a-f]{64}$/),
  current_hash: z.string().regex(/^[0-9a-f]{64}$/),
  created_at: z.string(),
});
export type AuditEventRow = z.infer<typeof auditEventRowSchema>;

export interface AppendAuditInput {
  readonly actorType: "user" | "service" | "worker" | "client_token" | "system";
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId?: string | null;
  readonly actorId?: string | null;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly metadata?: Record<string, unknown>;
}

function hashUserAgent(userAgent: string | null | undefined): string | null {
  if (userAgent === null || userAgent === undefined || userAgent.trim() === "") {
    return null;
  }
  return createHash("sha256").update(userAgent, "utf8").digest("hex");
}

/**
 * Appends a tamper-evident event inside a transaction carrying the active
 * tenant context. User agents are stored exclusively as SHA-256 hashes so
 * raw client fingerprints never persist.
 */
export async function appendAuditEvent(
  context: TenantContext,
  input: AppendAuditInput,
): Promise<AuditEventRow> {
  return withPgTransaction(async (client) => {
    const appendResult = await client.query(
      "select id from app.audit_append($1, $2, $3, $4, $5, $6, $7, $8::inet, $9, null, $10::jsonb) as id",
      [
        context.companyId,
        input.action,
        input.resourceType,
        input.resourceId ?? null,
        input.actorId ?? context.userId,
        input.actorType,
        context.correlationId,
        input.ipAddress ?? null,
        hashUserAgent(input.userAgent),
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const idRow = appendResult.rows[0] as { id: string } | undefined;
    const readResult = await client.query(
      `select ${AUDIT_EVENT_COLUMNS} from app.audit_events where id = $1`,
      [idRow?.id ?? ""],
    );
    const row = readResult.rows[0];
    if (row === undefined) {
      throw toDatabaseError(new Error("audit_append returned no readable event"));
    }
    return auditEventRowSchema.parse(row);
  }, tenantContextSettings(context));
}

export const auditChainVerificationSchema = z.object({
  sequence: z.string(),
  id: uuidV7Schema,
  valid: z.boolean(),
  expected_hash: z.string().nullable(),
});
export type AuditChainVerification = z.infer<typeof auditChainVerificationSchema>;

/** Verifies a company audit window against its recomputed hash chain. */
export async function verifyAuditChain(companyId: string): Promise<AuditChainVerification[]> {
  const result = await pgQuery(
    "select sequence, id, valid, expected_hash from app.audit_chain_verify($1) order by sequence",
    [companyId],
  );
  return z.array(auditChainVerificationSchema).parse(result.rows);
}

export interface AuditQuery {
  readonly limit: number;
  readonly cursorSequence?: string;
  readonly actionPrefix?: string;
}

/** Lists company events with keyset pagination for export/explore views. */
export async function auditQueryEvents(
  context: TenantContext,
  query: AuditQuery,
): Promise<AuditEventRow[]> {
  const result = await withPgTransaction(async (client) => {
    return client.query(
      `select ${AUDIT_EVENT_COLUMNS}
         from app.audit_events
         where deleted_at is null
           and company_id = $1
           and ($2::bigint is null or sequence > $2::bigint)
           and ($3::text is null or action like $3 || '.%')
         order by sequence
         limit $4`,
      [context.companyId, query.cursorSequence ?? null, query.actionPrefix ?? null, query.limit],
    );
  }, tenantContextSettings(context));
  return z.array(auditEventRowSchema).parse(result.rows);
}
