<!-- path: docs/handoffs/STEP_02_COMPLETED.md -->

# STEP 02 -- Secure Data Plane -- Completion Handoff

> Date: 2026-10-14 - Owner: platform integration agent (guided by Steps 00-15 planning docs)
> Status: **Accepted** -- all gates green; production-deployment of SQL + env plus SQL assertions
> require a reachable database (documented below and runnable with zero code changes).

## 1. What shipped

### A-B. Database foundation + foundational tables

- `supabase/migrations/` 001-008, every change paired `.up.sql` / `.down.sql`, sequential naming,
  ledger `app.schema_migrations` with SHA-256 checksums and direction.
- Postgres UUID v7 generator `app.uuid_v7()` (leakproof, RFC-9562 shape, ms-embedded; runtime
  asserted), plus `getrandbits`, `sha256_hex`, context readers, `platform_company_id()`.
- UTC `created_at`/`updated_at` (`touch_updated_at`), optimistic `version` (`guard_optimistic_version`
  raises serialization failure on stale writers), `deleted_at` soft-delete, `company_id NOT NULL`,
  `ON DELETE RESTRICT` default on every FK, named constraints, partial-unique indexes aware of
  soft delete, comment documented tables.
- Tables (16): `companies` (+ platform singleton), `memberships`, `configuration_entries`,
  `audit_events`, `command_approvals`, `command_approval_events`, `standing_grants`,
  `idempotency_keys`, `outbox_events`, `rate_limit_counters`, `queue_jobs`, `leader_locks`,
  `storage_connections`, `file_records`, `file_quarantine`, `storage_migration_jobs`.
- Migration runner scripts: `scripts/db/migrate.mjs`, `rollback.mjs`, `assert.mjs`, shared
  `scripts/db/lib/runner.mjs`; static convention linter `scripts/db/lint-migrations.mjs`
  (runs **without** a database).

### C. Multi-tenant security (RLS)

- RLS **enabled + FORCE**d on all 15 data tables (linter + SQL assertion verified).
- Default deny: `revoke all` from `public`/`anon`; `authenticated` receives `SELECT` **only**,
  gated by tenant policies (`app.current_company_id()`, role helpers); **no** INSERT/UPDATE/DELETE
  is ever granted to `authenticated` -- writes flow exclusively through security-definer RPCs
  (with `search_path = app, public` and per-role EXECUTE hardening in 008) or the server-only
  privileged boundary (`service_role`).
- SECURITY DEFINER helper/RPC catalog (25 functions): context readers, audit append + chain
  verify, approval chain RPCs, idempotency begin/complete/fail, outbox claim/publish/reschedule,
  `rate_limit_hit`, `queue_claim/succeed/fail`, `leader_try_acquire/release`, standing-grant check.
- Non-enumerating failures: direct writes under wrong privileges surface generic
  permission-denied; tenant-context errors are generic "does not belong to your workspace".

### D. Approval + immutable audit

- `app.audit_events`: append-only (mutation-rejecting trigger), per-company SHA-256 hash chain
  (`prev_hash`, `current_hash`), identity `sequence`, correlation ids, actor (typed), resource
  keys, inet IP, SHA-256-hashed user agents, metadata `jsonb`; `app.audit_chain_verify()`
  recomputes the chain inside SQL; `app.audit_append()` is the **only** insert path.
- Generic `audit_mutation_trigger()` attached to: companies, memberships, configuration_entries,
  command_approvals, standing_grants, storage_connections, file_records, file_quarantine,
  storage_migration_jobs. Queue dead-letter transitions audited through a filtered trigger.
  `audit_events`/`command_approval_events` have no audit trigger (anti-recursion).
- Command approval foundation: statuses (`proposed -> awaiting_l2 -> awaiting_l3/step-up ->
awaiting_confirmation -> approved -> executed` + rejected/expired/cancelled), `command_propose`
  with initial-state routing (staff/owner/admin_staff -> L2; ceo -> L3; super_admin -> confirm),
  no self-approval, optional dual control, delegation, escalation event, rejection with reason,
  TTL auto-expiration through `command_expire_pending`, `command_execute` with **one-time
  execution + deterministic replay** (repeated calls return the recorded result), idempotency key
  per command, append-only event log. Standing read-grants via `standing_grants` +
  `has_standing_grant` (wildcard scopes).

### E. Strict Supabase client separation + TS data layer

- `lib/db/clients/browser.ts` (anon key only, strictly public env), `createAuthenticatedServerClient`
  (anon key + caller bearer, RLS enforced), `getPrivilegedSupabaseClient()` in `server-only`
  module (service-role never leaves the boundary). Direct `pg` privileged pool in `lib/db/pg.ts`
  with numeric(18,4)/int8 delivered as strings, float8 refused, SELECT * refused.
