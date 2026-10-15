// path: REQUIREMENTS_ADDENDUM.md

# KD SOLUTION IT Requirements Addendum

Version: 3.0  
Effective date: 2026-10-14  
Status: Authoritative execution baseline

## 1. Authority and conflict resolution

This addendum is the authoritative interpretation of the product owner's latest requirements. Every implementation session must read the project documents in this order:

1. `REQUIREMENTS_ADDENDUM.md`
2. `IMPLEMENTATION_PLAN.md`
3. `REQUIREMENTS_TRACEABILITY.md`
4. `PROVIDER_RESEARCH_PROTOCOL.md`
5. `CHAT_INSTRUCTIONS.md`
6. `MASTER_PROMPT.md`
7. `FEATURE_LIST.md`

A newer requirement in this addendum supersedes an older conflicting statement. A non-conflicting older requirement remains mandatory. The full feature inventory remains in scope.

## 2. Non-negotiable engineering contract

1. Product code, UI copy, comments, database seeds, emails, generated documents, and runtime documentation are English only.
2. USD is the sole persisted and transacted currency. Every monetary database value uses `numeric(18,4)`.
3. Monetary values cross TypeScript and JSON boundaries as canonical decimal strings. Financial arithmetic uses an arbitrary-precision decimal library. Binary floating-point arithmetic, numeric coercion, and floating-point formatting are prohibited for money.
4. Structured and textual records always use Supabase PostgreSQL. Files use the runtime storage policy in Section 7.
5. Automated test source files and test directories are excluded. Verification uses type checking, linting, builds, security scanners, SQL assertions, deterministic audit scripts, provider sandboxes, and documented manual acceptance runs without test-source naming patterns.
6. Unfinished markers, placeholder copy, and non-functional route shells are prohibited.
7. TypeScript strict mode is mandatory. Untyped escape hatches are prohibited.
8. Application output uses the structured logger with correlation identifiers and PII redaction.
9. Every persisted table has `id`, `company_id`, `created_at`, `updated_at`, and `deleted_at` columns under the database contract in Section 5.
10. Every table has RLS enabled and starts with no permissive policy.
11. Every state mutation produces a tamper-evident audit event in the same transactional boundary or through a transactional outbox.
12. Every API boundary has shared Zod validation on client and server. Schemas are strict and reject unknown fields unless a documented protocol requires an explicitly modeled extension map.
13. Every untrusted input is normalized, contextually sanitized, size-limited, and protected against XSS, SQL injection, CSRF, SSRF, header injection, path traversal, and mass assignment.
14. Every payment mutation requires a caller idempotency key. Incoming provider events also require provider-event idempotency.
15. Every editable record has an integer optimistic-lock version. Critical balance, inventory, sequence, and queue operations also use the appropriate database lock.
16. The authenticated role order is `super_admin`, `ceo`, `admin_staff`, `owner`, `staff`. Clients have signed token access and no login role.
17. State-changing actions use the approval contract in Section 4 before execution.
18. Regional payment methods use only the product labels `Global Payout Partners` and `Local Payment Methods via Licensed Partners`. Prohibited regional consumer-wallet brand names must not appear in product artifacts.
19. Zero Trust and Zero Tolerance controls are cross-cutting requirements, not a final-step retrofit.
20. Signup, payment, KYC, and administrative access block VPN, proxy, Tor, hostile datacenter, and unacceptable reputation traffic under a fail-closed production policy.

## 3. File path header policy

Every authored file starts with its repository path. The header must use the valid comment syntax of the file format so the artifact remains executable and parseable:

- TypeScript, JavaScript, CSS with supported block comments, and compatible source: `// path: relative/path`
- SQL: `-- path: relative/path`
- Shell, YAML, and compatible formats: `# path: relative/path`
- Markdown: `// path: relative/path`
- Formats that prohibit comments, including strict JSON, are limited to tool-required files; their path is recorded in the owning adjacent typed configuration and in the step handoff.

Tool-generated files are not manually altered when a header would invalidate integrity or regeneration.

