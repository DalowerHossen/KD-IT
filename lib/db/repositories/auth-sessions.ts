// path: lib/db/repositories/auth-sessions.ts
import "server-only";

import { z } from "zod";

import { type AuthSessionRow, authSessionRowSchema } from "@/lib/auth/schemas";
import { pgQuery } from "@/lib/db/pg";
import { PLATFORM_COMPANY_ID } from "@/lib/db/tenant-context";
import { NotFoundError } from "@/lib/errors/app-errors";
import { genericUuidSchema } from "@/lib/validation/zod-helpers";

/**
 * Authentication-session repository. Session rows mirror provider sessions
 * per user on the platform company; refresh tokens persist only as
 * AES-256-GCM envelopes plus a SHA-256 fingerprint, and metadata queries
 * never select the envelope columns. Single-session revocation is enforced
 * at this mirror and by RLS: every platform request re-validates the
 * mirror, so a revoked row cannot act even while its provider session
 * lingers. Provider-wide sign-out backs logout-everywhere and
 * password-change revocation.
 */
export const AUTH_SESSION_COLUMNS =
  "id, company_id, user_id, device_id, provider_session_ref, ip_address, user_agent_hash, last_activity_at, expires_at, revoked_at, revocation_reason, created_at, updated_at, deleted_at, version";

