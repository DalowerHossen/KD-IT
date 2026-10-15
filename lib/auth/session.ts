// path: lib/auth/session.ts
import "server-only";

import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requestCorrelationId } from "@/lib/api/request-guard";
import { readAssurance } from "@/lib/auth/flows/mfa";
import { requiredAssuranceForUser } from "@/lib/auth/mfa-requirement";
import { type ProfileRow } from "@/lib/auth/schemas";
import {
  createRouteHandlerClient,
  getCurrentRefreshToken,
  refreshTokenFingerprint,
  requireAuthUser,
  signOutCurrentSession,
} from "@/lib/auth/server-auth";
import { assessSessionRisk } from "@/lib/auth/session-risk";
import { auditAuthLifecycle, AUTH_LIFECYCLE_AUDIT_ACTIONS } from "@/lib/auth/audit";
import { getConfigurationValue } from "@/lib/db/repositories/config";
import {
  getSessionByFingerprint,
  revokeSessionById,
  touchSessionActivity,
} from "@/lib/db/repositories/auth-sessions";
import { publishOutboxEvent } from "@/lib/db/repositories/outbox";
import { getOwnProfile } from "@/lib/db/repositories/profiles";
import { PLATFORM_COMPANY_ID, makeTenantContext } from "@/lib/db/tenant-context";
import { ForbiddenError, MfaRequiredError, UnauthorizedError } from "@/lib/errors/app-errors";
import { rootLogger } from "@/lib/logging/logger";

/**
 * Authenticated session resolution for every protected route. The pipeline
 * is: provider user, profile status gate, mirror binding by token
 * fingerprint, inactivity and absolute timeouts, suspicious-session
 * signals, and a throttled activity touch. Timeouts and unknown sessions
 * revoke the mirror row, clear the cookie session, and deny with one
 * generic expiry message.
 *
 * Ownership contexts built here carry the least-privilege staff role and
 * authorize ownership-scoped reads only. Role-bearing session contexts are
 * owned by Substep C, which resolves membership roles on top of the
 * session this module returns.
 */
export interface AuthSessionContext {
  readonly userId: string;
  readonly email: string | null;
  readonly sessionId: string;
  readonly deviceId: string | null;
  readonly profile: ProfileRow;
}

export const SESSION_TIMEOUT_DEFAULTS = {
  inactivityMinutes: 30,
  absoluteMinutes: 720,
} as const;

export const SESSION_TIMEOUT_CONFIG_KEYS = {
  inactivityMinutes: "auth.session_inactivity_timeout_minutes",
  absoluteMinutes: "auth.session_absolute_timeout_minutes",
} as const;

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