## 4. Identity, roles, and approval model

### 4.1 Roles

- `super_admin`: final platform authority; mandatory 2FA and step-up reauthentication.
- `ceo`: platform operational authority beneath `super_admin`; mandatory 2FA.
- `admin_staff`: scoped platform worker with explicit permission grants and mandatory 2FA.
- `owner`: tenant authority with mandatory 2FA.
- `staff`: tenant employee with least-privilege permissions and tenant-enforced 2FA.
- Client: no account role; access is through scoped, revocable, expiring, HMAC-signed tokens with optional email OTP.

There is no accountant, affiliate, reseller, or client login role. Specialized platform jobs are permission bundles attached to `admin_staff`, never additional top-level roles.

### 4.2 Approval chain

Every action must present either a discrete approved command or a still-valid standing access grant that was approved through the same hierarchy. Every state-changing command is created as an immutable discrete approval request before side effects occur; it cannot rely on a standing mutation grant.

- L1 records the authenticated initiator and the tenant authority attestation when the initiator is `staff`.
- L2 requires a `ceo` approval.
- L3 requires a `super_admin` final approval.
- `admin_staff` and `owner` commands enter the same L2 and L3 chain.
- A `ceo` command still requires L3.
- A `super_admin` command requires step-up reauthentication, an explicit proposal event, and a separate final confirmation event. Critical commands require dual control when a second eligible approver exists.
- Ordinary reads require a role- and resource-scoped standing grant approved by CEO and super-admin; sensitive reads require a discrete time-bound access grant and are always audited.
- No API route, server action, queue worker, cron process, webhook, scheduled job, or administrator impersonation path bypasses approval-grant validation or the command engine.
- Rejections, expirations, delegations, escalations, and executions are immutable audit events.

Approval states, version checks, idempotency, and execution state must be transactionally consistent. A command executes once after final approval; repeated delivery returns its recorded result.

## 5. Database contract

### 5.1 Required columns

Every table, including platform-scoped and join tables, contains:

- `id uuid primary key`, generated as UUID v7 in PostgreSQL.
- `company_id uuid not null`, referencing the tenant boundary. Platform data uses the reserved platform company record rather than a null tenant.
- `created_at timestamptz not null`, in UTC.
- `updated_at timestamptz not null`, in UTC.
- `deleted_at timestamptz null`, for soft deletion.

Every editable table also contains `version integer not null default 1` with guarded updates. Append-only ledgers have an immutable sequence/version contract instead of editable updates, while retaining the required column.

### 5.2 Mandatory controls

- PostgreSQL creates UUID v7 values; clients never choose authoritative identifiers.
- Foreign keys default to `ON DELETE RESTRICT`.
- Every table enables and forces RLS where supported.
- Policies are explicit, tenant-scoped, role-scoped, and default-deny.
- Service-role access is server-only and still performs explicit tenant and permission checks.
- Every tenant query includes `company_id`; cross-tenant identifier probes return a non-enumerating response.
- Mutable unique keys use partial unique indexes that exclude soft-deleted rows.
- Every mutation writes an audit event. The audit writer avoids recursive self-auditing through a dedicated security-definer append function with tightly restricted execution rights.
- Migrations are forward and rollback pairs, idempotent where PostgreSQL permits, and follow expand-migrate-contract sequencing.
- Destructive schema changes require a data-preservation and rollback record.

## 6. USD and decimal contract

- Database money columns are `numeric(18,4) not null` with USD currency constraints.
- API money fields are fixed-scale decimal strings such as `"1250.0000"`.
- Shared Zod schemas validate sign, scale, range, and canonical form on both client and server.
- Calculations, comparisons, allocation, proration, tax, fee, payroll, wallet, journal, and reporting logic use decimal objects created from strings.
- Database drivers are configured to return numeric values as strings.
- Serialization never converts a monetary value to a JavaScript numeric primitive.
- Rounding mode and allocation remainders are centralized, deterministic, and audited.
- Provider minor-unit conversion is isolated inside each adapter and uses integer strings or arbitrary-precision decimal operations.
- Client-facing FX is read-only. The platform charge, settlement, ledger, invoice, payment, payroll, and accounting records remain USD.

