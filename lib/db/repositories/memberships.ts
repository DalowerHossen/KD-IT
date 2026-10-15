// path: lib/db/repositories/memberships.ts
import "server-only";

import { z } from "zod";

import {
  auditMembershipInvited,
  auditMembershipSuspended,
  auditRoleAssigned,
} from "@/lib/auth/audit";
import {
  type InviteMembershipInput,
  inviteMembershipInputSchema,
  type MembershipListItem,
  membershipListItemSchema,
  membershipRowSchema,
  type MembershipRow,
  profileStatusSchema,
  type ProfileStatus,
  type SuspendMembershipInput,
  suspendMembershipInputSchema,
  type UpdateMembershipRoleInput,
  updateMembershipRoleInputSchema,
} from "@/lib/auth/schemas";
import { resolveEffectiveRole } from "@/lib/auth/role-resolution";
import { isPlatformRole, isTenantRole, type AuthRole } from "@/lib/auth/roles";
import type { CommandKind } from "@/lib/commands/types";
import { assertApprovedCommandFor } from "@/lib/db/repositories/commands";
import { getCompanyLifecycleStatus } from "@/lib/db/repositories/companies";
import { assertMemberCapacity } from "@/lib/company/entitlements";
import { notifyInvitee } from "@/lib/notifications/service";
import { toDatabaseError, withPgTransaction } from "@/lib/db/pg";
import {
  PLATFORM_COMPANY_ID,
  type TenantContext,
  requireCommandPermission,
  requireSameCompanyBoundary,
  tenantContextSettings,
} from "@/lib/db/tenant-context";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors/app-errors";

/**
 * Substep C: membership and role management. Memberships bind a user to a
 * company with a role. Reads are company-boundary scoped; the team listing
 * joins the global profile for display names. Every mutation requires a
 * discrete approved command of the matching kind, the executor's role in the
 * command matrix, optimistic-lock agreement, and a role/company scope
 * consistency check, and is audited with its command evidence.
 *
 * Role resolution (see resolveEffectiveRoleFor) is approval-aware by
 * construction: only an active membership inside an active company for an
 * active profile confers a role.
 */
export const MEMBERSHIP_COLUMNS =
  "id, company_id, user_id, role, status, invited_by, invited_at, activated_at, created_at, updated_at, deleted_at, version";

const INVITE_KIND: CommandKind = "admin.membership.invite";
const UPDATE_ROLE_KIND: CommandKind = "admin.membership.update_role";
const SUSPEND_KIND: CommandKind = "admin.membership.suspend";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  );
}

/**
 * A platform role may only bind the platform company; a tenant role may only
 * bind a tenant company. Violations are rejected so a role can never be
 * granted outside its intended scope.
 */
function assertRoleScopeConsistent(companyId: string, role: AuthRole): void {
  const isPlatformCompany = companyId === PLATFORM_COMPANY_ID;
  if (isPlatformRole(role) && !isPlatformCompany) {
    throw new ForbiddenError("This role cannot be assigned in this workspace.");
  }
  if (isTenantRole(role) && isPlatformCompany) {
    throw new ForbiddenError("This role cannot be assigned in this workspace.");
  }
}

/**
 * A subject's active memberships across all companies, most recently
 * activated first. Used only to bootstrap a session's working context before
 * the company is known; it is not a general cross-tenant read.
 */
export async function listActiveMemberships(
  context: TenantContext,
  userId: string,
): Promise<readonly MembershipRow[]> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select ${MEMBERSHIP_COLUMNS}
         from app.memberships
         where user_id = $1
           and status = 'active'
           and deleted_at is null
         order by activated_at desc nulls last, created_at desc`,
        [userId],
      ),
    tenantContextSettings(context),
  );
  return z.array(membershipRowSchema).parse(result.rows);
}

/** A single membership inside the active company boundary. */
export async function getMembership(
  context: TenantContext,
  membershipId: string,
): Promise<MembershipRow> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select ${MEMBERSHIP_COLUMNS}
         from app.memberships
         where id = $1 and company_id = $2 and deleted_at is null`,
        [membershipId, context.companyId],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (row === undefined) {
    throw new NotFoundError("This team member was not found.");
  }
  const parsed = membershipRowSchema.parse(row);
  if (parsed.company_id !== context.companyId) {
    throw new ForbiddenError("This record does not belong to your workspace.");
  }
  return parsed;
}

