// path: lib/auth/flows/login.ts
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  auditAuthLifecycle,
  AUTH_LIFECYCLE_AUDIT_ACTIONS,
  UNKNOWN_AUTH_SUBJECT_ID,
} from "@/lib/auth/audit";
import { authAccountRateLimitKey } from "@/lib/auth/auth-rate-limit";
import { deriveDeviceKeyHash, parseDeviceLabel } from "@/lib/auth/device";
import { getTurnstileConfig } from "@/lib/security/turnstile";
import { enforceAbuseProtection } from "@/lib/security/abuse-guard";
import { type AuthFlowRequest } from "@/lib/auth/flows/context";
import { listMfaFactors } from "@/lib/auth/flows/mfa";
import { getActiveLock, recordAuthFailureForLock, resetLockSequence } from "@/lib/auth/lockout";
import { requiredAssuranceForUser } from "@/lib/auth/mfa-requirement";
import { type LoginInput, loginInputSchema } from "@/lib/auth/schemas";
import { refreshTokenFingerprint, signOutCurrentSession } from "@/lib/auth/server-auth";
import { assertProfileActiveForSession } from "@/lib/auth/session";
import { hashUserAgentSignal } from "@/lib/auth/session-risk";
import { authSubjectHash } from "@/lib/auth/subject-hash";
import { getEncryptionKeyVersion } from "@/lib/config/env";
import { encryptData } from "@/lib/crypto/envelope";
import { recordAuthAttempt } from "@/lib/db/repositories/auth-attempts";
import { upsertDeviceOnLogin } from "@/lib/db/repositories/auth-devices";
import { issueSession } from "@/lib/db/repositories/auth-sessions";
import { publishOutboxEvent } from "@/lib/db/repositories/outbox";
import { getOwnProfile } from "@/lib/db/repositories/profiles";
import { PLATFORM_COMPANY_ID, makeTenantContext } from "@/lib/db/tenant-context";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors/app-errors";

/**
 * Password login and the session-mirror establishment behind it.
 * Credential failures, unknown accounts, and gated accounts all deny with
 * one generic message; only the audit trail distinguishes the reasons.
 * Email-link verification transitions status without mirroring (the
 * one-time exchange session is signed out), and recovery completion
 * destroys sessions instead of mirroring them.
 */
export interface SessionMirrorInput {
  readonly userId: string;
  readonly refreshToken: string;
  readonly expiresAt: string;
  readonly request: AuthFlowRequest;
  /** The first-factor method that produced this session (default password). */
  readonly factor?: "password" | "oauth";
}

export interface SessionMirrorResult {
  readonly sessionId: string;
  readonly deviceId: string;
  readonly isNewDevice: boolean;
}

function ownershipContext(
  userId: string,
  correlationId: string,
): ReturnType<typeof makeTenantContext> {
  return makeTenantContext({
    companyId: PLATFORM_COMPANY_ID,
    userId,
    role: "staff",
    correlationId,
  });
}

/**
 * Binds a provider session to its platform mirror: upserts the device,
 * encrypts the refresh token into the session envelope, issues the mirror
 * row, and records success evidence. The envelope binds company, token
 * fingerprint, and key version as authenticated context.
 */