## 7. Storage policy

### 7.1 Source of truth

- Text, metadata, status, ownership, hashes, encryption envelopes, and accounting data always reside in Supabase PostgreSQL.
- File bytes never reside in ordinary PostgreSQL columns.
- Every file is encrypted before it reaches either storage provider.
- Every file record stores `storage_provider`, provider object identifier, ciphertext hash, plaintext content hash protected as sensitive metadata, byte length, MIME type, encryption key version, nonce, authentication tag metadata, migration state, and optimistic-lock version.
- A legacy feature row that names Google Drive for an ordinary file upload is interpreted as a call to this runtime file service: Google Drive when tenant-connected and healthy, otherwise Supabase Storage. Rows specifically about connecting, monitoring, or migrating Google Drive remain Google Drive-specific.

### 7.2 Runtime provider selection

The storage router evaluates the tenant on every upload:

1. If the tenant has an enabled and healthy Google Drive connection, Google Drive is the preferred provider.
2. If Google Drive is not connected, Supabase Storage is the preferred provider.
3. If the preferred provider is temporarily unavailable and the alternate provider is configured and healthy, the encrypted payload automatically uses the alternate provider.
4. If neither provider is available, the upload fails closed without persisting plaintext or incomplete metadata.
5. Reads use the provider recorded on the file row, not the tenant's current default.

A missing Google Drive connection never blocks normal file functionality when Supabase Storage is healthy. This means a tenant without Google Drive keeps structured data in PostgreSQL and encrypted files in Supabase Storage.

### 7.3 Encryption and migration

- File encryption uses AES-256-GCM with a unique cryptographically secure nonce per encryption operation.
- Master key material is environment-managed and never stored in the database.
- Per-tenant and per-file data keys use versioned envelope encryption and authenticated context containing company, file, category, and key version identifiers.
- Upload streaming, content validation, malware quarantine, MIME and magic-byte checks, image metadata stripping, PDF active-content removal, quota enforcement, and checksum verification occur before publication.
- The provider migration tool copies encrypted objects, verifies hashes, atomically changes the file record, records the old and new providers, and deletes the old object only after the retention window and final approval.
- Every upload, read, download, migration, restore, quarantine, and deletion is authorized and audited.

## 8. Authentication lock contract

- Two consecutive failed password or 2FA verification events lock the account for exactly two hours.
- The counter and lock timestamps are stored in PostgreSQL and updated with race-safe transactions so restarts do not reset them.
- Password and 2FA failures contribute to one consecutive authentication-failure sequence.
- A successful credential check cannot bypass an active lock.
- Password reset is unavailable during an active lock.
- Changing the password does not clear an active lock.
- The account holder receives an email alert when a lock starts, without exposing secrets or unsafe recovery links.
- User-facing failure responses do not disclose whether the account exists, which factor failed, or whether a lock is active.
- IP, device, account, and endpoint rate limits operate in addition to the account lock.
- Unlock requires an explicit permission held by an eligible platform administrator, evidence that owner contact was confirmed by email, step-up 2FA, the full approval chain, a reason, and an immutable audit event.
- Unlocking clears the active lock only after final approval; historical attempts remain immutable.

## 9. Payment processor catalog

The code-defined catalog contains exactly these sixteen adapters, each in a separate file, plus one registry that exposes only implemented adapters:

1. Stripe
2. NMI
3. Adyen
4. Verifone 2Checkout
5. Braintree by PayPal
6. BlueSnap
7. Square
8. Payoneer
9. FastSpring
10. Paddle
11. PayPro Global
12. PayPal standalone
13. Payarc or PaymentCloud
14. Rapyd
15. Authorize.Net
16. Custom HTTPS gateway

Braintree and standalone PayPal are distinct adapters. Payarc or PaymentCloud is one catalog position with a capability record based on the contracted API. The Custom adapter never hardcodes provider-specific behavior.