/** The team of the active company, joined with each member's display name. */
export async function listCompanyMembers(
  context: TenantContext,
): Promise<readonly MembershipListItem[]> {
  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `select m.id, m.user_id, m.role, m.status, m.activated_at, m.version, p.display_name
         from app.memberships m
         left join app.profiles p
           on p.user_id = m.user_id and p.deleted_at is null
         where m.company_id = $1 and m.deleted_at is null
         order by m.created_at, m.id`,
        [context.companyId],
      ),
    tenantContextSettings(context),
  );
  const items: MembershipListItem[] = [];
  for (const row of result.rows as Record<string, unknown>[]) {
    items.push(
      membershipListItemSchema.parse({
        id: row.id,
        userId: row.user_id,
        displayName: row.display_name === null ? null : String(row.display_name),
        role: row.role,
        status: row.status,
        activatedAt: row.activated_at === null ? null : String(row.activated_at),
        version: Number(row.version),
      }),
    );
  }
  return items;
}

/**
 * Approval-aware effective role for a subject in the active company: the
 * role only when the membership, the company, and the profile are all
 * active. Returns null otherwise (no role, no enumeration).
 */
export async function resolveEffectiveRoleFor(
  context: TenantContext,
  userId: string,
): Promise<AuthRole | null> {
  const result = await withPgTransaction(async (client) => {
    const membershipResult = await client.query(
      `select m.role, m.status
         from app.memberships m
         where m.company_id = $1 and m.user_id = $2 and m.deleted_at is null
         limit 1`,
      [context.companyId, userId],
    );
    const profileResult = await client.query(
      `select status from app.profiles
         where user_id = $1 and deleted_at is null
         limit 1`,
      [userId],
    );
    return { membershipResult, profileResult };
  }, tenantContextSettings(context));

  let membership: { role: AuthRole; status: MembershipRow["status"] } | null = null;
  const membershipRow = result.membershipResult.rows[0] as
    { role: unknown; status: unknown } | undefined;
  if (membershipRow !== undefined) {
    const parsed = z
      .object({
        role: membershipRowSchema.shape.role,
        status: membershipRowSchema.shape.status,
      })
      .safeParse(membershipRow);
    if (parsed.success) {
      membership = { role: parsed.data.role, status: parsed.data.status };
    }
  }

  let profileStatus: ProfileStatus | null = null;
  const profileRow = result.profileResult.rows[0] as { status: unknown } | undefined;
  if (profileRow !== undefined) {
    const parsed = profileStatusSchema.safeParse(profileRow.status);
    if (parsed.success) {
      profileStatus = parsed.data;
    }
  }

  const companyStatus = await getCompanyLifecycleStatus(context, context.companyId);

  return resolveEffectiveRole({
    membership,
    companyStatus,
    profileStatus,
  });
}

/**
 * Creates an invited binding. The intended role is stored but confers no
 * access until the membership is activated (by an approved role assignment).
 * Duplicate live bindings for the same company+user are conflicts.
 */
