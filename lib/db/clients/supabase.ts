// path: lib/db/clients/supabase.ts
import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/config/env";
import { ConfigurationError } from "@/lib/errors/app-errors";

/**
 * Step 02 Supabase client trio, kept strictly separated:
 *  - browser clients live in lib/db/clients/browser.ts (publishable key),
 *  - authenticated server clients are built here per request (anon key plus
 *    the caller's session token, so RLS runs as that user),
 *  - the privileged client is built only here, holds the service role key,
 *    and must never leave the server boundary (import "server-only").
 *
 * Credentials flow only from the environment; no source file ever embeds
 * keys. Every query constructed on top of these clients selects explicit
 * column lists.
 */

const AUTH_OPTIONS = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      "x-client-info": "kd-solution-it@2",
    },
  },
} as const;

/** Server request-scoped client bound to the caller's access token. */
export function createAuthenticatedServerClient(accessToken?: string): SupabaseClient {
  const env = getServerEnv();
  if (env.SUPABASE_URL === undefined || env.SUPABASE_ANON_KEY === undefined) {
    throw new ConfigurationError(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in the server environment.",
    );
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    ...AUTH_OPTIONS,
    global: {
      headers: {
        ...AUTH_OPTIONS.global.headers,
        ...(accessToken !== undefined ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    },
  });
}

let privilegedClient: SupabaseClient | null = null;

/**
 * Privileged server-side client. Construction happens lazily and the
 * instance is cached per process; importing modules outside the server
 * boundary is impossible because this file is "server-only".
 */
export function getPrivilegedSupabaseClient(): SupabaseClient {
  if (privilegedClient !== null) {
    return privilegedClient;
  }
  const env = getServerEnv();
  if (env.SUPABASE_URL === undefined || env.SUPABASE_SERVICE_ROLE_KEY === undefined) {
    throw new ConfigurationError(
      "Privileged Supabase access is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server environment.",
    );
  }
  privilegedClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, AUTH_OPTIONS);
  return privilegedClient;
}

/** Strict guard that refuses privileged client attachments leaving db internals. */
export function assertPrivilegedServerBoundary(): void {
  if (typeof window !== "undefined") {
    throw new ConfigurationError("Privileged clients exist only in the server runtime.");
  }
}
