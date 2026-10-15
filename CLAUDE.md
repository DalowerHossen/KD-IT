// path: CLAUDE.md

# KD SOLUTION IT - Live Repository Instructions for Claude

## Purpose

This file is the permanent bootstrap for Claude Code or any Claude session with live GitHub repository access. The checked-out branch and its committed files are the source of truth. Uploaded Project files, chat memory, and earlier conversation summaries must never override newer repository content.

The Claude workspace title does not change the product brand. The product name is `KD SOLUTION IT`.

## Session bootstrap

Before editing any file:

1. Confirm direct repository and terminal access.
2. Report the current branch, HEAD commit, and Git status.
3. Stay on the branch assigned to the session. Do not create, rename, or switch branches.
4. Read these committed files in order:
   - `REQUIREMENTS_ADDENDUM.md`
   - `IMPLEMENTATION_PLAN.md`
   - `REQUIREMENTS_TRACEABILITY.md`
   - `PROVIDER_RESEARCH_PROTOCOL.md`
   - `CHAT_INSTRUCTIONS.md`
   - `EXECUTION_STATUS.md`
   - `MASTER_PROMPT.md`
   - `FEATURE_LIST.md`
5. Read every accepted prior-step handoff under `docs/handoffs/` that exists on the current branch.
6. Determine the current Step from `EXECUTION_STATUS.md` and the user's current message. Never infer completion from memory.
7. Inspect existing migrations, tables, policies, services, schemas, routes, components, registries, dependencies, environment variables, and exported symbols.
8. Produce a `REUSE / EXTEND / CREATE` map before implementation.
9. If a required prior commit or handoff is absent, stop before writing code and report the exact missing prerequisite.

## Authority order

When requirements differ, use this precedence:

1. `REQUIREMENTS_ADDENDUM.md`
2. `IMPLEMENTATION_PLAN.md`
3. `REQUIREMENTS_TRACEABILITY.md`
4. `PROVIDER_RESEARCH_PROTOCOL.md`
5. `CHAT_INSTRUCTIONS.md`
6. `EXECUTION_STATUS.md`
7. `MASTER_PROMPT.md`
8. `FEATURE_LIST.md`
9. Older chat context or memory

A newer source overrides only conflicting text. All non-conflicting requirements remain mandatory.

## Sequential and gated execution

- Execute one numbered Step at a time.
- Execute one approved substep at a time.
- At the start of a Step, present the full substep plan and implement only Substep A.
- After completing and verifying a substep, stop and ask permission for the next one.
- Never begin the next substep without explicit user approval.
- Never begin the next Step until the current Step is accepted, committed, and pushed.
- Resume interrupted work from the first incomplete item. Never restart completed work.
- Do not create the final Step commit during an intermediate substep.

Use this exact gate after Substep A:

`Substep A is complete and verified. May I proceed with Substep B?`

Apply the equivalent gate after every later substep.

## Conflict and duplicate prevention

- Search the entire repository before creating any file, migration, table, function, service, schema, route, component, registry item, permission, dependency, or environment variable.
- Reuse canonical shared services for audit, approval, tenant context, money, validation, storage, encryption, idempotency, errors, logging, navigation, and payment registration.
- Extend an existing canonical artifact instead of creating a parallel implementation.
- Do not repeat an unchanged write, generation, installation, migration, or destructive command after a timeout or interruption.
- Before requesting permission for the next substep, search again for duplicate responsibilities and inspect the complete Git diff.
- Record all reused, extended, and created artifacts in the active Step handoff.

## Functional completion standard

A feature is complete only when every applicable layer works together:

`database and RLS -> generated types -> shared Zod schema -> sanitization -> business service -> permission and approval -> audit -> API or server action -> real UI -> page states -> navigation -> runtime verification`

Do not create architecture-only, type-only, database-only, UI-only, demonstration-only, or fabricated implementations.

Prohibited implementation patterns include:

- static or fabricated success responses;
- in-memory production persistence;
- mock production integrations;
- empty routes or non-functional controls;
- interfaces without real implementations;
- hidden runtime errors or ignored build failures;
- fabricated command, browser, database, provider, or sandbox evidence;
- commented-out implementation or unfinished-marker text.

