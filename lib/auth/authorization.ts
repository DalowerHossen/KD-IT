// path: lib/auth/authorization.ts
import "server-only";

import { auditAuthorizationDenial } from "@/lib/auth/audit";
import {
  ApprovalRequiredError,
  AuthorizationError,
  type AuthorizationDenialReason,
} from "@/lib/auth/errors";
import { type PermissionCode } from "@/lib/auth/permissions";
import {
  isPlatformRole,
  isTenantRole,
  roleOutranksOrEquals,
  type AuthRole,
} from "@/lib/auth/roles";
import {
  evaluateSubjectPermissions,
  hasExactStandingGrant,
  hasStandingGrant,
} from "@/lib/db/repositories/permission-grants";
import { assertApprovedCommandFor } from "@/lib/db/repositories/commands";
import { type TenantContext } from "@/lib/db/tenant-context";
import { type CommandKind, type CommandRow } from "@/lib/commands/types";

/**
 * Server-side authorization evaluation. Every check denies with a generic
 * non-enumerating error and records a structured denial audit event before
 * throwing, so failed authorization is always evidence, never silent.
 */
async function deny(
  context: TenantContext,
  reason: AuthorizationDenialReason,
  detail?: { readonly permission?: PermissionCode; readonly commandId?: string },
): Promise<never> {
  await auditAuthorizationDenial(context, {
    reason,
    ...(detail?.permission !== undefined ? { permission: detail.permission } : {}),
    ...(detail?.commandId !== undefined ? { commandId: detail.commandId } : {}),
  });
  throw new AuthorizationError();
}

/**
 * Requires an effective permission: role defaults, explicit grants, and
 * bundle expansion are resolved together through one repository call.
 */
export async function requirePermission(
  context: TenantContext,
  code: PermissionCode,
): Promise<void> {
  const resolved = await evaluateSubjectPermissions(context, context.userId, context.role);
  if (!resolved.includes(code)) {
    await deny(context, "permission_missing", { permission: code });
  }
}

/** Requires at least one of the given permissions. */
export async function requireAnyPermission(
  context: TenantContext,
  codes: readonly PermissionCode[],
): Promise<void> {
  const resolved = await evaluateSubjectPermissions(context, context.userId, context.role);
  const allowed = codes.some((code) => resolved.includes(code));
  if (!allowed) {
    await deny(context, "permission_missing");
  }
}

/** Requires the session role to outrank or equal the given role. */
export async function requireRoleAtLeast(context: TenantContext, role: AuthRole): Promise<void> {
  if (!roleOutranksOrEquals(context.role, role)) {
    await deny(context, "role_mismatch");
  }
}

/** Requires a platform-scope session (platform company plus platform role). */
export async function requirePlatformContext(context: TenantContext): Promise<void> {
  if (!context.isPlatform || !isPlatformRole(context.role)) {
    await deny(context, "scope_mismatch");
  }
}

/** Requires a tenant-scope session (tenant company plus tenant role). */
export async function requireTenantContext(context: TenantContext): Promise<void> {
  if (context.isPlatform || !isTenantRole(context.role)) {
    await deny(context, "scope_mismatch");
  }
}

/**
 * Requires a discrete approved command for a state-changing action. The
 * command must match the expected kind, belong to the active boundary, and
 * be approved or already executed. Any other state denies generically so
 * command existence and approval progress cannot be enumerated.
 */
export async function requireApprovedCommand(
  context: TenantContext,
  commandId: string,
  expectedKind: CommandKind,
): Promise<CommandRow> {
  try {
    return await assertApprovedCommandFor(context, commandId, expectedKind);
  } catch (error) {
    await auditAuthorizationDenial(context, {
      reason: "approval_missing",
      commandId,
    });
    if (error instanceof ApprovalRequiredError) {
      throw error;
    }
    throw new ApprovalRequiredError();
  }
}

/**
 * Requires an approved standing read grant for the subject and scope.
 * Ordinary reads accept wildcard grants through the database helper.
 */
export async function requireStandingGrant(context: TenantContext, scope: string): Promise<void> {
  const granted = await hasStandingGrant(context, context.userId, scope);
  if (!granted) {
    await deny(context, "grant_missing");
  }
}

/**
 * Requires an exact, time-bound standing grant for sensitive reads.
 * Wildcard grants never satisfy this check: the grant scope must equal the
 * requested scope exactly.
 */
export async function requireExactStandingGrant(
  context: TenantContext,
  scope: string,
): Promise<void> {
  const granted = await hasExactStandingGrant(context, context.userId, scope);
  if (!granted) {
    await deny(context, "grant_missing");
  }
}

export type { CommandRow };
