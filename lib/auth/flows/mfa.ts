// path: lib/auth/flows/mfa.ts
import "server-only";

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { auditAuthLifecycle, AUTH_LIFECYCLE_AUDIT_ACTIONS } from "@/lib/auth/audit";
import { consumeAuthRateLimit } from "@/lib/auth/auth-rate-limit";
import { getActiveLock, recordAuthFailureForLock, resetLockSequence } from "@/lib/auth/lockout";
import {
  type AmrEntryLike,
  lastAal2VerifiedAtFromAmr,
  type AuthenticatorAssuranceLevel,
} from "@/lib/auth/mfa-policy";
import { type AuthFlowRequest } from "@/lib/auth/flows/context";
import { requiredAssuranceForUser } from "@/lib/auth/mfa-requirement";
import { getCurrentRefreshToken } from "@/lib/auth/server-auth";
import { hashUserAgentSignal } from "@/lib/auth/session-risk";
import { authSubjectHash } from "@/lib/auth/subject-hash";
import {
  type MfaFactorListItem,
  type MfaStatus,
  mfaFactorListItemSchema,
} from "@/lib/auth/schemas";
import { TENANT_ENFORCE_2FA_KEY, readTenantEnforce2FA } from "@/lib/auth/tenant-2fa";
import { getEncryptionKeyVersion } from "@/lib/config/env";
import { encryptData } from "@/lib/crypto/envelope";
import { recordAuthAttempt } from "@/lib/db/repositories/auth-attempts";
import {
  getSessionByFingerprint,
  syncSessionRefreshToken,
} from "@/lib/db/repositories/auth-sessions";
import { PLATFORM_COMPANY_ID } from "@/lib/db/tenant-context";
import { BadRequestError, ExternalServiceError } from "@/lib/errors/app-errors";

export { TENANT_ENFORCE_2FA_KEY, readTenantEnforce2FA };

function isProviderError(value: unknown): value is { readonly message?: string } {
  return typeof value === "object" && value !== null && "message" in value;
}

function providerCode(error: unknown, fallback: string): string {
  return isProviderError(error) && error.message !== undefined ? error.message : fallback;
}

/**
 * Maps a provider MFA error to a single generic message. Distinct provider
 * failures (wrong code, unknown factor, disabled recovery codes) must not be
 * distinguishable to the caller, so they share one outcome; the audit trail
 * records the provider code for operators.
 */
function providerDenial(error: unknown, fallback: string): never {
  throw new BadRequestError(fallback, { cause: providerCode(error, "provider-denied") });
}

function refreshTokenFingerprint(refreshToken: string): string {
  return createHash("sha256").update(refreshToken, "utf8").digest("hex");
}

export interface AssuranceState {
  readonly currentLevel: AuthenticatorAssuranceLevel | null;
  readonly lastAal2VerifiedAt: number | null;
}

/** Reads the session's current assurance level and last second-factor time. */
export async function readAssurance(client: SupabaseClient): Promise<AssuranceState> {
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error !== null || data === null || data === undefined) {
    return { currentLevel: null, lastAal2VerifiedAt: null };
  }
  const currentLevel: AuthenticatorAssuranceLevel | null =
    data.currentLevel === "aal2" ? "aal2" : data.currentLevel === "aal1" ? "aal1" : null;
  const amr = data.currentAuthenticationMethods as
    readonly (string | AmrEntryLike)[] | null | undefined;
  return { currentLevel, lastAal2VerifiedAt: lastAal2VerifiedAtFromAmr(amr) };
}

/** Lists the signed-in user's MFA factors (TOTP and phone). */
export async function listMfaFactors(client: SupabaseClient): Promise<MfaFactorListItem[]> {
  const { data, error } = await client.auth.mfa.listFactors();
  if (error !== null || data === null || data === undefined) {
    throw new ExternalServiceError("Unable to load security factors. Try again.");
  }
  const raw = [...(data.totp ?? []), ...(data.phone ?? [])];
  return raw.map((factor) =>
    mfaFactorListItemSchema.parse({
      id: factor.id,
      type: factor.factor_type,
      friendlyName: factor.friendly_name ?? null,
      status: factor.status,
      createdAt: factor.created_at ?? null,
      lastChallengedAt: factor.last_challenged_at ?? null,
    }),
  );
}

export interface MfaStatusInput {
  readonly client: SupabaseClient;
  readonly userId: string;
  readonly correlationId: string;
}

