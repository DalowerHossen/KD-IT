// path: lib/company/domains.ts
import "server-only";

import { randomBytes } from "node:crypto";

import { z } from "zod";

import {
  domainRequestSchema,
  domainVerifySchema,
  type DomainRequest,
  type DomainVerify,
} from "@/lib/auth/schemas";
import {
  requirePermission,
  requirePlatformContext,
  requireTenantContext,
} from "@/lib/auth/authorization";
import { appendAuditEvent } from "@/lib/db/repositories/audit";
import { pgQuery, toDatabaseError, withPgTransaction } from "@/lib/db/pg";
import type { TenantContext } from "@/lib/db/tenant-context";
import { tenantContextSettings } from "@/lib/db/tenant-context";
import { ConflictError, NotFoundError } from "@/lib/errors/app-errors";

/**
 * Substep M - tenant custom domains. A workspace requests a custom domain;
 * the row starts pending with an opaque verification token the owner publishes
 * as a DNS TXT record (_kd-verify.<domain> = <token>). A platform operator
 * verifies ownership by submitting the observed record value, which must match
 * the token; a match activates the domain, a mismatch rejects it. Request and
 * read are tenant-scoped (owner); verification is platform-scoped and may
 * target any workspace's domain by id.
 */

const DOMAIN_COLUMNS =
  "id, company_id, domain, status, verification_token, verified_at, failure_reason, version";

const domainRowSchema = z.object({
  id: z.string().min(1).max(64),
  company_id: z.string(),
  domain: z.string(),
  status: z.enum(["pending", "verified", "rejected"]),
  verification_token: z.string(),
  verified_at: z.string().nullable(),
  failure_reason: z.string().nullable(),
  version: z.number().int().min(1),
});
export type DomainRow = z.infer<typeof domainRowSchema>;

export interface DomainView {
  readonly id: string;
  readonly domain: string;
  readonly status: "pending" | "verified" | "rejected";
  readonly verificationToken: string;
  readonly recordName: string;
  readonly recordType: "TXT";
  readonly recordValue: string;
  readonly verifiedAt: string | null;
  readonly failureReason: string | null;
  readonly version: number;
}

export interface PendingDomainView {
  readonly id: string;
  readonly domain: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly verificationToken: string;
  readonly requestedAt: string;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  );
}

function toDomainView(row: Record<string, unknown>): DomainView {
  const parsed = domainRowSchema.parse(row);
  return {
    id: parsed.id,
    domain: parsed.domain,
    status: parsed.status,
    verificationToken: parsed.verification_token,
    recordName: `_kd-verify.${parsed.domain}`,
    recordType: "TXT",
    recordValue: parsed.verification_token,
    verifiedAt: parsed.verified_at,
    failureReason: parsed.failure_reason,
    version: parsed.version,
  };
}

/** Requests a custom domain for the workspace (owner). Starts pending. */
export async function requestDomain(
  context: TenantContext,
  input: DomainRequest,
): Promise<DomainView> {
  await requireTenantContext(context);
  await requirePermission(context, "domain.request");
  const v = domainRequestSchema.parse(input);
  const token = randomBytes(16).toString("hex");
  let row: Record<string, unknown>;
  try {
    const result = await withPgTransaction(
      async (client) =>
        client.query(
          `insert into app.custom_domains (company_id, domain, status, verification_token)
           values ($1, $2, 'pending', $3)
           returning ${DOMAIN_COLUMNS}`,
          [context.companyId, v.domain, token],
        ),
      tenantContextSettings(context),
    );
    row = result.rows[0];
    if (row === undefined) {
      throw toDatabaseError(new Error("domain insert returned no row"));
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("This domain is already claimed.");
    }
    throw error;
  }
  await appendAuditEvent(context, {
    actorType: "user",
    action: "domain.requested",
    resourceType: "custom_domains",
    resourceId: row.id as string,
    actorId: context.userId,
    metadata: { domain: v.domain },
  });
  return toDomainView(row);
}

/** Lists the workspace's custom domains (owner). */
export async function listDomains(context: TenantContext): Promise<DomainView[]> {
  await requireTenantContext(context);
  await requirePermission(context, "domain.read");
  const result = await pgQuery(
    `select ${DOMAIN_COLUMNS}
       from app.custom_domains
      where company_id = $1 and deleted_at is null
      order by created_at desc, id desc`,
    [context.companyId],
  );
  return z
    .array(domainRowSchema)
    .parse(result.rows)
    .map((row) => toDomainView(row as never));
}

/** Lists pending domains across all workspaces for platform verification. */
export async function listPendingDomains(context: TenantContext): Promise<PendingDomainView[]> {
  await requirePlatformContext(context);
  await requirePermission(context, "domain.verify");
  const result = await pgQuery(
    `select d.id, d.domain, d.company_id, d.verification_token, d.created_at,
            c.display_name as company_name
       from app.custom_domains d
       join app.companies c on c.id = d.company_id and c.deleted_at is null
      where d.status = 'pending' and d.deleted_at is null
      order by d.created_at desc, d.id desc`,
  );
  return z
    .array(
      z.object({
        id: z.string(),
        domain: z.string(),
        company_id: z.string(),
        verification_token: z.string(),
        created_at: z.string(),
        company_name: z.string(),
      }),
    )
    .parse(result.rows)
    .map((row) => ({
      id: row.id,
      domain: row.domain,
      companyId: row.company_id,
      companyName: row.company_name,
      verificationToken: row.verification_token,
      requestedAt: row.created_at,
    }));
}

/** Verifies (or rejects) a pending domain by token match (platform). */
export async function verifyDomain(
  context: TenantContext,
  input: DomainVerify,
): Promise<DomainView> {
  await requirePlatformContext(context);
  await requirePermission(context, "domain.verify");
  const v = domainVerifySchema.parse(input);
  const observed = v.observedToken.trim().toLowerCase();

  const row = await withPgTransaction(async (client) => {
    const existing = await client.query(
      `select ${DOMAIN_COLUMNS} from app.custom_domains where id = $1 and deleted_at is null`,
      [v.domainId],
    );
    if (existing.rows.length === 0) {
      throw new NotFoundError("This domain request was not found.");
    }
    const current = domainRowSchema.parse(existing.rows[0]);
    if (current.status !== "pending") {
      throw new ConflictError("This domain request has already been decided.");
    }
    const matched = observed === current.verification_token;
    const res = await client.query(
      `update app.custom_domains
          set status = $3, verified_at = $4, failure_reason = $5
        where id = $1 and version = $2 and status = 'pending'
        returning ${DOMAIN_COLUMNS}`,
      [
        v.domainId,
        current.version,
        matched ? "verified" : "rejected",
        matched ? new Date().toISOString() : null,
        matched ? null : "The verification token did not match the published record.",
      ],
    );
    if (res.rows.length === 0) {
      throw new ConflictError("This domain request has already been decided.");
    }
    return res.rows[0] as Record<string, unknown>;
  }, tenantContextSettings(context));

  const view = toDomainView(row);
  await appendAuditEvent(context, {
    actorType: "user",
    action: view.status === "verified" ? "domain.verified" : "domain.rejected",
    resourceType: "custom_domains",
    resourceId: view.id,
    actorId: context.userId,
    metadata: { domain: view.domain },
  });
  return view;
}
