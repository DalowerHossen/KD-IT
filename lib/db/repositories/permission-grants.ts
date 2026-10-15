// path: lib/db/repositories/permission-grants.ts
import "server-only";

import { z } from "zod";

import { auditPermissionGranted, auditPermissionRevoked } from "@/lib/auth/audit";
import {
  permissionSchema,
  resolveSubjectPermissions,
  type PermissionCode,
} from "@/lib/auth/permissions";
import { type AuthRole } from "@/lib/auth/roles";
import {
  type GrantPermissionInput,
  type PermissionGrantRow,
  type RevokePermissionInput,
  grantPermissionInputSchema,
  permissionGrantRowSchema,
  revokePermissionInputSchema,
} from "@/lib/auth/schemas";
import { type CommandKind, standingGrantScopeSchema } from "@/lib/commands/types";
import { assertApprovedCommandFor } from "@/lib/db/repositories/commands";
import { pgQuery, toDatabaseError, withPgTransaction } from "@/lib/db/pg";
import {
  type TenantContext,
  requireCommandPermission,
  requireSameCompanyBoundary,
  tenantContextSettings,
} from "@/lib/db/tenant-context";
import {
  BadRequestError,
  ConflictError,
  ConfigurationError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/errors/app-errors";

/**
 * Permission-grant repository. Grants are explicit, approval-backed, and
 * time-boxed: creation and revocation both require a discrete approved
 * command of the matching kind, the grantor role must hold the command in
 * the role matrix, and every change is audited with its command evidence.
 */
export const PERMISSION_GRANT_COLUMNS =
  "id, company_id, subject_user_id, permission, granted_by, command_id, reason, valid_from, valid_until, revoked_at, revoked_by, created_at, updated_at, deleted_at, version";

const GRANT_KIND: CommandKind = "auth.permission.grant";
const REVOKE_KIND: CommandKind = "auth.permission.revoke";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  );
}

/** Active grant codes for a subject inside the active company boundary. */
export async function listActiveGrantCodes(
  context: TenantContext,
  subjectUserId: string,
): Promise<readonly PermissionCode[]> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select permission
         from app.permission_grants
         where deleted_at is null
           and revoked_at is null
           and company_id = $1
           and subject_user_id = $2
           and valid_from <= clock_timestamp()
           and (valid_until is null or valid_until > clock_timestamp())
         order by permission`,
        [context.companyId, subjectUserId],
      ),
    tenantContextSettings(context),
  );
  const codes: PermissionCode[] = [];
  for (const row of result.rows) {
    const parsed = permissionSchema.safeParse((row as { permission: unknown }).permission);
    if (!parsed.success) {
      throw new ConfigurationError(
        "The permission store holds a code that is not in the permission registry.",
      );
    }
    codes.push(parsed.data);
  }
  return codes;
}

/**
 * Effective permission set for a subject: role defaults plus active
 * explicit grants plus bundle expansion, resolved deterministically.
 */
export async function evaluateSubjectPermissions(
  context: TenantContext,
  subjectUserId: string,
  role: AuthRole,
): Promise<readonly PermissionCode[]> {
  const explicitGrants = await listActiveGrantCodes(context, subjectUserId);
  return resolveSubjectPermissions({ role, explicitGrants });
}

export async function getGrantById(
  context: TenantContext,
  grantId: string,
): Promise<PermissionGrantRow> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select ${PERMISSION_GRANT_COLUMNS} from app.permission_grants where id = $1 and deleted_at is null`,
        [grantId],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (row === undefined) {
    throw new NotFoundError("Permission grant not found.");
  }
  const parsed = permissionGrantRowSchema.parse(row);
  if (parsed.company_id !== context.companyId) {
    throw new ForbiddenError("This record does not belong to your workspace.");
  }
  return parsed;
}

export interface CompanyGrantQuery {
  readonly limit: number;
  readonly cursor?: string;
}