export async function establishSessionMirror(
  input: SessionMirrorInput,
): Promise<SessionMirrorResult> {
  const deviceKeyHash = deriveDeviceKeyHash({
    userId: input.userId,
    userAgent: input.request.userAgent,
  });
  const label = parseDeviceLabel(input.request.userAgent);
  const { device, isNew } = await upsertDeviceOnLogin({
    userId: input.userId,
    deviceKeyHash,
    displayLabel: label.displayLabel,
    platform: label.platform === "Unknown device" ? null : label.platform,
    ip: input.request.ipAddress,
  });

  const fingerprint = refreshTokenFingerprint(input.refreshToken);
  const envelope = encryptData(
    {
      companyId: PLATFORM_COMPANY_ID,
      resourceId: fingerprint,
      category: "auth-session-token",
      keyVersion: getEncryptionKeyVersion(),
    },
    Buffer.from(input.refreshToken, "utf8"),
  );

  const mirror = await issueSession({
    userId: input.userId,
    deviceId: device.id,
    providerSessionRef: null,
    ip: input.request.ipAddress,
    userAgentHash: hashUserAgentSignal(input.request.userAgent),
    expiresAt: input.expiresAt,
    refreshTokenCiphertext: envelope.ciphertext,
    refreshTokenNonce: envelope.nonce,
    refreshTokenTag: envelope.tag,
    refreshTokenKeyVersion: envelope.keyVersion,
    refreshTokenSha256: fingerprint,
  });

  await recordAuthAttempt({
    subjectHash: authSubjectHash(input.userId),
    userId: input.userId,
    factor: input.factor ?? "password",
    outcome: "success",
    failureReasonCode: null,
    lockedAfter: false,
    ip: input.request.ipAddress,
    userAgentHash: hashUserAgentSignal(input.request.userAgent),
  });

  if (isNew) {
    await auditAuthLifecycle({
      action: AUTH_LIFECYCLE_AUDIT_ACTIONS.deviceRegistered,
      resourceType: "auth_devices",
      resourceId: device.id,
      actorId: input.userId,
      ipAddress: input.request.ipAddress,
      userAgent: input.request.userAgent,
      correlationId: input.request.correlationId,
      metadata: { sessionId: mirror.id, deviceLabel: label.displayLabel },
    });
    await publishOutboxEvent(
      PLATFORM_COMPANY_ID,
      "auth.device.new",
      { userId: input.userId, deviceId: device.id, deviceLabel: label.displayLabel },
      { dedupeKey: `device-new:${device.id}`, correlationId: input.request.correlationId },
    );
  }

  return { sessionId: mirror.id, deviceId: device.id, isNewDevice: isNew };
}

export interface LoginResult extends SessionMirrorResult {
  readonly userId: string;
  /** True when the session must complete a TOTP challenge to reach aal2. */
  readonly mfaRequired: boolean;
  /** True when the user must enroll a second factor before continuing. */
  readonly mustEnroll: boolean;
}