The database cannot create a provider type outside this code-defined catalog. Unknown provider identifiers are rejected. The registry is the only adapter construction path.

## 10. Official documentation gate

Before writing or changing any provider-specific code in a new implementation session, the implementer must:

1. Fetch the current official provider API documentation from the provider's own domain.
2. Fetch current official sandbox or test-mode documentation.
3. Record retrieval date, URLs, API version, authentication, test credentials flow, hosted card UI, token lifecycle, 3DS support, idempotency, webhook verification, refunds, disputes, rate limits, and normalized errors.
4. Record the exact official SDK or browser package and version when one is required.
5. Compare the research record with the shared adapter contract and capability matrix.
6. Stop provider implementation when an official source cannot establish a security-critical behavior; no behavior may be invented from memory.
7. Re-read official documentation in a later session before modifying that adapter again.

Community articles, copied snippets, search-result summaries, and model memory are not implementation authority. `PROVIDER_RESEARCH_PROTOCOL.md` defines the evidence format and starting URLs.

## 11. NMI dual-mode contract

- NMI supports `collect_js` and `payment_component` frontend modes.
- `collect_js` is the default.
- Collect.js payment tokens are treated as single-use and expire after 24 hours.
- The Payment Component uses the current official npm package only after an integrator-owned dependency request is researched, approved, recorded, and applied to the package manifest.
- Both frontend modes produce a tokenized server request handled by one shared NMI REST payment module.
- The application and server never receive raw card number, expiry, or security code data.
- A super administrator can test and switch the active NMI mode from the gateway control page.
- Exactly one mode is active at a time.
- A target mode must pass an authenticated sandbox connection and payment-capability check before activation.
- Mode tests and mode changes require 2FA, fresh reauthentication, approval, optimistic locking, and immutable audit events.
- A failed test leaves the existing mode unchanged.

## 12. Super administrator gateway control plane

The gateway control page is available only to `super_admin` and requires mandatory 2FA plus fresh identity verification.

For a code-defined adapter, it can:

- accept the provider's modeled credential fields;
- validate and sanitize the submission on client and server;
- encrypt secrets with AES-256-GCM before database persistence;
- use a versioned encryption key supplied only by server environment configuration;
- run the adapter's non-destructive official test operation;
- enable an adapter only after a successful current test;
- disable an adapter;
- select exactly one active supported frontend or processing mode for each enabled provider;
- require a successful target-mode test before every provider mode change;
- show only masked terminal characters, update time, test time, test result category, active mode, and actor;
- rotate credentials without displaying the stored value;
- produce approval and audit records for every attempt and change.

Stored keys are never displayed again, returned to browsers, included in logs, sent to monitoring, or written to audit metadata. Decryption occurs only in the server adapter invocation boundary.

Routing is deterministic and fail-closed. If no enabled adapter satisfies every configured rule, the payment is rejected. The router never silently tries another processor.

## 13. Card data, attempt, and verification controls

### 13.1 Card-data boundary

- Card number, expiry, and security code are entered only in provider-hosted fields, hosted checkout, or the provider's security-reviewed component.
- Platform code and servers never read, store, proxy, log, analyze, or capture keystrokes for card data.
- Behavioral telemetry excludes every payment credential field and its surrounding sensitive interaction data.
- Stored identifiers are provider tokens, HMAC-protected token references, or provider card fingerprints. Raw card data and reversible card identifiers are prohibited.

### 13.2 Duplicate and failure guards

- After one successful payment by a card fingerprint for an invoice, that fingerprint cannot pay the same invoice again for 24 hours.
- The same card may pay a different invoice, subject to normal risk and velocity controls.
- Card-related and authentication failures are counted per protected token or fingerprint for a rolling 24-hour window.
- Wrong card details, wrong security code, wrong authentication code, and failed 3DS count toward the limit.
- Insufficient-funds failures do not count.
- After two counted failures, the third attempt is rejected for the remainder of the rolling window.
- A provider fraud signal or internal token or fingerprint blacklist rejects immediately.
- Blacklists never use raw card numbers.
- Configured card, token, account, invoice, IP, device, company, and global velocity limits are enforced atomically.

