<!-- path: docs/handoffs/STEP_03_COMPLETED.md -->

# STEP 03 -- Auth, Authorization, and Settings -- Completion Handoff

> Date: 2026-10-16 - Owner: platform integration agent (guided by Steps 00-15 planning docs)
> Status: **Accepted** -- all local gates green (typecheck, lint, format, scans, build). Live
> databases + Supabase are not reachable from the execution sandbox, so the live acceptance
> suites skip cleanly and run unchanged wherever the Step 02 data-plane recipe is satisfied
> (documented below).

## 1. What shipped

Step 03 is delivered as substeps A-P, each gated by its own offline + live acceptance suite
(`scripts/acceptance/step-03a` ... `step-03p`). The database foundation is twelve paired
migrations (`supabase/migrations/009` - `020`, every change with a `.down.sql`), on top of the
Step 02 data plane.

### A. Identity and authorization (`009_identity_authorization`)

- Signup with email + password through Supabase Auth, mapped to a `profiles` row and an owner
  membership in a newly created workspace; identity is never stored outside Supabase.
- Role/permission matrix in `lib/auth/permissions.ts` consumed by `requirePermission`
  (tenant-scope) and `requirePlatformContext` / `requireTenantContext` guards; deny-by-default,
  per-role.
- Password history + password-change rules (`lib/db/repositories/password-history.ts`),
  structured conflict + non-enumerating error surfacing.

### B. Auth lifecycle (`010_auth_lifecycle`)

- Login, session + device tracking (`auth_sessions`, `auth_devices`), verify-email, and
  password reset (all with token TTLs and single-use semantics).
- TOTP two-factor: enroll, challenge, verify, and the `@experimental` recovery-codes API
  (`lib/auth/mfa.ts`); aal1/aal2 enforcement with a server-side sign-in challenge step and a
  signed-out-all-sessions invariant on factor verification.

### C-D. Lockout and account unlock (`011_auth_lockout`, `012_account_unlock`)

- Progressive sign-in lockout (`auth_locks`, `auth_attempts`) with backoff, a non-enumerating
  failure path, and a self-service + operator approval-gated account-unlock command flow
  (`app/api/security/account-unlock/{request,execute}`).

### E. Onboarding

- Post-signup onboarding: workspace naming, contact details, and team bootstrap (owner becomes
  the first member; a platform-operator singleton is seeded idempotently).

### F-G. Team and invitations

- Workspace member management (`lib/company/members*`, `memberships`): invite (request + approval
  gate), role change, suspend/restore, with optimistic versioning and audit.

### H. Email delivery / SMTP (`013_email_delivery`)

- Provider-agnostic email router (`lib/email/`) with a `supabase` default and a universal SMTP
  adapter (`lib/email/adapters/smtp.ts`); transactional templates for verify/reset/invites/approvals.

### I. Plans and entitlements (`014_plans_entitlements`)

- Plan catalog, per-workspace subscription, and entitlement evaluation that gates features
  (e.g. `backups`) at the boundary; canonical decimal money as strings (`lib/money`).

### J. Notifications (`015_notifications`)

- Tenant + per-user notification inbox, unread counts, and mark-read
  (`lib/notifications/repository.ts`); notification vocabulary extended for KYC events (substep O).

### K-L. Coupons (`016_coupons`)

- Coupon issue / validate / apply with canonical-decimal discount handling and audit.

### M. Tenant settings (`017_tenant_settings`) + custom domains (`018_custom_domains`)

- Optimistic versioned company profile + invoice settings (`lib/company/profile.ts`,
  `lib/company/invoice-settings.ts`); custom domain claim + TXT-verification workflow
  (`lib/company/domains.ts`).

### N. Encrypted backups (`019_backup_requests`)

- Approval/entitlement-gated encrypted backup requests (`lib/company/backups.ts`) fulfilled to
  the Step 02 storage pipeline, with a tenant-only download of the decrypted export.

### O. KYC (`020_kyc_applications`)

- Identity-verification applications with Step 02 envelope-encrypted details + "kyc" documents
  (`lib/company/kyc.ts`, `lib/crypto/envelope-format.ts` shared wire format), a platform review
  queue, approval-gated decision command chain, resubmission, sanctions screening, and expiry.

### P. Settings UI + tenant file upload (this final substep)

- Full settings UI: a `/settings` hub plus six client components (`components/settings/`) with
  complete loading/error/empty/ready states, field-level errors, i18n, and mobile-responsive
  layouts -- `ProfileForm`, `InvoiceSettingsForm`, `DomainsPanel`, `BackupsPanel`, `KycPanel`,
  `NotificationsPanel` -- each wired to the APIs above via the shared `auth-client` envelope.
- New tenant file-upload route `app/api/company/files` (same-origin + working context + category
  schema + Step 02 `uploadEncryptedFile`, 100 MB cap), used by the KYC flow.
- i18n `settings` section + navigation-map registration (hub in the sidebar; sub-routes for
  breadcrumbs/command palette).

## 2. Verification evidence (this checkout, 2026-10-16)