async function readTimeoutMinutes(
  userId: string,
  correlationId: string,
  key: string,
  fallback: number,
): Promise<number> {
  try {
    const value = await getConfigurationValue(ownershipContext(userId, correlationId), key);
    if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
      return value;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Profile status gate shared by session resolution and login. Every
 * non-active status shares one generic denial so lifecycle states can
 * never be enumerated.
 */
export function assertProfileActiveForSession(profile: ProfileRow): void {
  if (profile.status !== "active") {
    throw new ForbiddenError("This account is not available.");
  }
}

async function denyExpiredSession(
  client: SupabaseClient,
  sessionId: string | null,
  userId: string,
  correlationId: string,
  reason: string,
): Promise<never> {
  if (sessionId !== null) {
    try {
      await revokeSessionById(userId, sessionId, reason);
    } catch {
      // The row may already be revoked; expiry denial proceeds regardless.
    }
  }
  try {
    await signOutCurrentSession(client);
  } catch {
    // Cookie clearing is best-effort once the mirror is revoked.
  }
  await auditAuthLifecycle({
    action: AUTH_LIFECYCLE_AUDIT_ACTIONS.sessionExpired,
    resourceType: "auth_sessions",
    resourceId: sessionId,
    actorId: userId,
    correlationId,
    metadata: { reason },
  });
  throw new UnauthorizedError("Your session expired. Sign in again.");
}

export interface ResolveSessionInput {
  readonly client: SupabaseClient;
  readonly headers: Headers;
  readonly correlationId: string;
  readonly ipAddress: string | null;
}

/** Resolves the authenticated session for a protected route. */
export async function resolveSession(input: ResolveSessionInput): Promise<AuthSessionContext> {
  const user = await requireAuthUser(input.client);
  const profile = await getOwnProfile(ownershipContext(user.id, input.correlationId));
  if (profile === null) {
    throw new ForbiddenError("This account is not available.");
  }
  assertProfileActiveForSession(profile);

  const refreshToken =
    (await getCurrentRefreshToken(input.client)) ??
    (await denyExpiredSession(
      input.client,
      null,
      user.id,
      input.correlationId,
      "token-unreadable",
    ));
  const fingerprint = refreshTokenFingerprint(refreshToken);
  const mirror =
    (await getSessionByFingerprint(user.id, fingerprint)) ??
    (await denyExpiredSession(input.client, null, user.id, input.correlationId, "session-unknown"));

  const [inactivityMinutes, absoluteMinutes] = await Promise.all([
    readTimeoutMinutes(
      user.id,
      input.correlationId,
      SESSION_TIMEOUT_CONFIG_KEYS.inactivityMinutes,
      SESSION_TIMEOUT_DEFAULTS.inactivityMinutes,
    ),
    readTimeoutMinutes(
      user.id,
      input.correlationId,
      SESSION_TIMEOUT_CONFIG_KEYS.absoluteMinutes,
      SESSION_TIMEOUT_DEFAULTS.absoluteMinutes,
    ),
  ]);
  const now = Date.now();
  if (now - Date.parse(mirror.last_activity_at) > inactivityMinutes * 60_000) {
    await denyExpiredSession(
      input.client,
      mirror.id,
      user.id,
      input.correlationId,
      "inactivity-timeout",
    );
  }
  if (now - Date.parse(mirror.created_at) > absoluteMinutes * 60_000) {
    await denyExpiredSession(
      input.client,
      mirror.id,
      user.id,
      input.correlationId,
      "absolute-timeout",
    );
  }

  const userAgent = input.headers.get("user-agent");
  const signals = assessSessionRisk({
    storedIp: mirror.ip_address,
    currentIp: input.ipAddress,
    storedUserAgentHash: mirror.user_agent_hash,
    currentUserAgent: userAgent,
  });
  if (signals.length > 0) {
    await auditAuthLifecycle({
      action: AUTH_LIFECYCLE_AUDIT_ACTIONS.sessionRisk,
      resourceType: "auth_sessions",
      resourceId: mirror.id,
      actorId: user.id,
      ipAddress: input.ipAddress,
      userAgent,
      correlationId: input.correlationId,
      metadata: { signals: [...signals] },
    });
    const hourBucket = new Date().toISOString().slice(0, 13);
    await publishOutboxEvent(
      PLATFORM_COMPANY_ID,
      "auth.session.risk",
      { sessionId: mirror.id, userId: user.id, signals: [...signals] },
      { dedupeKey: `session-risk:${mirror.id}:${hourBucket}`, correlationId: input.correlationId },
    );
    rootLogger.withCorrelation(input.correlationId).warn("auth.session.risk", {
      sessionId: mirror.id,
      signals: [...signals],
    });
  }

  // Substep D assurance gate: a session that must reach aal2 (any non-staff
  // role, or a staff role under tenant enforcement) is denied while it
  // remains at aal1, so a password alone never suffices. aal2 sessions and
  // aal1-only users short-circuit without a role lookup.
  const assurance = await readAssurance(input.client);
  if (assurance.currentLevel !== "aal2") {
    const required = await requiredAssuranceForUser(user.id, input.correlationId);
    if (required === "aal2") {
      await auditAuthLifecycle({
        action: AUTH_LIFECYCLE_AUDIT_ACTIONS.mfaAssuranceDenied,
        resourceType: "auth_sessions",
        resourceId: mirror.id,
        actorId: user.id,
        ipAddress: input.ipAddress,
        userAgent,
        correlationId: input.correlationId,
        metadata: {
          requiredLevel: "aal2",
          currentLevel: assurance.currentLevel ?? "unknown",
        },
      });
      throw new MfaRequiredError("Two-factor verification is required to continue.", {
        requiredLevel: "aal2",
      });
    }
  }

  await touchSessionActivity(mirror.id);
  return {
    userId: user.id,
    email: user.email,
    sessionId: mirror.id,
    deviceId: mirror.device_id,
    profile,
  };
}

export interface RouteSession {
  readonly client: SupabaseClient;
  readonly session: AuthSessionContext;
  readonly correlationId: string;
}

/**
 * One-call session resolution at the route boundary: builds the
 * cookie-backed client, resolves the session, and returns both with the
 * request correlation id.
 */
export async function resolveSessionForRoute(
  request: NextRequest,
  ipAddress: string | null,
): Promise<RouteSession> {
  const correlationId = requestCorrelationId(request);
  const client = await createRouteHandlerClient();
  const session = await resolveSession({
    client,
    headers: request.headers,
    correlationId,
    ipAddress,
  });
  return { client, session, correlationId };
}

export interface MfaRouteSession {
  readonly client: SupabaseClient;
  readonly userId: string;
  readonly email: string | null;
  readonly sessionId: string;
  readonly correlationId: string;
}

/**
 * Session resolution for the MFA establishment endpoints (challenge, verify,
 * enroll, unenroll, factors, recovery codes). It requires an authenticated
 * user with an active profile and a live session mirror, but deliberately
 * does NOT enforce the aal2 gate -- the user is in the act of reaching aal2,
 * so holding the gate would make the challenge unreachable. All other
 * protected routes use resolveSession, which does enforce it.
 */
export async function resolveMfaSessionForRoute(request: NextRequest): Promise<MfaRouteSession> {
  const correlationId = requestCorrelationId(request);
  const client = await createRouteHandlerClient();
  const user = await requireAuthUser(client);
  const profile = await getOwnProfile(
    makeTenantContext({
      companyId: PLATFORM_COMPANY_ID,
      userId: user.id,
      role: "staff",
      correlationId,
    }),
  );
  if (profile === null) {
    throw new ForbiddenError("This account is not available.");
  }
  assertProfileActiveForSession(profile);

  const refreshToken = await getCurrentRefreshToken(client);
  const mirror =
    refreshToken === null
      ? null
      : await getSessionByFingerprint(user.id, refreshTokenFingerprint(refreshToken));
  if (mirror === null) {
    throw new UnauthorizedError("Your session expired. Sign in again.");
  }
  return {
    client,
    userId: user.id,
    email: user.email,
    sessionId: mirror.id,
    correlationId,
  };
}