### 13.3 3DS and location matching

- Request 3D Secure whenever the adapter supports it.
- If 3DS is not completed, payment can proceed only when both the billing postal code and payer IP country match the immutable invoice identity data.
- If either comparison fails or cannot be established, funds are not captured and the attempt enters manual review.
- Where authorization occurs before the mismatch is known, the adapter voids the authorization and records the result.
- VPN, proxy, Tor, hostile datacenter, and unacceptable IP reputation traffic is blocked on the payment page and payment APIs.

### 13.4 Webhooks and idempotency

- Webhook handlers preserve the raw body when required by the official signature algorithm.
- Signature, timestamp tolerance, origin constraints when supported, payload schema, company mapping, and event identity are verified before processing.
- Invalid signatures receive no business processing.
- Valid duplicate events return the provider-appropriate success response and reuse the recorded result.
- Payment creation, capture, refund, void, payout, mode test, credential test, and provider webhook side effects are idempotent and audited.

## 14. Security baseline

- Zero Trust verifies identity, tenant, permission, approval, device, network, session, request integrity, and resource ownership at every boundary.
- Zero Tolerance events terminate or quarantine the request, revoke affected sessions where appropriate, record evidence, and alert authorized responders.
- CSP is nonce-based and minimizes provider origins through an adapter capability allowlist.
- CSRF protection applies to browser mutations; same-site secure cookies and origin checks are mandatory.
- SQL is parameterized. RLS remains the final database tenant boundary.
- Rich text is sanitized on input and output. Plain text is normalized and contextually encoded.
- SSRF protections resolve and re-check DNS, block private and metadata networks, restrict protocols and ports, and enforce allowlists.
- Secrets are server-only, encrypted at rest, redacted, versioned, and access-audited.
- Production strict endpoints fail closed when required risk intelligence is unavailable.
- Security controls are implemented with privacy minimization: no card-field telemetry, no secret capture, and no unnecessary sensitive behavioral collection.

## 15. Dependency and integration ownership

- The package manifest and lockfile have one logical integrator owner.
- A feature implementer records a dependency request with official source, exact package, exact version, license, security review, bundle or runtime impact, and reason.
- The integrator validates the request against the official package registry and provider documentation before changing the manifest.
- The NMI Payment Component always follows this process.
- Exact production dependency versions and lockfile integrity are required.
- Duplicate libraries for the same responsibility require an explicit architecture decision.
- Shared contracts, database primitives, navigation, permissions, provider registry, environment schema, and package files are changed only through their documented extension points.

Each Arena session stays on its assigned tracked branch and treats that branch as the integration baseline. It does not create or switch branches. Each completed step is committed once with a conventional commit and pushed without force.

## 16. Production service matrix

### Always required

- Supabase PostgreSQL and Auth
- AES-256-GCM master and versioned wrapping keys
- Application base URL and secure cookie configuration
- At least one healthy file provider; Supabase Storage satisfies this when Google Drive is not connected
- Universal SMTP for authentication, lock, approval, payment, and security messages
- Cloudflare Turnstile for protected public flows
- VPN, proxy, Tor, and IP reputation intelligence for strict endpoints
- Sentry with PII scrubbing

### Runtime optional by tenant or capability

- Google Drive connection; files automatically remain in encrypted Supabase Storage when absent
- Individual payment provider credentials; an adapter remains disabled until credentials pass its official test
- WhatsApp, social, analytics, bank-feed, commerce, OCR, and SIEM connectors

### Deployment targets

- Netlify is primary.
- Docker and VPS are supported alternatives with behavior parity.
- Cloudflare provides edge security, DNS controls, and Turnstile.

Missing mandatory production configuration fails startup or the affected strict operation safely. Development uses documented provider test credentials and official sandbox modes; fabricated secrets are never committed.