| Gate                         | Command                                    | Result                                                               |
| ---------------------------- | ------------------------------------------ | -------------------------------------------------------------------- |
| Typecheck                    | `npm run typecheck`                        | PASS (`next typegen` + `tsc --noEmit`)                               |
| Lint                         | `npm run lint`                             | PASS (eslint `--max-warnings=0`)                                     |
| Format                       | `npm run format:check`                     | PASS (Prettier, all files)                                           |
| English-only                 | `npm run scan:english`                     | PASS                                                                 |
| Path headers                 | `npm run scan:headers`                     | PASS                                                                 |
| No tests                     | `npm run scan:tests`                       | PASS                                                                 |
| No unfinished markers        | `npm run scan:markers`                     | PASS                                                                 |
| Navigation integrity         | `npm run scan:routes`                      | PASS (17 registered paths across 19 routes)                          |
| Migration conventions        | `npm run scan:migrations`                  | PASS (20 paired migrations, 35 tables, RLS/search_path/policy lint)  |
| Build                        | `npm run build`                            | PASS (compiles; all `/settings/*` + `/api/company/*` routes present) |
| Step 03 acceptance (offline) | `npm run acceptance:step03a` ... `step03p` | PASS (per-substep offline suites)                                    |
| Step 03 acceptance (live)    | same, with data-plane env                  | SKIP in sandbox (no DB); runs unchanged with credentials             |

Live-database recipe (run where `KD_DATABASE_URL` + Supabase + encryption are configured):

```sh
npm run db:migrate          # apply 009-020 (idempotent, checksummed)
npm run db:assert           # SQL assertions (run inside a rolled-back transaction)
npm run acceptance:step03a  # ... through ...
npm run acceptance:step03p  # offline suite + live-db suite (16 suites)
```

## 3. Decisions, deviations, and evidence notes

1. **Acceptance-verification honesty:** the execution sandbox has no running database and no
   network-reachable Postgres, so -- rather than ship a credentialed DB or weaken checks -- each
   substep ships (a) its migrations, (b) an offline acceptance suite that passes here, and (c) a
   live suite that runs unchanged wherever the Step 02 data-plane recipe is satisfied. The live
   suites build a throwaway workspace and delete every probe row afterwards.
2. **Auth is Supabase-owned:** the app never stores passwords or sessions; it maps Supabase Auth
   identities to `profiles` + `memberships` and enforces aal2 + permissions server-side.
3. **Storage refactor:** two Step 02 adapters (`lib/storage/google-drive.ts`,
   `supabase-storage.ts`) were refactored from parameter properties to explicit fields so the
   Node strip-only acceptance loader can parse them; behavior is unchanged (Step 02 gates re-verified).
4. **Money:** canonical decimal strings end-to-end (no `parseFloat` on the monetary path),
   matching the Step 02/01 contract.
5. **Non-enumerating failures:** sign-in, unlock, and cross-tenant reads surface generic
   permission/credential errors (no account-existence oracle).
6. **No framework/version changes:** only additive runtime deps (Supabase client, `pg`,
   `decimal.js` from Step 02) and no new framework versions; engines + lockfile committed.

## 4. Environment variables (names only)

Step 03 consumes the Step 02 data-plane set (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `KD_DATABASE_URL`, `KD_ENCRYPTION_MASTER_KEY`,
`KD_ENCRYPTION_KEY_VERSION`, `KD_DATA_PLANE_ENABLED`) and **adds** the email/SMTP set:

| Variable            | Purpose                        | Required when                      |
| ------------------- | ------------------------------ | ---------------------------------- |
| `KD_EMAIL_PROVIDER` | `supabase` (default) or `smtp` | when custom email delivery is used |
| `KD_SMTP_HOST`      | SMTP relay host                | `KD_EMAIL_PROVIDER=smtp`           |
| `KD_SMTP_PORT`      | SMTP relay port (1-65535)      | `KD_EMAIL_PROVIDER=smtp`           |
| `KD_SMTP_SECURE`    | `true`/`false` TLS             | `KD_EMAIL_PROVIDER=smtp`           |
| `KD_SMTP_USERNAME`  | SMTP auth user                 | `KD_EMAIL_PROVIDER=smtp`           |
| `KD_SMTP_PASSWORD`  | SMTP auth password             | `KD_EMAIL_PROVIDER=smtp`           |

Boot validation lives in `lib/config/env.ts` (fail-fast, values never logged); see `.env.example`.

## 5. Operator-facing surfaces introduced

- The authenticated dashboard: `/settings` (+ profile, invoice, domains, backups, kyc,
  notifications), `/team`, `/account`, `/security/mfa`, and the auth pages (login, signup,
  verify-email, forgot/reset password, MFA setup/verify).
- i18n strings for the settings areas (`lib/i18n/strings/en.ts::settings`) + navigation-map
  entries for breadcrumb/command-palette composition.

## 6. Guidelines + roadmap conformance notes

- `REQUIRED_COMMAND_ROLES` + `COMMAND_KINDS` remain the canonical registries; Step 03 added its
  command kinds in place (`lib/commands/types.ts`).
- The platform-operator singleton is seeded idempotently (Step 02 note 7) and used for operator
  approval flows; no raw operator inserts.
- Every privileged mutation carries an idempotency key + execution-result JSON; replay is the
  idempotency contract reused by Step 05+ domain commands.
- Preview deployment is unchanged for the data plane (server-only modules); the new surfaces are
  the authenticated UI above.

## 7. Prerequisites for Step 04 (Invoicing, documents, PDF, print)

1. Run the live-database recipe in section 2 (migrations + assertions green).
2. Configure Supabase + encryption (names in sections 1-4) and, for real email, the SMTP set.
3. Reuse `requirePermission` + the working-context guards for invoice/document routes; never
   direct table writes.
4. Consume canonical decimal money (`lib/money`) for all amounts; amounts are strings.
5. Use the Step 02 storage pipeline (`uploadEncryptedFile` / signed delivery) for generated
   documents and the `app.api/company/files` pattern for tenant uploads.

## 8. Commit

Exactly one conventional commit carries this step:

```
feat(platform): complete step 03 auth, roles, and settings
```