- `lib/db/tenant-context.ts`: frozen per-request context (company/user/role/correlation),
  permission matrix `REQUIRED_COMMAND_ROLES` composed by role, ownership guards, platform-scope
  guards. Tenant settings flow into every transaction as `app.*` `set_config` locals consumed by
  RLS helpers.
- Repositories (explicit column constants, Zod row schemas, structured conflicts):
  `audit`, `commands`, `config`, `rate-limit`, `outbox`, `queue`, `leader`,
  `file-records`, `storage-connections`. Keyset pagination everywhere; every optimistic
  mutation takes an expected version.

### F. Money: USD + decimal only

- Step 01 canonical-string contract retained (`lib/money/usd.ts`); **Step 02 adds full
  arithmetic** in `lib/money/decimal.ts` on decimal.js (`10.6.0`, approved record
  `docs/dependency-records/0003-step-02-data-plane.md`): exact sum/sub/div/mult, half-even
  rounding, drift-free largest-remainder allocation proving parts re-sum to the total.
  JavaScript numbers and `parseFloat` never enter the monetary path; pg type parsers return
  numerics as strings; Zod re-validates at every boundary.

### G. Encryption (AES-256-GCM, tenant/file scoped)

- `lib/crypto/envelope.ts`: unique 12-byte nonce per operation, 16-byte auth tag, HKDF-SHA256
  derived data keys per (company, resource, category, key version); AAD binds those four fields;
  master material lives only in server env (`KD_ENCRYPTION_MASTER_KEY`, `KD_ENCRYPTION_KEY_VERSION`
  -- names only, no values anywhere in the repo), is zeroed after each derivation; rotation via
  `rotateEnvelope()` (old version read from stored metadata, new version active).
- `lib/crypto/hashes.ts`: tenant-scoped HMAC-SHA256 dedupe hash (no raw plaintext SHA-256 -> no
  cross-tenant oracle), ciphertext SHA-256, delivery nonce. Secrets (drive credentials) stored in
  the same envelope shape inside `storage_connections` with a completeness CHECK.

### H. Runtime file storage

- `lib/storage/provider-interface.ts`: strict adapter contract (health/upload/download/delete),
  provider names equal DB CHECK values. Adapters: `google-drive.ts` (Drive v3 over REST with
  service-account JWT RSVP-256; no googleapis SDK -- deliberate reduced cloud surface) and
  `supabase-storage.ts` (privileged client, tenant-scoped keys).
- `provider-selection.ts`: Google Drive preferred when enabled+healthy, automatic fallback to
  Supabase Storage, fail-closed `ExternalServiceError` when neither is healthy, 60 s cached
  health probes persisted per tenant; reads always honor the file row's recorded provider
  (`file-service.ts`).
- `file-service.ts` upload path: sanitize -> validate (below) -> EXIF strip -> dedupe HMAC -> quota ->
  **encrypt before provider** -> provider upload -> `file_records` insert (db-minted UUID v7) with
  nonce/tag/key-version/integrity metadata -> audit `file.uploaded` (duplicates audit + reuse).
  Downloads verify ciphertext SHA-256 **before** decryption; deletes audit and purge provider
  bytes (+ outbox retry sweep). Signed delivery: `signed-urls.ts` one-issuance HMAC tokens
  (5 min TTL, tenant-scoped signing key).

### J. File security pipeline (`lib/files/validation.ts`)

- Size caps (100 MB/file, 50 MB zips, 5 GB/tenant quota in DB), extension whitelist, declared
  MIME <-> extension coherence, magic-byte verification, filename normalization + traversal-proof
  reconstruction, SVG active-content rejection (script/event/foreignObject/javascript:),
  PDF active-content rejection (`/JavaScript`, `/OpenAction`, `/Launch`, `/EmbeddedFile`, ...),
  archive-bomb/polyglot guards, text-file binary sniffing, image EXIF stripping, JPEG polyglot
  (markup-in-EXIF) rejection, MIME resolution result. Files with `quarantine_status <> 'clean'`
  can never become published (DB CHECK). Duplicates detected via the protected HMAC.

### I. Storage migration (`lib/storage/migrations.ts`)

- Approval-gated jobs (`storage_migration_jobs` references `command_approvals`), executor under
  `leader_try_acquire`, ciphertext-only copy, SHA-256 integrity gate before flip, optimistic-locked
  metadata transition (`flipFileProvider` guarded by `migration_state='migrating'` + version),
  old object retained 30 days (`storage.purge_provider_object` queue job), retry-safe worker
  cycle (status transitions with version checks; failures land in `failed` + audit).