When an optional external integration is not configured, keep it disabled, show an accurate configuration state, and fail the affected operation safely. Never simulate success.

## Mandatory invariants

- Product code, UI, comments, seeds, emails, PDFs, errors, and generated content are English only.
- USD is the only persisted and transacted currency.
- Database money uses `numeric(18,4)`.
- TypeScript and JSON money values remain canonical decimal strings.
- Never use JavaScript binary floating-point arithmetic for money.
- TypeScript strict mode is mandatory with no untyped escape hatch.
- Every authored file begins with its valid repository path header.
- Structured logs use correlation identifiers and PII redaction.
- Every table uses UUID v7 `id`, non-null `company_id`, `created_at`, `updated_at`, and `deleted_at`.
- Every editable record uses optimistic locking.
- Every table starts with default-deny RLS.
- Every mutation is authorized, approved, validated, transactional, and immutably audited.
- Every retryable payment operation is idempotent.
- Every client and server boundary uses a shared strict Zod schema.
- Every untrusted input is normalized, size-limited, validated, and contextually sanitized.
- Automated test source files and test directories are excluded. Use approved build, SQL assertion, security scan, browser acceptance, and sandbox verification mechanisms.
- Clients use signed token access and never receive a login role.
- Regional payment methods use only the approved generic product labels.
- Signup, payment, KYC, and administrative access enforce the required VPN, proxy, Tor, datacenter, and IP-reputation controls.

## Data and file storage

- Text and structured records always use Supabase PostgreSQL.
- File bytes never use ordinary PostgreSQL columns.
- Encrypt every file with AES-256-GCM before either provider receives it.
- Prefer Google Drive when the tenant has an enabled healthy connection.
- Prefer Supabase Storage when Google Drive is not connected.
- Use the healthy alternate provider only under the authoritative runtime policy.
- Persist `storage_provider` and integrity metadata on every file record.
- Read from the provider recorded on the file row.

## Payment provider research

Before writing or changing provider-specific code in a session:

1. Read the provider's current official API documentation from its own domain.
2. Read its current official sandbox or test-mode documentation.
3. Record retrieval date, URLs, API version, authentication, official packages, hosted card UI, token lifecycle, 3DS, idempotency, webhook verification, refunds, disputes, rate limits, and normalized errors.
4. Do not infer security-critical behavior from memory or unofficial examples.
5. Use official sandbox verification and redacted evidence.
6. Keep the adapter disabled until its declared capabilities and credential test succeed.

The application never reads, stores, proxies, logs, or tracks card number, expiry, security code, or card-field keystrokes. Payment routing is deterministic and fail-closed.

## Verification standard

Do not treat file creation, lint, or build alone as functional proof. For the active scope, run all applicable checks:

- clean dependency installation;
- formatting verification;
- lint;
- TypeScript checking;
- production build;
- forward and rollback migration validation;
- RLS, grant, constraint, tenant-isolation, and concurrency assertions;
- live application startup;
- browser preview of every delivered page;
- valid and invalid API requests;
- real Supabase persistence;
- permission, approval, audit, idempotency, and optimistic-lock behavior;
- English-only, path-header, forbidden-artifact, dependency, secret, dead-link, and duplicate scans;
- official provider sandbox paths when applicable;
- final Git diff inspection.

Report only commands and workflows actually executed with their real outcomes.

## Step completion

Only the final approved substep may complete the Step. It must:

1. Reconcile every assigned canonical requirement.
2. Update `EXECUTION_STATUS.md` truthfully.
3. Create `docs/handoffs/STEP_XX_COMPLETED.md` with factual evidence.
4. Run all mandatory gates.
5. Create exactly one conventional Step completion commit.
6. Push the assigned tracked branch without force.
7. Report the full commit identifier, branch, files, migrations, runtime evidence, external activation requirements, and next-Step readiness.

Never store secrets, credentials, private keys, real client data, or real KYC documents in Claude Project Context, chat memory, source files, commits, logs, or handoffs.