/**
 * The MFA posture for the signed-in user: the assurance level their roles
 * require (the strictest wins), the session's current level, their factors,
 * whether they must enroll, and the remaining recovery codes. Drives the
 * settings page and the login challenge decision.
 */
export async function getMfaStatus(input: MfaStatusInput): Promise<MfaStatus> {
  const [assurance, factors, required] = await Promise.all([
    readAssurance(input.client),
    listMfaFactors(input.client),
    requiredAssuranceForUser(input.userId, input.correlationId),
  ]);
  const verifiedFactor = factors.some(
    (factor) => factor.type !== "recovery_code" && factor.status === "verified",
  );
  const mustEnroll = required === "aal2" && !verifiedFactor;
  let recoveryCodesRemaining: number | null = null;
  if (factors.some((factor) => factor.type === "recovery_code")) {
    recoveryCodesRemaining = (await getRecoveryCodesStatus(input.client))?.remaining ?? null;
  }
  const currentLevel = assurance.currentLevel ?? "aal1";
  const satisfied = currentLevel === required || (currentLevel === "aal2" && required === "aal1");
  return {
    requiredLevel: required,
    currentLevel,
    satisfied,
    factors,
    mustEnroll,
    recoveryCodesRemaining,
  };
}

export interface EnrollTotpResult {
  readonly factorId: string;
  readonly qrCode: string;
  readonly secret: string;
  readonly uri: string;
}