/** Authenticates with email and password and establishes the session. */
export async function loginWithPassword(
  client: SupabaseClient,
  rawInput: LoginInput,
  request: AuthFlowRequest,
): Promise<LoginResult> {
  const input = loginInputSchema.parse(rawInput);
  const subjectHash = authSubjectHash(input.email);

  // Substep G: login abuse protection - endpoint (IP) + account + device rate
  // limits, the Turnstile human check (when enforced), and the network-risk
  // policy. Runs before the credential check and the Substep E lock gate. A
  // pre-auth platform context carries the policy read (the subject is not yet
  // authenticated).
  const guardContext = makeTenantContext({
    companyId: PLATFORM_COMPANY_ID,
    userId: UNKNOWN_AUTH_SUBJECT_ID,
    role: "staff",
    correlationId: request.correlationId,
  });
  await enforceAbuseProtection(guardContext, {
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    action: "auth.login",
    correlationId: request.correlationId,
    turnstileToken: input.turnstileToken,
    ipScopes: ["loginPerIp"],
    deviceScopes: ["loginPerDevice"],
    accountScopes: ["loginPerAccount"],
    accountKey: authAccountRateLimitKey(input.email),
    requireTurnstile: getTurnstileConfig().enforced,
  });

  // Substep E: an active lock blocks authentication entirely and cannot be
  // bypassed by correct credentials. The denial is identical to a credential
  // failure so callers cannot tell a lock from a wrong password.
  const lock = await getActiveLock(subjectHash);
  if (lock.locked) {
    await recordAuthAttempt({
      subjectHash,
      userId: null,
      factor: "password",
      outcome: "failure",
      failureReasonCode: "account-locked",
      lockedAfter: false,
      ip: request.ipAddress,
      userAgentHash: hashUserAgentSignal(request.userAgent),
    });
    await auditAuthLifecycle({
      action: AUTH_LIFECYCLE_AUDIT_ACTIONS.loginFailed,
      resourceType: "auth_attempts",
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      correlationId: request.correlationId,
      metadata: { subjectHash, reason: "account-locked" },
    });
    throw new UnauthorizedError("Email or password is incorrect.");
  }

  const { data, error } = await client.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error !== null || data.user === null || data.session === null) {
    const transition = await recordAuthFailureForLock({
      subjectHash,
      userId: null,
      factor: "password",
      failureReasonCode: "invalid-credentials",
      email: input.email,
      request,
    });
    await recordAuthAttempt({
      subjectHash,
      userId: null,
      factor: "password",
      outcome: "failure",
      failureReasonCode: "invalid-credentials",
      lockedAfter: transition.justLocked,
      ip: request.ipAddress,
      userAgentHash: hashUserAgentSignal(request.userAgent),
    });
    await auditAuthLifecycle({
      action: AUTH_LIFECYCLE_AUDIT_ACTIONS.loginFailed,
      resourceType: "auth_attempts",
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      correlationId: request.correlationId,
      metadata: { subjectHash, reason: "invalid-credentials" },
    });
    throw new UnauthorizedError("Email or password is incorrect.");
  }

  const profile = await getOwnProfile(ownershipContext(data.user.id, request.correlationId));
  if (profile === null || profile.status !== "active") {
    await recordAuthAttempt({
      subjectHash,
      userId: data.user.id,
      factor: "password",
      outcome: "failure",
      failureReasonCode: profile === null ? "profile-missing" : "account-inactive",
      lockedAfter: false,
      ip: request.ipAddress,
      userAgentHash: hashUserAgentSignal(request.userAgent),
    });
    await auditAuthLifecycle({
      action: AUTH_LIFECYCLE_AUDIT_ACTIONS.loginFailed,
      resourceType: "auth_attempts",
      actorId: data.user.id,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      correlationId: request.correlationId,
      metadata: { subjectHash, reason: profile === null ? "profile-missing" : "account-inactive" },
    });
    try {
      await signOutCurrentSession(client);
    } catch {
      // The provider session is unusable without a mirror; cleanup is best-effort.
    }
    if (profile === null) {
      throw new ForbiddenError("This account is not available.");
    }
    assertProfileActiveForSession(profile);
  }

  const mirror = await establishSessionMirror({
    userId: data.user.id,
    refreshToken: data.session.refresh_token,
    expiresAt:
      typeof data.session.expires_at === "number"
        ? new Date(data.session.expires_at * 1000).toISOString()
        : new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    request,
  });

  // Substep E: a verified password resets the failure sequence. It never
  // clears an active lock (the pre-auth gate above already denied one).
  await resetLockSequence(subjectHash);

  // Substep D: determine whether the aal1 session must reach aal2. The
  // provider session and its mirror are already established (so the MFA
  // challenge/verify can rebind the mirror); the session gate enforces the
  // requirement on every subsequent request.
  const required = await requiredAssuranceForUser(data.user.id, request.correlationId);
  let mfaRequired = false;
  let mustEnroll = false;
  if (required === "aal2") {
    const factors = await listMfaFactors(client);
    const hasVerifiedFactor = factors.some(
      (factor) => factor.type !== "recovery_code" && factor.status === "verified",
    );
    mfaRequired = hasVerifiedFactor;
    mustEnroll = !hasVerifiedFactor;
  }

  await auditAuthLifecycle({
    action: AUTH_LIFECYCLE_AUDIT_ACTIONS.loginSucceeded,
    resourceType: "auth_sessions",
    resourceId: mirror.sessionId,
    actorId: data.user.id,
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    correlationId: request.correlationId,
    metadata: {
      subjectHash,
      deviceId: mirror.deviceId,
      isNewDevice: mirror.isNewDevice,
      mfaRequired,
      mustEnroll,
    },
  });

  return { userId: data.user.id, ...mirror, mfaRequired, mustEnroll };
}