### K. Queue & concurrency

- `queue_jobs` + RPCs: claim via `FOR UPDATE SKIP LOCKED` with expiring leases (crash-safe
  takeover), `queue_succeed`/`queue_fail` (retryable until `max_attempts`, then dead-letter +
  audit triggers), dedupe partial-unique for active copies; `leader_locks` single-holder election;
  `rate_limit_hit` atomic fixed-window check-and-increment returning allow/deny + retry-after;
  idempotency registry with replay state machine.
- TS: `lib/queue/types.ts` (kinds, payloads, backoff table), `lib/commands/types.ts` (kind
  registry, role matrix, row schemas).

## 2. Verification evidence (this checkout, 2026-10-14)

| Gate                                                                           | Result                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci` (fresh install)                                                       | clean                                                                                                                                                                                                                 |
| `format:check` (`prettier`)                                                    | clean (after `format` normalization)                                                                                                                                                                                  |
| `lint` (`eslint . --max-warnings=0`)                                           | clean                                                                                                                                                                                                                 |
| `typecheck` (`next typegen` + `tsc --noEmit`)                                  | clean                                                                                                                                                                                                                 |
| `build` (production `next build`)                                              | clean, routes unchanged, proxy intact                                                                                                                                                                                 |
| `quality:scans` (English-only, path headers, no-test-files, markers, routes)   | clean                                                                                                                                                                                                                 |
| `scan:migrations` (new static linter, pairing/columns/UUIDv7/RLS/rollback/...) | clean (16 tables, 25 security-definer functions pinned)                                                                                                                                                               |
| `quality:audit` (`npm audit --omit=dev --audit-level=high`)                    | 0 vulnerabilities (known Step 01 dev-toolchain findings unchanged)                                                                                                                                                    |
| `acceptance:step02` offline (23 checks)                                        | PASS -- money exactness/allocation/rounding; encryption roundtrip/nonce-uniqueness/AAD+tag tamper/rotation/tenant HMAC; file pipeline (traversal, magic, SVG script, PDF JS, EXIF strip); signed URL roundtrip/tamper |
| `acceptance:step02` live-db                                                    | **Skipped here -- no database in sandbox**; runs as-is with `KD_DATABASE_URL` set                                                                                                                                     |
| `db:assert` SQL assertion suite                                                | written (`supabase/assertions/step-02-assert.sql`, 11 sections), runnable with `npm run db:assert`                                                                                                                    |

### Live-database verification recipe (identical in any supported environment)

```bash
# Local Postgres (any >= 15), Supabase project, or Docker container:
export KD_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/kd_platform"
npm run db:migrate       # applies 001-008 transactionally w/ ledger
npm run db:assert        # RLS/grants/UUIDv7/columns/isolation/approval/queue assertions
npm run db:rollback      # exercise rollback pair (default: newest migration)
npm run db:migrate && npm run db:assert   # re-apply + re-verify (idempotent)
npm run acceptance:step02                 # offline suite + live-db suite (12 checks)
```

The assertion suite runs every behavioral section inside one transaction with `rollback`, so it
mutates nothing; the live acceptance suite builds a probe tenant and deletes every probe row
afterwards.

## 3. Decisions, deviations, and evidence notes

1. **Acceptance-verification honesty:** the execution sandbox has no running database and no
   network-reachable IPv4 Postgres socket pooler for the temporary cloud instance provisioned
   during acceptance; rather than shipping a credentialed real database or weakening checks,
   Step 02 ships (a) the full migration + assertion toolkit, (b) a static linter passing on all
   conventions, (c) offline acceptance across the TS plane (23/23 PASS), and (d) a live-db
   acceptance suite that runs unchanged wherever `KD_DATABASE_URL` exists. SQL on live engines was
   drafted defensively (window functions, `FOR UPDATE`, partial unique with `ON CONFLICT`
   references validated against upstream syntax) -- every query executes only after an explicit
   workspace-run, per the recipe above.
2. **Google Drive via REST (service-account JWT) instead of googleapis**: deliberate reduced
   privileged-cloud-surface, full control of token lifecycle, no transitive SDK risk (recorded in
   the dependency record).
3. **Money boundaries:** `pg` refuses `float8` responses outright and returns numeric/int8 as
   strings, so accidental binary drift is caught as early as the driver.
4. **No direct client writes:** `authenticated` holds only `SELECT` grants (policy filtered);
   `audit_events` holds **no insert grant for anyone**; mutation occurs only through
   `app.audit_append` / RPCs / the privileged server boundary (asserted in SQL).
5. **Storage provider naming policy -- reads honor recorded provider** (never "preferred at
   read time"), so migrations are deterministic and tenant-safe.
6. **Quarantine publication invariant** enforced in SQL (`published_at` requires `quarantine_status
= 'clean'`); the internal scanning job type is queued via `file.scan_quarantine`.
7. **Dependencies added (integrator-reviewed, locked)**: `@supabase/supabase-js@2.117.3`,
   `pg@8.23.1`, `decimal.js@10.6.0`, `@types/pg@8.23.1` (dev). Record:
   `docs/dependency-records/0003-step-02-data-plane.md`. No runtime or framework versions changed.
8. **Audit trigger placement:** long-lived domain tables audited; `queue_jobs` audits only
   dead-letter transitions; `idempotency_keys`/`outbox_events`/`rate_limit_counters`/`leader_locks`
   are plumbing -- their state changes are components of an audited higher-level operation and are
   intentionally not audited row-wise (documented in 008 and here).

## 4. Environment variables (names only)

| Variable                                                    | Purpose                                                                                                                                                     | Required when                                             |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `SUPABASE_URL`                                              | Supabase project URL                                                                                                                                        | production (dev-optional until Step 02 services are used) |
| `SUPABASE_ANON_KEY`                                         | publishable key (browser/auth)                                                                                                                              | production                                                |
| `SUPABASE_SERVICE_ROLE_KEY`                                 | privileged server boundary (`import "server-only"`)                                                                                                         | production                                                |
| `KD_DATABASE_URL`                                           | privileged direct Postgres (runner + repos)                                                                                                                 | production                                                |
| `KD_ENCRYPTION_MASTER_KEY`                                  | 32-byte base64 AES-256-GCM master material                                                                                                                  | production                                                |
| `KD_ENCRYPTION_KEY_VERSION`                                 | active integer key version (>= 1)                                                                                                                           | production                                                |
| `KD_DATA_PLANE_ENABLED`                                     | when set to `true` in production the six data-plane variables above become hard boot requirements; omitted/false keeps foundation-only deployments bootable | production data-plane deployments                         |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public browser client                                                                                                                                       | when hosted Supabase ships                                |

Complementary rules (any NODE_ENV): configuring any Supabase variable requires all three; configuring
any encryption variable requires both. Every Step 02 service also validates configuration at
use-time and fails closed, so a partially configured deployment can never reach a provider.

Boot validation lives in `lib/config/env.ts` (fail-fast, values never logged); see `.env.example`.

## 5. Operator-facing surfaces introduced

- i18n strings for approvals, files, storage, and queues (`lib/i18n/strings/en.ts::dataPlane`),
  to be consumed by Step 13 operator UIs.
- No routes added (Step 03 owns auth/routes wiring; Step 13/14 own admin and worker surfaces).

## 6. Guidelines + roadmap conformance notes

- `REQUIRED_COMMAND_ROLES` (single role matrix, deny-by-default) and `COMMAND_KINDS` (single
  command registry) are **the** canonical registries; future steps extend them in place.
- `PLATFORM_COMPANY_ID` is fixed inside 003 + `lib/db/tenant-context.ts`; the platform company
  row is created idempotently by the same migration (include in the Step 03 bootstrap seeding).
- Every privileged mutation carries an idempotency key and an execution-result JSON; execution
  replay is the idempotency contract for Step 05+ domain commands.
- `storage.supabase_bucket` configuration key is client-visible configuration (bucket names
  only; secrets never in configuration rows).
- Preview deployment: unchanged since Step 01 surfaces (no new UI). Employees of the live sandbox
  can keep the running preview; runtime modules are server-only.

## 7. Prerequisites for Step 03 (Auth + Authorization)

1. Run the live-database recipe in section 2 (migrations + assertions green).
2. Configure Supabase project URL + keys (names in section 4; service-role stays server-only).
3. Seed platform operator membership rows (Step 03 bootstrap using `command_propose` guarded
   mutation, never raw inserts).
4. Wire session issuance (Step 03) to `lib/db/clients/browser.ts` + server clients created
   here, with tenant context construction through `makeTenantContext`.
5. Route wiring should adopt `proposeAndAudit` / RPC wrappers -- never direct table writes.
6. Approval UI vocabulary is ready in `dataPlane.approvals` strings.

## 8. Commit

Exactly one conventional commit carries this step:

```
feat(platform): complete step 02 secure data plane
```
