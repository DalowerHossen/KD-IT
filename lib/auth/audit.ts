// path: lib/auth/audit.ts
import "server-only";

import { type AuthorizationDenialReason } from "@/lib/auth/errors";
import { type PermissionCode } from "@/lib/auth/permissions";
import { type AuthRole } from "@/lib/auth/roles";
import { appendAuditEvent } from "@/lib/db/repositories/audit";
import {
  PLATFORM_COMPANY_ID,
  type TenantContext,
  makeTenantContext,
} from "@/lib/db/tenant-context";
import { createCorrelationId } from "@/lib/logging/correlation";

/**
 * Structured authorization audit vocabulary. Every denial is audited with
 * a machine-readable reason; every grant, revocation, and role assignment
 * records its discrete approval command. Metadata carries identifiers and
 * reason codes only, never secrets or caller-enumerating detail.
 */
export const AUTHZ_AUDIT_ACTIONS = {
  permissionDenied: "authz.permission_denied",
  roleAssigned: "authz.role_assigned",
  membershipInvited: "authz.membership_invited",
  membershipSuspended: "authz.membership_suspended",
  permissionGranted: "authz.permission_granted",
  permissionRevoked: "authz.permission_revoked",
} as const;

export interface AuthorizationDenialAudit {
  readonly reason: AuthorizationDenialReason;
  readonly permission?: PermissionCode;
  readonly route?: string;
  readonly commandId?: string;
}

export async function auditAuthorizationDenial(
  context: TenantContext,
  denial: AuthorizationDenialAudit,
): Promise<void> {
  await appendAuditEvent(context, {
    actorType: "user",
    action: AUTHZ_AUDIT_ACTIONS.permissionDenied,
    resourceType: "authorization",
    metadata: {
      reason: denial.reason,
      ...(denial.permission !== undefined ? { permission: denial.permission } : {}),
      ...(denial.route !== undefined ? { route: denial.route } : {}),
      ...(denial.commandId !== undefined ? { commandId: denial.commandId } : {}),
    },
  });
}

export interface RoleAssignedAudit {
  readonly subjectUserId: string;
  readonly role: AuthRole;
  readonly commandId: string;
}

export async function auditRoleAssigned(
  context: TenantContext,
  audit: RoleAssignedAudit,
): Promise<void> {
  await appendAuditEvent(context, {
    actorType: "user",
    action: AUTHZ_AUDIT_ACTIONS.roleAssigned,
    resourceType: "memberships",
    resourceId: audit.subjectUserId,
    metadata: { role: audit.role, commandId: audit.commandId },
  });
}

export interface MembershipEventAudit {
  readonly subjectUserId: string;
  readonly role: AuthRole;
  readonly commandId: string;
}

/** Records an approved membership invitation (binding created). */
export async function auditMembershipInvited(
  context: TenantContext,
  audit: MembershipEventAudit,
): Promise<void> {
  await appendAuditEvent(context, {
    actorType: "user",
    action: AUTHZ_AUDIT_ACTIONS.membershipInvited,
    resourceType: "memberships",
    resourceId: audit.subjectUserId,
    metadata: { role: audit.role, commandId: audit.commandId },
  });
}

/** Records an approved membership suspension (access removed). */
export async function auditMembershipSuspended(
  context: TenantContext,
  audit: MembershipEventAudit,
): Promise<void> {
  await appendAuditEvent(context, {
    actorType: "user",
    action: AUTHZ_AUDIT_ACTIONS.membershipSuspended,
    resourceType: "memberships",
    resourceId: audit.subjectUserId,
    metadata: { role: audit.role, commandId: audit.commandId },
  });
}

export interface PermissionGrantAudit {
  readonly grantId: string;
  readonly subjectUserId: string;
  readonly permission: PermissionCode;
  readonly commandId: string;
}

export async function auditPermissionGranted(
  context: TenantContext,
  audit: PermissionGrantAudit,
): Promise<void> {
  await appendAuditEvent(context, {
    actorType: "user",
    action: AUTHZ_AUDIT_ACTIONS.permissionGranted,
    resourceType: "permission_grants",
    resourceId: audit.grantId,
    metadata: {
      subjectUserId: audit.subjectUserId,
      permission: audit.permission,
      commandId: audit.commandId,
    },
  });
}