const sessionTokenEnvelopeSchema = z.strictObject({
  id: genericUuidSchema,
  user_id: genericUuidSchema,
  refresh_token_ciphertext: z.instanceof(Buffer),
  refresh_token_nonce: z.instanceof(Buffer),
  refresh_token_tag: z.instanceof(Buffer),
  refresh_token_key_version: z.number().int().min(1),
  refresh_token_sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type SessionTokenEnvelopeRow = z.infer<typeof sessionTokenEnvelopeSchema>;

export const issueSessionInputSchema = z.strictObject({
  userId: genericUuidSchema,
  deviceId: genericUuidSchema.nullable(),
  providerSessionRef: z.string().min(8).max(128).nullable(),
  ip: z.string().max(64).nullable(),
  userAgentHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  expiresAt: z.string().datetime(),
  refreshTokenCiphertext: z.instanceof(Buffer),
  refreshTokenNonce: z.instanceof(Buffer),
  refreshTokenTag: z.instanceof(Buffer),
  refreshTokenKeyVersion: z.number().int().min(1),
  refreshTokenSha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type IssueSessionInput = z.infer<typeof issueSessionInputSchema>;

function parseSessionRow(row: Record<string, unknown>): AuthSessionRow {
  return authSessionRowSchema.parse({
    ...row,
    ip_address: row.ip_address === null ? null : String(row.ip_address),
  });
}

/** Issues a live session row after a successful provider sign-in. */
export async function issueSession(input: IssueSessionInput): Promise<AuthSessionRow> {
  const validated = issueSessionInputSchema.parse(input);
  const result = await pgQuery(
    `insert into app.auth_sessions (
       company_id, user_id, device_id, provider_session_ref, ip_address,
       user_agent_hash, last_activity_at, expires_at,
       refresh_token_ciphertext, refresh_token_nonce, refresh_token_tag,
       refresh_token_key_version, refresh_token_sha256
     )
     values (
       $1, $2, $3, $4, $5::inet,
       $6, clock_timestamp(), $7,
       $8, $9, $10, $11, $12
     )
     returning ${AUTH_SESSION_COLUMNS}`,
    [
      PLATFORM_COMPANY_ID,
      validated.userId,
      validated.deviceId,
      validated.providerSessionRef,
      validated.ip,
      validated.userAgentHash,
      validated.expiresAt,
      validated.refreshTokenCiphertext,
      validated.refreshTokenNonce,
      validated.refreshTokenTag,
      validated.refreshTokenKeyVersion,
      validated.refreshTokenSha256,
    ],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (row === undefined) {
    throw new NotFoundError("Session record was not created.");
  }
  return parseSessionRow(row);
}

/** Live metadata for one session, or null when revoked or missing. */
export async function getLiveSessionById(sessionId: string): Promise<AuthSessionRow | null> {
  const validated = genericUuidSchema.parse(sessionId);
  const result = await pgQuery(
    `select ${AUTH_SESSION_COLUMNS}
     from app.auth_sessions
     where id = $1
       and company_id = $2
       and deleted_at is null
       and revoked_at is null`,
    [validated, PLATFORM_COMPANY_ID],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return parseSessionRow(row);
}

/**
 * Live session bound to a refresh-token fingerprint, or null when the
 * session is unknown, revoked, or expired. The mirror binding behind
 * every authenticated request.
 */
export async function getSessionByFingerprint(
  userId: string,
  fingerprintSha256: string,
): Promise<AuthSessionRow | null> {
  const validatedUser = genericUuidSchema.parse(userId);
  const result = await pgQuery(
    `select ${AUTH_SESSION_COLUMNS}
     from app.auth_sessions
     where user_id = $1
       and company_id = $2
       and refresh_token_sha256 = $3
       and deleted_at is null
       and revoked_at is null
       and expires_at > clock_timestamp()`,
    [validatedUser, PLATFORM_COMPANY_ID, fingerprintSha256],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return parseSessionRow(row);
}

/**
 * Token envelope for server-side session binding. Returned only inside
 * the server boundary; never serialized to clients or audit metadata.
 */
export async function getSessionTokenEnvelope(
  sessionId: string,
): Promise<SessionTokenEnvelopeRow | null> {
  const validated = genericUuidSchema.parse(sessionId);
  const result = await pgQuery(
    `select id, user_id, refresh_token_ciphertext, refresh_token_nonce,
            refresh_token_tag, refresh_token_key_version, refresh_token_sha256
     from app.auth_sessions
     where id = $1
       and company_id = $2
       and deleted_at is null`,
    [validated, PLATFORM_COMPANY_ID],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return sessionTokenEnvelopeSchema.parse(row);
}

export interface UserSessionListEntry {
  readonly id: string;
  readonly deviceLabel: string;
  readonly platform: string | null;
  readonly ipAddress: string | null;
  readonly createdAt: string;
  readonly lastActivityAt: string;
  readonly expiresAt: string;
  readonly refreshTokenSha256: string;
}

/** Live sessions for a user with device labels, newest activity first. */
export async function listUserSessions(userId: string): Promise<readonly UserSessionListEntry[]> {
  const validated = genericUuidSchema.parse(userId);
  const result = await pgQuery(
    `select s.id as id,
            coalesce(d.display_label, 'Unknown device') as device_label,
            d.platform as platform,
            s.ip_address as ip_address,
            s.created_at as created_at,
            s.last_activity_at as last_activity_at,
            s.expires_at as expires_at,
            s.refresh_token_sha256 as refresh_token_sha256
     from app.auth_sessions s
     left join app.auth_devices d
       on d.id = s.device_id
       and d.deleted_at is null
     where s.user_id = $1
       and s.company_id = $2
       and s.deleted_at is null
       and s.revoked_at is null
       and s.expires_at > clock_timestamp()
     order by s.last_activity_at desc`,
    [validated, PLATFORM_COMPANY_ID],
  );
  const entrySchema = z.strictObject({
    id: genericUuidSchema,
    device_label: z.string().min(1),
    platform: z.string().nullable(),
    ip_address: z.string().nullable(),
    created_at: z.string().datetime(),
    last_activity_at: z.string().datetime(),
    expires_at: z.string().datetime(),
    refresh_token_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  });
  return result.rows.map((row) => {
    const parsed = entrySchema.parse({
      ...(row as Record<string, unknown>),
      ip_address:
        (row as Record<string, unknown>).ip_address === null
          ? null
          : String((row as Record<string, unknown>).ip_address),
    });
    return {
      id: parsed.id,
      deviceLabel: parsed.device_label,
      platform: parsed.platform,
      ipAddress: parsed.ip_address,
      createdAt: parsed.created_at,
      lastActivityAt: parsed.last_activity_at,
      expiresAt: parsed.expires_at,
      refreshTokenSha256: parsed.refresh_token_sha256,
    };
  });
}

/**
 * Throttled activity touch: writes at most once per interval per session
 * so steady traffic does not turn every request into a session write.
 */
export async function touchSessionActivity(
  sessionId: string,
  minIntervalMinutes = 5,
): Promise<void> {
  const validated = genericUuidSchema.parse(sessionId);
  await pgQuery(
    `update app.auth_sessions
     set last_activity_at = clock_timestamp(),
         version = version + 1
     where id = $1
       and deleted_at is null
       and revoked_at is null
       and last_activity_at < clock_timestamp() - make_interval(mins => $2)`,
    [validated, minIntervalMinutes],
  );
}

/**
 * Revokes one session. The lookup is ownership-scoped, so unknown ids and
 * other users' sessions share one generic outcome. Enforcement is at the
 * mirror and RLS; see the module contract.
 */
export async function revokeSessionById(
  userId: string,
  sessionId: string,
  reason: string,
): Promise<void> {
  const validatedUser = genericUuidSchema.parse(userId);
  const validatedSession = genericUuidSchema.parse(sessionId);
  const result = await pgQuery(
    `update app.auth_sessions
     set revoked_at = clock_timestamp(),
         revocation_reason = $4,
         version = version + 1
     where id = $1
       and user_id = $2
       and company_id = $3
       and deleted_at is null
       and revoked_at is null`,
    [validatedSession, validatedUser, PLATFORM_COMPANY_ID, reason],
  );
  if (result.rowCount === 0) {
    throw new NotFoundError("Session not found.");
  }
}

export interface SessionTokenSync {
  readonly refreshTokenCiphertext: Buffer;
  readonly refreshTokenNonce: Buffer;
  readonly refreshTokenTag: Buffer;
  readonly refreshTokenKeyVersion: number;
  readonly refreshTokenSha256: string;
}

/**
 * Rebinds a live session mirror to a rotated refresh token. Supabase MFA
 * verification re-issues the session (new access and refresh tokens) and the
 * SSR adapter persists the new refresh token to the cookie; the mirror must
 * follow it or the fingerprint binding in resolveSession stops matching. The
 * update is idempotent when the token did not actually change.
 */
export async function syncSessionRefreshToken(
  sessionId: string,
  token: SessionTokenSync,
): Promise<void> {
  const validated = genericUuidSchema.parse(sessionId);
  const result = await pgQuery(
    `update app.auth_sessions
     set refresh_token_ciphertext = $2,
         refresh_token_nonce = $3,
         refresh_token_tag = $4,
         refresh_token_key_version = $5,
         refresh_token_sha256 = $6,
         version = version + 1
     where id = $1
       and company_id = $7
       and deleted_at is null
       and revoked_at is null`,
    [
      validated,
      token.refreshTokenCiphertext,
      token.refreshTokenNonce,
      token.refreshTokenTag,
      token.refreshTokenKeyVersion,
      token.refreshTokenSha256,
      PLATFORM_COMPANY_ID,
    ],
  );
  if (result.rowCount === 0) {
    throw new NotFoundError("Session not found.");
  }
}

export interface RevokeAllSessionsResult {
  readonly revokedSessionIds: readonly string[];
}

/**
 * Revokes every live session for a user, optionally keeping one. Backs
 * logout-everywhere and password-change revocation; callers pair it with
 * provider-wide sign-out.
 */
export async function revokeAllUserSessions(
  userId: string,
  options?: { readonly exceptSessionId?: string; readonly reason?: string },
): Promise<RevokeAllSessionsResult> {
  const validated = genericUuidSchema.parse(userId);
  const except =
    options?.exceptSessionId === undefined
      ? null
      : genericUuidSchema.parse(options.exceptSessionId);
  const result = await pgQuery(
    `update app.auth_sessions
     set revoked_at = clock_timestamp(),
         revocation_reason = $3,
         version = version + 1
     where user_id = $1
       and company_id = $2
       and deleted_at is null
       and revoked_at is null
       and ($4::uuid is null or id <> $4::uuid)
     returning id`,
    [validated, PLATFORM_COMPANY_ID, options?.reason ?? "revoked", except],
  );
  return {
    revokedSessionIds: result.rows.map((row) => (row as { id: string }).id),
  };
}