export async function inviteMembership(
  context: TenantContext,
  input: InviteMembershipInput,
): Promise<MembershipRow> {
  const validated = inviteMembershipInputSchema.parse(input);
  requireSameCompanyBoundary(context, validated.companyId);
  assertRoleScopeConsistent(validated.companyId, validated.role);
  requireCommandPermission(context, INVITE_KIND);
  await assertApprovedCommandFor(context, validated.commandId, INVITE_KIND);
  // Substep I: server-side entitlement guard - the workspace must hold the
  // "team" entitlement and be below its plan's member cap before it can grow.
  await assertMemberCapacity(validated.companyId);

  let row: Record<string, unknown> | undefined;
  try {
    const result = await withPgTransaction(
      async (client) =>
        client.query(
          `insert into app.memberships (company_id, user_id, role, status, invited_by, invited_at)
           values ($1, $2, $3, 'invited', $4, clock_timestamp())
           returning ${MEMBERSHIP_COLUMNS}`,
          [validated.companyId, validated.userId, validated.role, context.userId],
        ),
      tenantContextSettings(context),
    );
    row = result.rows[0] as Record<string, unknown> | undefined;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("This person is already a member of this workspace.");
    }
    throw toDatabaseError(error);
  }
  if (row === undefined) {
    throw toDatabaseError(new Error("membership insert returned no row"));
  }
  const parsed = membershipRowSchema.parse(row);
  await auditMembershipInvited(context, {
    subjectUserId: parsed.user_id,
    role: parsed.role,
    commandId: validated.commandId,
  });
  // Substep J: the invitee is notified in-app (best-effort; the invite has
  // already committed, so a notification failure never blocks it).
  await notifyInvitee(context, {
    userId: parsed.user_id,
    role: parsed.role,
    membershipId: parsed.id,
  });
  return parsed;
}

/**
 * Assigns the role, activating an invited binding on first assignment and
 * changing the role on an active one. Suspended and revoked bindings cannot
 * be re-activated here (they must be re-invited). Optimistic-lock protected.
 */
export async function updateMembershipRole(
  context: TenantContext,
  input: UpdateMembershipRoleInput,
): Promise<MembershipRow> {
  const validated = updateMembershipRoleInputSchema.parse(input);
  requireSameCompanyBoundary(context, validated.companyId);
  assertRoleScopeConsistent(validated.companyId, validated.role);
  requireCommandPermission(context, UPDATE_ROLE_KIND);
  await assertApprovedCommandFor(context, validated.commandId, UPDATE_ROLE_KIND);

  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `update app.memberships
         set role = $1,
             status = case when status = 'invited' then 'active' else status end,
             activated_at = case when status = 'invited' then clock_timestamp() else activated_at end,
             version = version + 1
         where id = $2
           and company_id = $3
           and version = $4
           and deleted_at is null
           and status in ('invited', 'active')
         returning ${MEMBERSHIP_COLUMNS}`,
        [validated.role, validated.membershipId, validated.companyId, validated.expectedVersion],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (row === undefined) {
    throw new ConflictError("This membership changed or can no longer be updated.");
  }
  const parsed = membershipRowSchema.parse(row);
  await auditRoleAssigned(context, {
    subjectUserId: parsed.user_id,
    role: parsed.role,
    commandId: validated.commandId,
  });
  return parsed;
}

/**
 * Suspends an active binding, immediately removing its role. Only active
 * bindings can be suspended; the row is preserved for history and may be
 * re-invited later. Optimistic-lock protected.
 */
export async function suspendMembership(
  context: TenantContext,
  input: SuspendMembershipInput,
): Promise<MembershipRow> {
  const validated = suspendMembershipInputSchema.parse(input);
  requireSameCompanyBoundary(context, validated.companyId);
  requireCommandPermission(context, SUSPEND_KIND);
  await assertApprovedCommandFor(context, validated.commandId, SUSPEND_KIND);

  const result = await withPgTransaction(
    async (client) =>
      client.query(
        `update app.memberships
         set status = 'suspended',
             version = version + 1
         where id = $1
           and company_id = $2
           and version = $3
           and deleted_at is null
           and status = 'active'
         returning ${MEMBERSHIP_COLUMNS}`,
        [validated.membershipId, validated.companyId, validated.expectedVersion],
      ),
    tenantContextSettings(context),
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (row === undefined) {
    throw new ConflictError("This membership changed or can no longer be suspended.");
  }
  const parsed = membershipRowSchema.parse(row);
  await auditMembershipSuspended(context, {
    subjectUserId: parsed.user_id,
    role: parsed.role,
    commandId: validated.commandId,
  });
  return parsed;
}