export async function auditPermissionRevoked(
  context: TenantContext,
  audit: PermissionGrantAudit,
): Promise<void> {
  await appendAuditEvent(context, {
    actorType: "user",
    action: AUTHZ_AUDIT_ACTIONS.permissionRevoked,
    resourceType: "permission_grants",
    resourceId: audit.grantId,
    metadata: {
      subjectUserId: audit.subjectUserId,
      permission: audit.permission,
      commandId: audit.commandId,
    },
  });
}

// ---------------------------------------------------------------------------
// Substep B: authentication lifecycle audit vocabulary. Pre-authentication
// events (login failures for unknown subjects, signup attempts) carry the
// nil-UUID unknown-subject marker and identify the subject only through
// the HMAC subject hash in metadata. Metadata never carries passwords,
// tokens, or raw user agents.
// ---------------------------------------------------------------------------

/** Placeholder subject for events without an authenticated actor. */
export const UNKNOWN_AUTH_SUBJECT_ID = "00000000-0000-0000-0000-000000000000";

export const AUTH_LIFECYCLE_AUDIT_ACTIONS = {
  signupCompleted: "auth.signup.completed",
  verificationResent: "auth.verification.resent",
  verificationCompleted: "auth.verification.completed",
  loginSucceeded: "auth.login.succeeded",
  loginFailed: "auth.login.failed",
  sessionRevoked: "auth.session.revoked",
  sessionExpired: "auth.session.expired",
  sessionRisk: "auth.session.risk",
  deviceRegistered: "auth.device.registered",
  recoveryRequested: "auth.recovery.requested",
  recoveryCompleted: "auth.recovery.completed",
  passwordChanged: "auth.password.changed",
  accountActivated: "auth.account.activated",
  mfaEnrolled: "auth.mfa.enrolled",
  mfaUnenrolled: "auth.mfa.unenrolled",
  mfaChallengeIssued: "auth.mfa.challenge_issued",
  mfaVerified: "auth.mfa.verified",
  mfaVerificationFailed: "auth.mfa.verification_failed",
  mfaRecoveryCodesGenerated: "auth.mfa.recovery_codes_generated",
  mfaRecoveryCodeUsed: "auth.mfa.recovery_code_used",
  mfaAssuranceDenied: "auth.mfa.assurance_denied",
  stepUpRequired: "auth.step_up.required",
  oauthSigninInitiated: "auth.oauth.signin_initiated",
  oauthIdentityLinked: "auth.oauth.identity_linked",
  lockBegun: "auth.lock.begun",
  lockUnlocked: "auth.lock.unlocked",
  networkRiskBlocked: "security.network_risk.blocked",
  turnstileRejected: "security.turnstile.rejected",
  emailDelivered: "email.send.delivered",
  emailBounced: "email.send.bounced",
  emailProviderVerified: "email.provider.verified",
} as const;

export type AuthLifecycleAuditAction =
  (typeof AUTH_LIFECYCLE_AUDIT_ACTIONS)[keyof typeof AUTH_LIFECYCLE_AUDIT_ACTIONS];

export interface AuthLifecycleAuditInput {
  readonly action: AuthLifecycleAuditAction;
  readonly resourceType: string;
  readonly resourceId?: string | null;
  readonly actorId?: string | null;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly correlationId?: string;
}

/**
 * Appends an authentication lifecycle event on the platform company. The
 * built context authorizes the audit write only; role-bearing session
 * contexts are owned by Substep C.
 */
export async function auditAuthLifecycle(input: AuthLifecycleAuditInput): Promise<void> {
  const context = makeTenantContext({
    companyId: PLATFORM_COMPANY_ID,
    userId: input.actorId ?? UNKNOWN_AUTH_SUBJECT_ID,
    role: "staff",
    correlationId: input.correlationId ?? createCorrelationId(),
  });
  await appendAuditEvent(context, {
    actorType: "user",
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    actorId: input.actorId ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    metadata: input.metadata ?? {},
  });
}
