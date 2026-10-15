// path: lib/auth/mfa-policy.ts
import { type AuthRole } from "@/lib/auth/roles";

/**
 * Pure multi-factor assurance policy for Step 03 substep D.
 *
 * The platform enforces TOTP 2FA as a mandatory second factor for every
 * authenticated role except `staff`, whose 2FA is enforced by the tenant
 * (a tenant configuration the owner can toggle). The policy is expressed in
 * terms of Supabase's Authenticator Assurance Level: `aal1` means the
 * identity was verified with a first factor only (password, OAuth, magic
 * link); `aal2` means a second factor (TOTP or a recovery/backup code) was
 * additionally verified.
 *
 * This module is pure and dependency-free so it can be exercised by the
 * offline acceptance suite. All inputs are normalized before crossing into
 * it; it performs no I/O, no clock reads, and no role/tenant lookups.
 */
export type AuthenticatorAssuranceLevel = "aal1" | "aal2";

export const ASSURANCE_LEVELS: readonly AuthenticatorAssuranceLevel[] = ["aal1", "aal2"];

/** The assurance level that ranks at least as high as the required one. */
export function assuranceSatisfies(
  current: AuthenticatorAssuranceLevel | null,
  required: AuthenticatorAssuranceLevel,
): boolean {
  if (current === null) {
    return false;
  }
  return current === required || (current === "aal2" && required === "aal1");
}

export interface RequiredAssuranceInput {
  readonly role: AuthRole;
  /** Whether the tenant owner has enforced 2FA for staff members. */
  readonly tenantEnforces2FA: boolean;
}

/**
 * The assurance level a session must reach for the given role. `staff` is
 * the only role whose requirement depends on the tenant setting; every
 * other role (super_admin, ceo, admin_staff, owner) mandates aal2.
 */
export function requiredAssuranceLevel(input: RequiredAssuranceInput): AuthenticatorAssuranceLevel {
  if (input.role === "staff") {
    return input.tenantEnforces2FA ? "aal2" : "aal1";
  }
  return "aal2";
}

/**
 * The assurance level a user needs when they hold a set of roles: aal2 if
 * ANY role requires it (the session is single, so the strictest role wins),
 * otherwise the staff/tenant rule.
 */
export function requiredAssuranceForRoles(
  roles: readonly RequiredAssuranceInput["role"][],
  tenantEnforces2FA: boolean,
): AuthenticatorAssuranceLevel {
  for (const role of roles) {
    if (requiredAssuranceLevel({ role, tenantEnforces2FA }) === "aal2") {
      return "aal2";
    }
  }
  return "aal1";
}

export const STEP_UP_TTL_MINUTES_DEFAULT = 15;
export const STEP_UP_TTL_MINUTES_MIN = 1;
export const STEP_UP_TTL_MINUTES_MAX = 60;

export function clampStepUpTtlMinutes(value: number): number {
  if (!Number.isFinite(value)) {
    return STEP_UP_TTL_MINUTES_DEFAULT;
  }
  const rounded = Math.round(value);
  if (rounded < STEP_UP_TTL_MINUTES_MIN) {
    return STEP_UP_TTL_MINUTES_MIN;
  }
  if (rounded > STEP_UP_TTL_MINUTES_MAX) {
    return STEP_UP_TTL_MINUTES_MAX;
  }
  return rounded;
}

/** Action identifiers that always require a fresh reauthentication. */
export const CRITICAL_ACTION_IDS = [
  "password.change",
  "sessions.revoke_all",
  "team.ownership.transfer",
  "approval.l2.decide",
  "approval.l3.decide",
  "company.security.update",
  "mfa.unenroll",
  "auth.account.unlock",
] as const;

export type CriticalActionId = (typeof CRITICAL_ACTION_IDS)[number];

export function isCriticalAction(actionId: string): boolean {
  return (CRITICAL_ACTION_IDS as readonly string[]).includes(actionId);
}

export interface StepUpEvaluationInput {
  readonly role: AuthRole;
  /** Whether the pending action is in the critical-action set. */
  readonly isCriticalAction: boolean;
  /** Unix seconds of the last aal2 verification, or null when never reached. */
  readonly lastAal2VerifiedAt: number | null;
  /** Unix seconds of the current time (injected for determinism). */
  readonly now: number;
  readonly ttlMinutes: number;
}

/**
 * Fresh reauthentication ("step-up") is required when a critical action is
 * about to run and the session's last second-factor verification is missing
 * or older than the TTL. `super_admin` is additionally step-up gated because
 * the addendum mandates step-up reauthentication for that role on protected
 * operations; the caller marks such operations as critical.
 */
export function stepUpRequired(input: StepUpEvaluationInput): boolean {
  if (!input.isCriticalAction) {
    return false;
  }
  if (input.lastAal2VerifiedAt === null) {
    return true;
  }
  const ageMinutes = (input.now - input.lastAal2VerifiedAt) / 60;
  return ageMinutes >= input.ttlMinutes;
}

/** An AMR entry as returned by Supabase: either a method name or an object. */
export interface AmrEntryLike {
  readonly method: string;
  readonly timestamp?: number;
}

/**
 * Extracts the last second-factor verification time (Unix seconds) from an
 * AMR list as returned by Supabase's getAuthenticatorAssuranceLevel. Only
 * `mfa/*` methods count; the RFC-8176 string form carries no timestamp and
 * yields null. Returns null when no timestamped second factor is present.
 */
export function lastAal2VerifiedAtFromAmr(
  amr: readonly (string | AmrEntryLike)[] | null | undefined,
): number | null {
  if (amr === null || amr === undefined) {
    return null;
  }
  let latest: number | null = null;
  for (const entry of amr) {
    const method = typeof entry === "string" ? entry : entry.method;
    const timestamp = typeof entry === "string" ? undefined : entry.timestamp;
    if (method.startsWith("mfa/") && typeof timestamp === "number" && Number.isFinite(timestamp)) {
      if (latest === null || timestamp > latest) {
        latest = timestamp;
      }
    }
  }
  return latest;
}