/** Lists company grants with keyset pagination for management views. */
export async function listCompanyGrants(
  context: TenantContext,
  query: CompanyGrantQuery,
): Promise<PermissionGrantRow[]> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select ${PERMISSION_GRANT_COLUMNS}
         from app.permission_grants
         where deleted_at is null
           and company_id = $1
           and ($2::timestamptz is null or created_at < $2)
         order by created_at desc, id desc
         limit $3`,
        [context.companyId, query.cursor ?? null, query.limit],
      ),
    tenantContextSettings(context),
  );
  return z.array(permissionGrantRowSchema).parse(result.rows);
}

/**
 * Creates a grant after verifying the discrete approval command, the
 * grantor role, and the company boundary. Duplicate active grants are
 * rejected as conflicts instead of double rows.
 */
export async function grantPermission(
  context: TenantContext,
  input: GrantPermissionInput,
): Promise<PermissionGrantRow> {
  const validated = grantPermissionInputSchema.parse(input);
  requireSameCompanyBoundary(context, validated.companyId);
  requireCommandPermission(context, GRANT_KIND);
  await assertApprovedCommandFor(context, validated.commandId, GRANT_KIND);
  if (validated.validUntil !== undefined && Date.parse(validated.validUntil) <= Date.now()) {
    throw new BadRequestError("Grant expiry must be in the future.");
  }
  let row: Record<string, unknown> | undefined;
  try {
    const result = await withPgTransaction(
      async (client) =>
        client.query(
          `insert into app.permission_grants
             (company_id, subject_user_id, permission, granted_by, command_id, reason, valid_until)
           values ($1, $2, $3, $4, $5, $6, $7::timestamptz)
           returning ${PERMISSION_GRANT_COLUMNS}`,
          [
            validated.companyId,
            validated.subjectUserId,
            validated.permission,
            context.userId,
            validated.commandId,
            validated.reason ?? null,
            validated.validUntil ?? null,
          ],
        ),
      tenantContextSettings(context),
    );
    row = result.rows[0] as Record<string, unknown> | undefined;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("This permission is already granted.");
    }
    throw toDatabaseError(error);
  }
  if (row === undefined) {
    throw toDatabaseError(new Error("permission grant insert returned no row"));
  }
  const parsed = permissionGrantRowSchema.parse(row);
  await auditPermissionGranted(context, {
    grantId: parsed.id,
    subjectUserId: parsed.subject_user_id,
    permission: parsed.permission,
    commandId: validated.commandId,
  });
  return parsed;
}

/**
 * Revokes a grant with optimistic locking. Stale versions and already
 * revoked grants fail as conflicts; the row is preserved for history.
 */
export async function revokePermission(
  context: TenantContext,
  input: RevokePermissionInput,
): Promise<PermissionGrantRow> {
  const validated = revokePermissionInputSchema.parse(input);
  const current = await getGrantById(context, validated.grantId);
  requireCommandPermission(context, REVOKE_KIND);
  await assertApprovedCommandFor(context, validated.commandId, REVOKE_KIND);
  if (current.revoked_at !== null) {
    throw new ConflictError("This permission grant was already revoked.");
  }
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `update app.permission_grants
         set revoked_at = clock_timestamp(),
             revoked_by = $1,
             version = version + 1
         where id = $2
           and version = $3
           and revoked_at is null
           and deleted_at is null
         returning ${PERMISSION_GRANT_COLUMNS}`,
        [context.userId, validated.grantId, validated.expectedVersion],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (row === undefined) {
    throw new ConflictError("This grant changed. Reload and retry.");
  }
  const parsed = permissionGrantRowSchema.parse(row);
  await auditPermissionRevoked(context, {
    grantId: parsed.id,
    subjectUserId: parsed.subject_user_id,
    permission: parsed.permission,
    commandId: validated.commandId,
  });
  return parsed;
}

/**
 * Approved standing read grants, evaluated through the Step 02 helper.
 * Wildcard scopes apply here; sensitive reads use the exact variant.
 */
export async function hasStandingGrant(
  context: TenantContext,
  subjectUserId: string,
  scope: string,
): Promise<boolean> {
  const validatedScope = standingGrantScopeSchema.parse(scope);
  const result = await withPgTransaction(
    async (client) =>
      client.query("select app.has_standing_grant($1::uuid, $2) as granted", [
        subjectUserId,
        validatedScope,
      ]),
    tenantContextSettings(context),
  );
  const row = result.rows[0] as { granted: unknown } | undefined;
  return z.boolean().parse(row?.granted ?? false);
}

/**
 * Exact standing-grant check for sensitive reads. The grant scope must
 * equal the requested scope; wildcard grants never satisfy this check.
 */
export async function hasExactStandingGrant(
  context: TenantContext,
  subjectUserId: string,
  scope: string,
): Promise<boolean> {
  const validatedScope = standingGrantScopeSchema.parse(scope);
  const result = await pgQuery(
    `select 1
     from app.standing_grants
     where deleted_at is null
       and company_id = $1
       and subject_id = $2
       and scope = $3
       and valid_from <= clock_timestamp()
       and valid_until > clock_timestamp()
     limit 1`,
    [context.companyId, subjectUserId, validatedScope],
  );
  return result.rows.length > 0;
}