/** Enrolls a new TOTP factor; the returned secret backs manual entry. */
export async function enrollTotp(
  client: SupabaseClient,
  request: AuthFlowRequest,
  userId: string,
  friendlyName?: string,
): Promise<EnrollTotpResult> {
  const { data, error } = await client.auth.mfa.enroll({
    factorType: "totp",
    ...(friendlyName !== undefined ? { friendlyName } : {}),
  });
  if (error !== null || data === null || data === undefined || data.totp === undefined) {
    providerDenial(error, "Unable to start two-factor setup. Try again.");
  }
  await auditAuthLifecycle({
    action: AUTH_LIFECYCLE_AUDIT_ACTIONS.mfaEnrolled,
    resourceType: "mfa_factors",
    resourceId: data.id,
    actorId: userId,
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    correlationId: request.correlationId,
    metadata: { factorType: "totp" },
  });
  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

export interface ChallengeResult {
  readonly challengeId: string;
}

/** Creates a verification challenge for an enrolled factor. */
export async function challengeFactor(
  client: SupabaseClient,
  request: AuthFlowRequest,
  userId: string,
  factorId: string,
): Promise<ChallengeResult> {
  await consumeAuthRateLimit("mfaChallengePerAccount", userId);
  const { data, error } = await client.auth.mfa.challenge({ factorId });
  if (error !== null || data === null || data === undefined) {
    providerDenial(error, "Unable to start verification. Try again.");
  }
  await auditAuthLifecycle({
    action: AUTH_LIFECYCLE_AUDIT_ACTIONS.mfaChallengeIssued,
    resourceType: "mfa_factors",
    resourceId: factorId,
    actorId: userId,
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    correlationId: request.correlationId,
    metadata: { challengeId: data.id },
  });
  return { challengeId: data.id };
}

/** Encrypts a rotated refresh token for the session mirror envelope. */
async function encryptRefreshToken(refreshToken: string): Promise<{
  ciphertext: Buffer;
  nonce: Buffer;
  tag: Buffer;
  keyVersion: number;
}> {
  const keyVersion = getEncryptionKeyVersion();
  const envelope = encryptData(
    {
      companyId: PLATFORM_COMPANY_ID,
      resourceId: refreshTokenFingerprint(refreshToken),
      category: "auth-session-token",
      keyVersion,
    },
    Buffer.from(refreshToken, "utf8"),
  );
  return {
    ciphertext: envelope.ciphertext,
    nonce: envelope.nonce,
    tag: envelope.tag,
    keyVersion: envelope.keyVersion,
  };
}

interface MirrorBinding {
  readonly mirrorId: string;
}

async function currentMirror(
  client: SupabaseClient,
  userId: string,
): Promise<MirrorBinding | null> {
  const oldRefreshToken = await getCurrentRefreshToken(client);
  if (oldRefreshToken === null) {
    return null;
  }
  const mirror = await getSessionByFingerprint(userId, refreshTokenFingerprint(oldRefreshToken));
  if (mirror === null) {
    return null;
  }
  return { mirrorId: mirror.id };
}

async function rebindMirror(binding: MirrorBinding | null, newRefreshToken: string): Promise<void> {
  if (binding === null) {
    return;
  }
  const token = await encryptRefreshToken(newRefreshToken);
  await syncSessionRefreshToken(binding.mirrorId, {
    refreshTokenCiphertext: token.ciphertext,
    refreshTokenNonce: token.nonce,
    refreshTokenTag: token.tag,
    refreshTokenKeyVersion: token.keyVersion,
    refreshTokenSha256: refreshTokenFingerprint(newRefreshToken),
  });
}

/**
 * Verifies a TOTP (or backup) code for an enrolled factor. On success the
 * provider session is upgraded to aal2 and its refresh token rotated; the
 * session mirror is rebound to the new token so resolveSession keeps
 * matching. Every failure shares one generic outcome.
 */
export async function verifyFactor(
  client: SupabaseClient,
  request: AuthFlowRequest,
  userId: string,
  email: string | null,
  factorId: string,
  challengeId: string,
  code: string,
): Promise<void> {
  await consumeAuthRateLimit("mfaVerifyPerIp", request.ipAddress ?? "unknown");
  await consumeAuthRateLimit("mfaVerifyPerAccount", userId);

  const subjectHash = email === null ? null : authSubjectHash(email);
  const userAgentHash = hashUserAgentSignal(request.userAgent);

  // Substep E: an active lock blocks the second factor too and shares the
  // password failure sequence. The denial matches a code failure so the lock
  // state is never disclosed.
  if (subjectHash !== null) {
    const lock = await getActiveLock(subjectHash);
    if (lock.locked) {
      await recordAuthAttempt({
        subjectHash,
        userId,
        factor: "totp",
        outcome: "failure",
        failureReasonCode: "account-locked",
        lockedAfter: false,
        ip: request.ipAddress,
        userAgentHash,
      });
      await auditAuthLifecycle({
        action: AUTH_LIFECYCLE_AUDIT_ACTIONS.mfaVerificationFailed,
        resourceType: "mfa_factors",
        resourceId: factorId,
        actorId: userId,
        ipAddress: request.ipAddress,
        userAgent: request.userAgent,
        correlationId: request.correlationId,
        metadata: { reason: "account-locked" },
      });
      throw new BadRequestError("That code is not valid. Try again.");
    }
  }

  const binding = await currentMirror(client, userId);

  const { data, error } = await client.auth.mfa.verify({ factorId, challengeId, code });
  if (error !== null || data === null || data === undefined) {
    const transition =
      subjectHash === null
        ? null
        : await recordAuthFailureForLock({
            subjectHash,
            userId,
            factor: "totp",
            failureReasonCode: "invalid-code",
            email,
            request,
          });
    if (subjectHash !== null) {
      await recordAuthAttempt({
        subjectHash,
        userId,
        factor: "totp",
        outcome: "failure",
        failureReasonCode: "invalid-code",
        lockedAfter: transition === null ? false : transition.justLocked,
        ip: request.ipAddress,
        userAgentHash,
      });
    }
    await auditAuthLifecycle({
      action: AUTH_LIFECYCLE_AUDIT_ACTIONS.mfaVerificationFailed,
      resourceType: "mfa_factors",
      resourceId: factorId,
      actorId: userId,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      correlationId: request.correlationId,
      metadata: { reason: providerCode(error, "verification-failed") },
    });
    providerDenial(error, "That code is not valid. Try again.");
  }

  await rebindMirror(binding, data.refresh_token);
  if (subjectHash !== null) {
    await recordAuthAttempt({
      subjectHash,
      userId,
      factor: "totp",
      outcome: "success",
      failureReasonCode: null,
      lockedAfter: false,
      ip: request.ipAddress,
      userAgentHash,
    });
    await resetLockSequence(subjectHash);
  }
  await auditAuthLifecycle({
    action: AUTH_LIFECYCLE_AUDIT_ACTIONS.mfaVerified,
    resourceType: "mfa_factors",
    resourceId: factorId,
    actorId: userId,
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    correlationId: request.correlationId,
    metadata: { factorType: "totp" },
  });
}

/** Verifies a single-use recovery (backup) code and upgrades to aal2. */
export async function verifyRecoveryCode(
  client: SupabaseClient,
  request: AuthFlowRequest,
  userId: string,
  email: string | null,
  code: string,
): Promise<void> {
  await consumeAuthRateLimit("mfaVerifyPerIp", request.ipAddress ?? "unknown");
  await consumeAuthRateLimit("mfaVerifyPerAccount", userId);

  const subjectHash = email === null ? null : authSubjectHash(email);
  const userAgentHash = hashUserAgentSignal(request.userAgent);

  // Substep E: a backup code shares the same failure sequence as password and
  // TOTP; an active lock blocks it with the same generic denial.
  if (subjectHash !== null) {
    const lock = await getActiveLock(subjectHash);
    if (lock.locked) {
      await recordAuthAttempt({
        subjectHash,
        userId,
        factor: "backup_code",
        outcome: "failure",
        failureReasonCode: "account-locked",
        lockedAfter: false,
        ip: request.ipAddress,
        userAgentHash,
      });
      throw new BadRequestError("That backup code is not valid. Try another.");
    }
  }

  const binding = await currentMirror(client, userId);

  const { data, error } = await client.auth.mfa.recoveryCodes.verify({ code });
  if (error !== null || data === null || data === undefined) {
    const transition =
      subjectHash === null
        ? null
        : await recordAuthFailureForLock({
            subjectHash,
            userId,
            factor: "backup_code",
            failureReasonCode: "invalid-backup-code",
            email,
            request,
          });
    if (subjectHash !== null) {
      await recordAuthAttempt({
        subjectHash,
        userId,
        factor: "backup_code",
        outcome: "failure",
        failureReasonCode: "invalid-backup-code",
        lockedAfter: transition === null ? false : transition.justLocked,
        ip: request.ipAddress,
        userAgentHash,
      });
    }
    providerDenial(error, "That backup code is not valid. Try another.");
  }

  await rebindMirror(binding, data.refresh_token);
  if (subjectHash !== null) {
    await recordAuthAttempt({
      subjectHash,
      userId,
      factor: "backup_code",
      outcome: "success",
      failureReasonCode: null,
      lockedAfter: false,
      ip: request.ipAddress,
      userAgentHash,
    });
    await resetLockSequence(subjectHash);
  }
  await auditAuthLifecycle({
    action: AUTH_LIFECYCLE_AUDIT_ACTIONS.mfaRecoveryCodeUsed,
    resourceType: "mfa_recovery_codes",
    actorId: userId,
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    correlationId: request.correlationId,
    metadata: {},
  });
}

/** Generates the user's single set of recovery (backup) codes, shown once. */
export async function generateRecoveryCodes(
  client: SupabaseClient,
  request: AuthFlowRequest,
  userId: string,
  friendlyName?: string,
): Promise<readonly string[]> {
  const { data, error } = await client.auth.mfa.recoveryCodes.generate(
    friendlyName === undefined ? {} : { friendlyName },
  );
  if (error !== null || data === null || data === undefined) {
    providerDenial(error, "Unable to generate backup codes. Try again.");
  }
  await auditAuthLifecycle({
    action: AUTH_LIFECYCLE_AUDIT_ACTIONS.mfaRecoveryCodesGenerated,
    resourceType: "mfa_recovery_codes",
    resourceId: data.id,
    actorId: userId,
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    correlationId: request.correlationId,
    metadata: { total: data.total },
  });
  return data.codes;
}

export interface RecoveryCodesStatus {
  readonly total: number;
  readonly remaining: number;
}

/** The remaining recovery codes for the signed-in user, or null when none. */
export async function getRecoveryCodesStatus(
  client: SupabaseClient,
): Promise<RecoveryCodesStatus | null> {
  const { data, error } = await client.auth.mfa.recoveryCodes.getStatus();
  if (error !== null || data === null || data === undefined) {
    return null;
  }
  return { total: data.total, remaining: data.remaining };
}

/** Unenrolls a factor; requires the session to already be at aal2. */
export async function unenrollFactor(
  client: SupabaseClient,
  request: AuthFlowRequest,
  userId: string,
  factorId: string,
): Promise<void> {
  const { error } = await client.auth.mfa.unenroll({ factorId });
  if (error !== null) {
    providerDenial(error, "Unable to remove that factor. Try again.");
  }
  await auditAuthLifecycle({
    action: AUTH_LIFECYCLE_AUDIT_ACTIONS.mfaUnenrolled,
    resourceType: "mfa_factors",
    resourceId: factorId,
    actorId: userId,
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    correlationId: request.correlationId,
    metadata: {},
  });
}
