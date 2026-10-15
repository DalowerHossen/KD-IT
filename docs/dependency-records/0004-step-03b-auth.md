// path: docs/dependency-records/0004-step-03b-auth.md

# Dependency Record 0004: Supabase SSR Auth Helpers (Step 03 Substep B)

- Requested by: Step 03 substep B implementer
- Decided by: session integrator on branch `arena/a9c5c359-kd-it`
- Date: 2026-10-15

## Request

- Official package: `@supabase/ssr`
- Registry: https://registry.npmjs.org/@supabase/ssr
- Exact version: `0.12.7` (released 2026-09-08, npm `latest` dist-tag)
- Official documentation: https://supabase.com/docs/guides/auth/server-side/nextjs
- Runtime target: server only (proxy session refresh, route handlers, server
  components). No browser import; the browser never touches Supabase Auth
  directly in this platform.
- License: MIT (from registry metadata)
- Reason: Next.js App Router cookie-based session management (getAll/setAll
  cookie adapter, PKCE code exchange, token refresh) using the official
  Supabase helper instead of hand-rolled cookie parsing. `@supabase/ssr`
  is the documented companion of `@supabase/supabase-js` for this purpose.

## Integrator review

- Peer requirement `@supabase/supabase-js@^2.114.0` is satisfied by the
  pinned `2.117.3`; no framework or runtime version changes.
- Server-only import surface: `createServerClient` and cookie-option types.
  No client-bundle impact (verified: no `@supabase/ssr` import outside
  server modules; the browser authenticates exclusively through API routes).
- Integrity: exact version pinned in `package.json` with lockfile entry
  (see verification below).
- Vulnerability review: `npm audit --omit=dev --audit-level=high` after
  installation (see verification below).
- Alternatives considered: hand-rolled cookie storage adapter on top of
  `@supabase/supabase-js` (rejected: reimplements PKCE locking, chunked
  cookies, and refresh semantics the official package already owns).

## Decision

Approved. Install exactly `@supabase/ssr@0.12.7` as a production dependency.

## Verification (recorded after installation)

- `npm install -S @supabase/ssr@0.12.7`: exit 0, lockfile updated.
- Production audit: `npm audit --omit=dev --audit-level=high` reports 0
  vulnerabilities.
- No alternative auth-cookie library exists in the manifest; this record is
  the single ownership entry for App Router session handling.
