// path: lib/auth/flows/sessions.ts
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { auditAuthLifecycle, AUTH_LIFECYCLE_AUDIT_ACTIONS } from "@/lib/auth/audit";
import { type AuthFlowRequest } from "@/lib/auth/flows/context";
import {
  type AuthSessionListItem,
  authSessionListItemSchema,
  type RevokeSessionInput,
  revokeSessionInputSchema,
} from "@/lib/auth/schemas";
import {
  getCurrentRefreshToken,
  refreshTokenFingerprint,
  signOutAllSessions,
  signOutCurrentSession,
} from "@/lib/auth/server-auth";
import { type AuthSessionContext } from "@/lib/auth/session";
import {
  listUserSessions,
  revokeAllUserSessions,
  revokeSessionById,
} from "@/lib/db/repositories/auth-sessions";
import { NotFoundError } from "@/lib/errors/app-errors";

/**
 * Authenticated session management: listing with current-session binding,
 * single-session revocation, and logout scopes. Mirror rows revoke first
 * and provider sessions second, so a provider failure can never resurrect
 * a revoked mirror.
 */
export async function listSessions(
  client: SupabaseClient,
  session: AuthSessionContext,
): Promise<readonly AuthSessionListItem[]> {
  const entries = await listUserSessions(session.userId);
  const refreshToken = await getCurrentRefreshToken(client);
  const currentFingerprint = refreshToken === null ? null : refreshTokenFingerprint(refreshToken);
  return entries.map((entry) =>
    authSessionListItemSchema.parse({
      id: entry.id,
      deviceLabel: entry.deviceLabel,
      platform: entry.platform,
      ipAddress: entry.ipAddress,
      createdAt: entry.createdAt,
      lastActivityAt: entry.lastActivityAt,
      expiresAt: entry.expiresAt,
      current: currentFingerprint !== null && entry.refreshTokenSha256 === currentFingerprint,
    }),
  );
}

/** Revokes one session by id, including the caller's own. */
export async function revokeSession(
  session: AuthSessionContext,
  rawInput: RevokeSessionInput,
  request: AuthFlowRequest,
): Promise<void> {
  const input = revokeSessionInputSchema.parse(rawInput);
  await revokeSessionById(session.userId, input.sessionId, "user-revoked");
  await auditAuthLifecycle({
    action: AUTH_LIFECYCLE_AUDIT_ACTIONS.sessionRevoked,
    resourceType: "auth_sessions",
    resourceId: input.sessionId,
    actorId: session.userId,
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    correlationId: request.correlationId,
    metadata: { selfRevoked: input.sessionId === session.sessionId },
  });
}

/** Signs out of the current session on this device only. */
export async function logoutCurrentSession(
  client: SupabaseClient,
  session: AuthSessionContext,
  request: AuthFlowRequest,
): Promise<void> {
  try {
    await revokeSessionById(session.userId, session.sessionId, "logout");
  } catch (error) {
    if (!(error instanceof NotFoundError)) {
      throw error;
    }
  }
  await signOutCurrentSession(client);
  await auditAuthLifecycle({
    action: AUTH_LIFECYCLE_AUDIT_ACTIONS.sessionRevoked,
    resourceType: "auth_sessions",
    resourceId: session.sessionId,
    actorId: session.userId,
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    correlationId: request.correlationId,
    metadata: { scope: "current" },
  });
}

export interface LogoutAllResult {
  readonly revokedSessions: number;
}

/** Signs out of every session on every device. */
export async function logoutAllSessions(
  client: SupabaseClient,
  session: AuthSessionContext,
  request: AuthFlowRequest,
): Promise<void> {
  const revoked = await revokeAllUserSessions(session.userId, { reason: "logout-all" });
  await signOutAllSessions(client);
  await auditAuthLifecycle({
    action: AUTH_LIFECYCLE_AUDIT_ACTIONS.sessionRevoked,
    resourceType: "auth_sessions",
    actorId: session.userId,
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    correlationId: request.correlationId,
    metadata: { scope: "all", revokedSessions: revoked.revokedSessionIds.length },
  });
}
