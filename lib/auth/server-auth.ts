// path: lib/auth/server-auth.ts
import "server-only";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/config/env";
import { toDatabaseError } from "@/lib/db/pg";
import {
  BadRequestError,
  ConfigurationError,
  ExternalServiceError,
  UnauthorizedError,
} from "@/lib/errors/app-errors";

/**
 * Server-side Supabase Auth clients for route handlers. Cookie-backed
 * clients use the official SSR adapter so PKCE exchange, refresh, and
 * chunked cookies behave exactly as documented; privileged calls reuse the
 * Step 02 service-role client. Every constructor fails closed when its
 * credentials are unset, and provider errors map to generic messages that
 * never echo identities, tokens, or provider internals.
 */
export interface SupabaseAuthConfig {
  readonly url: string;
  readonly anonKey: string;
  readonly serviceRoleKey: string;
}

/** Supabase Auth credentials; fails closed when any value is unset. */
export function getSupabaseAuthConfig(): SupabaseAuthConfig {
  const env = getServerEnv();
  if (
    env.SUPABASE_URL === undefined ||
    env.SUPABASE_ANON_KEY === undefined ||
    env.SUPABASE_SERVICE_ROLE_KEY === undefined
  ) {
    throw new ConfigurationError(
      "Supabase Auth is not configured. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in the server environment.",
    );
  }
  return {
    url: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

/**
 * Cookie-backed client for route handlers. Reads the request cookies and
 * persists refreshed tokens to the response; must only be called where
 * cookie writes are legal (route handlers, never cached components).
 */
export async function createRouteHandlerClient(): Promise<SupabaseClient> {
  const config = getSupabaseAuthConfig();
  const cookieStore = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
    // Enables the MFA recovery-codes (backup code) API surface. The methods
    // still fail closed when the Supabase project has not enabled them.
    auth: {
      experimental: { recoveryCodes: true },
    },
    global: {
      headers: { "x-client-info": "kd-solution-it@3" },
    },
  });
}

export interface AuthUserIdentity {
  readonly id: string;
  readonly email: string | null;
}

/**
 * Authenticated provider user, or a generic sign-in error. Uses getUser
 * (server-validated) rather than getSession (local only).
 */
export async function requireAuthUser(client: SupabaseClient): Promise<AuthUserIdentity> {
  const { data, error } = await client.auth.getUser();
  if (error !== null || data.user === null) {
    throw new UnauthorizedError("Sign in required.", {
      cause: error === null ? undefined : toDatabaseError(error),
    });
  }
  return { id: data.user.id, email: data.user.email ?? null };
}

/** Refresh token from the cookie session, or null when unreadable. */
export async function getCurrentRefreshToken(client: SupabaseClient): Promise<string | null> {
  const { data, error } = await client.auth.getSession();
  if (error !== null || data.session === null) {
    return null;
  }
  return data.session.refresh_token;
}

/** SHA-256 fingerprint binding a refresh token to its mirror row. */
export function refreshTokenFingerprint(refreshToken: string): string {
  return createHash("sha256").update(refreshToken, "utf8").digest("hex");
}

/**
 * Exchanges an email-link code for a session, persisting cookies through
 * the adapter. Invalid or expired codes share one generic outcome.
 */
export async function exchangeCodeForSession(
  client: SupabaseClient,
  code: string,
): Promise<AuthUserIdentity> {
  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error !== null || data.user === null) {
    throw new BadRequestError("This link is invalid or expired.", {
      cause: error === null ? undefined : toDatabaseError(error),
    });
  }
  return { id: data.user.id, email: data.user.email ?? null };
}

export interface EmailLinkVerification {
  readonly tokenHash: string;
  readonly type: "signup" | "recovery";
}

/**
 * Verifies a server-initiated email link (token hash plus type) and
 * persists the resulting session through the cookie adapter. Server-side
 * signup and recovery send this link shape; PKCE codes use
 * exchangeCodeForSession instead. Failures share one generic outcome.
 */
export async function verifyEmailLink(
  client: SupabaseClient,
  verification: EmailLinkVerification,
): Promise<AuthUserIdentity> {
  const { data, error } = await client.auth.verifyOtp({
    token_hash: verification.tokenHash,
    type: verification.type,
  });
  if (error !== null || data.user === null) {
    throw new BadRequestError("This link is invalid or expired.", {
      cause: error === null ? undefined : toDatabaseError(error),
    });
  }
  return { id: data.user.id, email: data.user.email ?? null };
}

/** Clears the current cookie session without touching other devices. */
export async function signOutCurrentSession(client: SupabaseClient): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error !== null) {
    throw new ExternalServiceError("Sign-out failed. Try again.", {
      cause: toDatabaseError(error),
    });
  }
}

/**
 * Revokes every provider session for the calling user across all devices.
 * Backs logout-everywhere and password-change revocation.
 */
export async function signOutAllSessions(client: SupabaseClient): Promise<void> {
  const { error } = await client.auth.signOut({ scope: "global" });
  if (error !== null) {
    throw new ExternalServiceError("Sign-out failed. Try again.", {
      cause: toDatabaseError(error),
    });
  }
}
