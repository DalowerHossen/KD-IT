// path: IMPLEMENTATION_PLAN.md

# KD SOLUTION IT - 16-Step Implementation Plan

Version: 3.0  
Effective date: 2026-10-14  
Execution model: one numbered step per new chat, sequentially

## 1. Plan objective

The platform is divided into exactly sixteen implementation steps. Each step owns a non-overlapping domain, extends only published shared contracts, creates a completion handoff, runs all available quality gates, creates one conventional commit, and pushes the Arena-assigned integration baseline branch.

No implementation step may start until its prerequisite step commit and handoff are present. Before editing files, each chat must break its assigned step into the substeps listed here and inspect the repository for already completed work. Existing correct work is extended rather than recreated.

## 2. Cross-step delivery contract

Every step applies all of these controls to its own scope:

- English-only source, UI, comments, seeds, emails, and generated content.
- USD-only decimal-string boundaries and PostgreSQL `numeric(18,4)` money.
- TypeScript strict mode with explicit return types and no untyped escape hatch.
- Shared Zod schemas used by client and server.
- Input normalization, contextual sanitization, CSRF, XSS, injection, SSRF, and mass-assignment controls.
- Tenant isolation, default-deny RLS, ownership checks, and non-enumerating failures.
- UUID v7 identifiers and mandatory table metadata columns.
- Audit records for mutations and sensitive access.
- Approval-chain enforcement before state-changing side effects.
- Idempotency for payment and externally retried operations.
- Optimistic locking for editable records and database locks for critical concurrency.
- Structured logging, correlation identifiers, redaction, and Sentry capture.
- Loading, error, empty, and success states for every delivered page.
- Keyboard accessibility, screen-reader semantics, responsive behavior from 320px, dark mode, high contrast, and reduced motion.
- No non-functional route, fake integration, fabricated credential, or unfinished copy.
- No automated test source files. Verification uses the approved non-test quality mechanisms.
- Valid path header at the beginning of every authored file.

## 3. Integration ownership map

| Shared asset | Initial owner | Later extension rule |
|---|---|---|
| `package.json` and lockfile | Step 01 integrator | Recorded dependency request and integrator review only |
| TypeScript, Next.js, Tailwind, lint, formatting | Step 01 | Extend without weakening gates |
| Environment schema and example | Step 01 | Owning step adds validated variables and documentation |
| Database base functions and migration conventions | Step 02 | Later migrations consume, not duplicate, primitives |
| Tenant context, RLS helpers, audit, command approval | Step 02 | Later domains register actions and policies |
| Auth roles and permission registry | Step 03 | Later steps add permission constants through registry |
| Storage adapters and encryption envelope | Step 02 | Later modules call the storage service only |
| Navigation map and route metadata | Step 01 | Every page-owning step registers complete routes |
| Payment adapter contract and registry | Step 06 | Steps 07-10 register concrete adapters only |
| Public API conventions and outgoing webhooks | Step 12 | Domain steps expose services through shared conventions |
| Admin shell and platform configuration UI | Step 13 | Gateway control remains owned by Step 06 |
| Accounting posting contract | Step 14 | Payment and payroll events integrate through the posting interface |
| Security policy engine and SIEM | Step 15 | Earlier steps emit normalized security and audit events |
| Deployment, cron registry, and release evidence | Step 16 | Earlier steps register jobs and operational needs |

## Step 01 - Repository foundation, design system, and shared application shell

### Objective

Create the production-grade Next.js foundation and the shared visual, validation, logging, configuration, and navigation contracts that every later step consumes.

### Substeps

1. Inventory repository state and preserve authoritative planning documents.
2. Initialize the supported Next.js App Router and strict TypeScript project with exact dependency versions and a committed lockfile.
3. Establish environment validation, server/client boundary rules, module aliases, formatting, linting, English-only checks, forbidden-artifact checks, and dependency ownership records.
4. Create structured logging, correlation identifiers, typed error taxonomy, standard API envelope, shared Zod helpers, and safe configuration access.
5. Build Tailwind and shadcn-based design tokens, typography, spacing, color, radius, shadow, z-index, motion, responsive, dark, high-contrast, and reduced-motion systems.
6. Build complete reusable UI primitives for forms, page states, dialogs, drawers, tables, pagination, filters, command palette, breadcrumbs, notifications, and accessible focus management.
7. Establish public, auth, dashboard, admin, and token-portal layout contracts without creating incomplete feature routes.
8. Create the central navigation map, route metadata types, permission hooks, PWA metadata foundation, global error handling, and secure baseline headers.
9. Run lint, type checking, production build, dependency audit, English scan, path-header scan, route scan, and prohibited-artifact scan.

### Ownership boundary

Step 01 owns project manifests, build configuration, base design tokens, shared UI, global layouts, navigation contracts, error envelopes, logger, and correlation infrastructure. It does not create business tables, authentication flows, payment adapters, or incomplete product pages.

### Completion gate

The application builds from a clean install, all base layouts render with real English copy and complete states, shared components are accessible and responsive, environment parsing fails safely, and all quality scripts pass without test-source files.

## Step 02 - Supabase data plane, tenancy, audit, approvals, encryption, and storage

### Objective

Create the secure multi-tenant persistence layer and runtime file system used by every domain.

### Substeps

1. Define migration and rollback conventions, PostgreSQL extensions, UUID v7 generation, UTC timestamp triggers, optimistic-lock helpers, and the reserved platform company.
2. Create foundational companies, memberships, command approvals, audit chain, idempotency, outbox, configuration, rate-limit, file metadata, storage connection, quarantine, and migration-job tables.
3. Enable and force RLS on every table, establish default-deny policies, tenant security-definer helpers, service-role guardrails, indexes, constraints, soft deletion, and audit triggers without recursion.
4. Implement strict Supabase browser, server, and privileged clients with explicit column selection, tenant context, correlation context, transaction boundaries, and non-enumerating ownership checks.
5. Implement canonical decimal-string money utilities and PostgreSQL numeric parsing without binary floating-point conversion.
6. Implement AES-256-GCM envelope encryption, key versions, secret redaction, tenant and file key derivation, rotation metadata, and access auditing.
7. Implement Google Drive and Supabase Storage adapters, tenant runtime selection, encrypted upload and download, automatic alternate-provider use, provider health, file metadata, signed delivery, and provider migration.
8. Implement file security: size and quota controls, MIME and magic-byte agreement, filename normalization, malware quarantine hook, image metadata stripping, PDF active-content handling, duplicate hash detection, and checksum verification.
9. Implement the transactional command and approval foundation, immutable audit append path, outbox worker contract, and background queue locking contract.
10. Validate forward and rollback migrations with SQL assertions, inspect RLS and grants, and run all available Step 01 gates.

### Ownership boundary

Step 02 owns database primitives, tenant context, RLS helpers, audit append, approval command foundation, cryptography, storage adapters, file service, and base queue primitives. It does not own domain tables beyond the shared platform records required by these services.

### Completion gate

A tenant can store and retrieve an encrypted file through Google Drive when connected and Supabase Storage when not connected; provider failover and migration preserve ciphertext integrity; cross-tenant access is denied; every foundational mutation is versioned, approved, and audited.

## Step 03 - Authentication, role hierarchy, lockout, onboarding, settings, SMTP, and KYC

### Objective

Deliver complete identity and tenant-administration journeys on the Step 02 security foundation.

### Substeps

1. Implement the five authenticated roles, specialized `admin_staff` permission bundles, least-privilege permission matrix, route authorization, and approval registration.
2. Implement Supabase email/password authentication, verification, secure password recovery, password history, breached-password checks, session rotation, device/session management, logout, and account lifecycle.
3. Implement TOTP 2FA, backup codes, recovery, mandatory and step-up policies, OAuth account linking, and fresh reauthentication for critical actions.
4. Implement the exact two-failure, two-hour database-persistent account lock across password and 2FA; block reset during lock; preserve lock after password change; issue generic responses and email alerts.
5. Implement permissioned unlock with email-contact evidence, step-up 2FA, CEO and super-admin approval, optimistic locking, and immutable audit history.
6. Implement IP, account, device, and endpoint rate limiting; Turnstile; VPN, proxy, Tor, hostile datacenter, and reputation blocking for signup, KYC, and administration.
7. Implement universal SMTP adapters, encrypted credentials, connection verification, tenant and platform routing, queues, retries, bounce handling, suppression, deliverability records, and complete English templates.
8. Implement signup and company onboarding, profile and invoice settings, owner and staff invitations, team security, notifications, custom domains, plan subscriptions, coupons, entitlements, security settings, and encrypted backup requests.
9. Implement KYC upload and review, expiration, sanctions workflow hooks, approval states, and feature gating through Step 02 storage.
10. Complete all auth and settings page states, accessibility, mobile behavior, audit events, security events, and quality gates.

### Ownership boundary

Step 03 owns identity, sessions, roles, permissions, team administration, account lock and unlock, SMTP, onboarding, KYC, tenant settings, custom domains, notifications, and platform subscription settings. Provider credential control is reserved for Step 06.

### Completion gate

Every authenticated role reaches only its permitted complete routes; account lock behavior matches the authoritative contract under concurrent failures; all critical changes require approval; security notifications send through verified SMTP; KYC and tenant onboarding are fully usable.

## Step 04 - Invoicing, documents, numbering, PDF, recurring billing, and print

### Objective

Deliver the immutable, audit-ready invoice and commercial document engine.

### Substeps

1. Create invoice, line-item, sequence, tax snapshot, attachment, event, revision, estimate, credit note, debit note, proforma, deposit, recurrence, installment, and immutable document-snapshot schemas with RLS and audit controls.
2. Implement decimal-only invoice calculation, discount, tax, shipping, allocation, deterministic rounding, and USD validation.
3. Implement invoice CRUD, dynamic lines, draft autosave, duplicate detection, optimistic conflict resolution, staff proposal, approvals, and immutable sent or paid revisions.
4. Implement gap-controlled tenant numbering with PostgreSQL advisory locks and safe cancellation rules.
5. Implement estimate approval, conversion, recurring schedules, installment plans, credit and debit workflows, reminders, late fees, and billing lifecycle events.
6. Implement the professional US-style invoice layouts, tenant branding, complete metadata, payment instructions, consent versions, accessibility, and print styles.
7. Implement server-side PDF generation, font embedding, optimization, hash and signature metadata, encrypted storage, snapshots, retention, and download authorization.
8. Register complete dashboard and API routes with shared validation, approval, audit, rate limiting, idempotency where retried, and all page states.
9. Verify concurrent numbering, decimal invariants, immutable revisions, PDF hashes, responsive forms, print output, and migration rollback through approved quality mechanisms.

### Ownership boundary

Step 04 owns invoices and commercial documents, document numbering, PDF rendering, immutable snapshots, recurrence, installments, print behavior, and document attachments. Projects and time tracking are owned by Step 05; public token access is owned by Step 11.

### Completion gate

An approved invoice can be created, rendered, stored, sent through the event contract, revised under immutable rules, and downloaded as a hash-verifiable encrypted PDF without money precision loss or numbering races.

## Step 05 - CRM, products, inventory, suppliers, projects, commerce, tax, dashboards, and reports

### Objective

Deliver the tenant business-management modules that surround invoicing.

### Substeps

1. Implement client CRM, contacts, addresses, notes, tags, communication timeline, statements, import/export, duplicate matching, merge, retention, and deletion rules.
2. Implement product and service catalog, categories, pricing, SKU uniqueness, stock-aware line selection, and duplicate detection.
3. Implement inventory, warehouses, transfers, adjustments, counts, reorder controls, valuation, serial or batch metadata, and row-locked stock movements.
4. Implement suppliers, vendor master, purchase orders, receiving, bills, supplier payments, and three-way matching hooks.
5. Implement projects, tasks, time tracking, billable approval, expenses, and invoice conversion.
6. Implement Shopify and WooCommerce synchronization through isolated adapters, signed webhooks, cursors, conflict rules, retries, and audit events.
7. Implement USD tax definitions and immutable tax snapshots, international and regional display requirements without changing the USD accounting base.
8. Implement tenant dashboards, charts, saved views, sales, payment, expense, tax, client, inventory, and project reports with server-side filter, sort, cursor pagination, and exports.
9. Implement batch invoice and bulk operations with preview, approval, idempotent batch identity, per-item result, and reversible safe operations.
10. Complete responsive and accessible UI, APIs, RLS, approvals, audits, concurrency, duplicate controls, and quality gates.

### Ownership boundary

Step 05 owns CRM, catalog, inventory, warehouse, supplier, procurement, project, time, commerce synchronization, business tax configuration, tenant dashboards, operational reports, and bulk operations. General public APIs are owned by Step 12 and accounting journals by Step 14.

### Completion gate

Tenant business operations integrate with invoices through typed services, stock and numbering remain race-safe, duplicates are controlled, reports preserve decimal precision, and every domain is tenant-isolated and approval-driven.

## Step 06 - Payment core, risk controls, hosted UI boundary, and gateway control plane

### Objective

Build the provider-neutral payment architecture and all authoritative card, routing, credential, idempotency, and webhook controls before concrete adapters are added.

### Substeps

1. Create payment intent, attempt, transaction, allocation, refund, void, provider event, credential envelope, connection test, routing rule, mode, fingerprint guard, failure counter, blacklist, velocity, manual review, and reconciliation schemas.
2. Define the sixteen provider identifiers, strict adapter interface, capability matrix, normalized request and result unions, normalized error taxonomy, and constructor registry that exposes only concrete registered adapters.
3. Implement decimal-safe payment commands, mandatory idempotency, optimistic and row locking, transactional outbox, duplicate prevention, and immutable payment state transitions.
4. Implement deterministic routing with explicit rules, no implicit processor fallback, KYC and entitlement checks, and fail-closed behavior when no rule matches.
5. Implement provider-hosted field and checkout boundaries, CSP capability allowlists, secure return-state verification, and complete payment page states without reading card data or card-field keystrokes.
6. Implement 3DS preference and fallback matching, invoice and fingerprint 24-hour success guard, two-failure rolling guard, insufficient-funds exclusion, token and fingerprint blacklists, velocity controls, VPN and network risk checks, and manual review.
7. Implement raw-body webhook dispatch, signature-first provider handlers, timestamp checks, schema validation, event idempotency, replay protection, and audited state transitions.
8. Implement the super-admin gateway control page with fresh authentication, 2FA, encrypted credentials, masking, non-destructive connection tests, enable or disable, mode selection, approvals, version checks, and audits.
9. Define the dependency request and provider research evidence integration used by Steps 07-10.
10. Verify the provider-neutral state machine, access controls, money contract, router denial behavior, card-data boundary, and quality gates without simulating unsupported provider behavior.

### Ownership boundary

Step 06 owns payment domain schemas, base contract, registry, router, gateway control plane, card and risk guards, common checkout shell, webhook dispatcher, and provider credential vault. It contains no guessed provider-specific request or signature logic.

### Completion gate

The core rejects unknown or disabled adapters, denies unmatched routing, protects card boundaries, enforces all rolling guards atomically, stores only encrypted credentials and protected card references, and processes a contract-level payment lifecycle idempotently.

## Step 07 - Provider wave A: Stripe, NMI, Adyen, and Verifone 2Checkout

### Objective

Implement and register the first four concrete payment adapters using current official documentation and official sandbox evidence.

### Substeps

1. Research and record official API and sandbox evidence for Stripe, NMI, Adyen, and Verifone 2Checkout before touching provider code.
2. Confirm API versions, official packages, authentication, hosted card collection, 3DS, idempotency, webhooks, refunds, voids, disputes, test operations, and error mappings for each.
3. Implement one separate adapter file and one separate webhook verifier module per provider, using the Step 06 contract.
4. Implement Stripe hosted collection and supported intent lifecycle without card-data exposure.
5. Implement NMI Collect.js as default, the official Payment Component through an integrator-approved package request, one shared NMI REST server module, single-use 24-hour token treatment, and audited pretested mode switching.
6. Implement Adyen hosted component flow and official webhook verification.
7. Implement Verifone 2Checkout hosted or tokenized flow established by current official documentation.
8. Add each adapter to the registry only after its credential test and required capability paths are complete.
9. Run official sandbox acceptance flows and record redacted evidence for success, decline, 3DS, duplicate idempotency, webhook verification, refund, and void capabilities supported by each provider.
10. Run all shared quality and security gates, create the step handoff, commit once, and push.

### Ownership boundary

Step 07 owns only these four provider adapters, their official research records, provider-specific browser components, signatures, mappers, and sandbox evidence. Shared payment behavior remains in Step 06.

### Completion gate

All four adapters satisfy their declared capabilities, use verified official behavior, preserve the card-data boundary, pass sandbox acceptance, and appear in the registry and control plane without exposing secrets.

## Step 08 - Provider wave B: Braintree, BlueSnap, Square, and Payoneer

### Objective

Implement and register the second four concrete payment adapters from current official sources.

### Substeps

1. Research official API, sandbox, hosted collection, token, 3DS, idempotency, webhook, refund, void, and error behavior for Braintree, BlueSnap, Square, and Payoneer.
2. Use BlueSnap's current official documentation index to locate and record the valid test-mode page rather than relying on an obsolete path.
3. Keep Braintree distinct from the standalone PayPal adapter delivered in Step 09.
4. Implement separate adapter, webhook verification, credential test, capability mapper, and redacted provider logging for each provider.
5. Integrate only official packages that pass the dependency ownership review.
6. Register each adapter only when every declared capability is implemented and the control-plane test succeeds.
7. Run official sandbox acceptance for supported payment, authentication, duplicate, webhook, refund, void, and error cases.
8. Run all shared gates, create the handoff, commit once, and push.

### Ownership boundary

Step 08 owns only Braintree, BlueSnap, Square, and Payoneer provider-specific artifacts and evidence.

### Completion gate

The four adapters are independently configurable, verified against official sandbox behavior, accurately declare unsupported capabilities, and cannot bypass Step 06 routing, risk, approval, or idempotency controls.

## Step 09 - Provider wave C: FastSpring, Paddle, PayPro Global, and standalone PayPal

### Objective

Implement and register the third four concrete payment adapters from current official sources.

### Substeps

1. Research current official API and sandbox documentation for FastSpring, Paddle, PayPro Global, and standalone PayPal.
2. Discover and record the current official sandbox or test-mode pages for FastSpring and PayPro Global during this session.
3. Keep standalone PayPal isolated from the Braintree adapter and map each provider's commerce or merchant-of-record semantics honestly in the capability matrix.
4. Implement separate adapters, official checkout or hosted collection, return verification, credential tests, webhooks, idempotency mapping, refunds, disputes, and normalized errors according to documented capabilities.
5. Process package changes through the integrator-owned dependency review.
6. Register each completed adapter and expose only supported control-plane options.
7. Run and record official sandbox acceptance paths with redacted evidence.
8. Run all shared gates, create the handoff, commit once, and push.

### Ownership boundary

Step 09 owns only FastSpring, Paddle, PayPro Global, and standalone PayPal provider-specific artifacts and evidence.

### Completion gate

Each adapter implements its actual official transaction model without pretending all providers share identical capabilities, and all callback and webhook paths are authenticated and idempotent.

## Step 10 - Provider wave D and complete payment operations

### Objective

Implement the final four adapters, finalize the registry, and deliver wallets, payouts, merchant-of-record operations, subscriptions, disputes, and payment analytics.

### Substeps

1. Research current official API and sandbox documentation for Payarc or PaymentCloud, Rapyd, Authorize.Net, and the security contract for the Custom HTTPS gateway.
2. Discover and record current official sandbox paths for Payarc or PaymentCloud and Rapyd.
3. Implement separate adapters, signatures, credential tests, hosted collection, 3DS, idempotency, refund or void behavior, and normalized errors according to documented capabilities.
4. Implement the Custom adapter as a strict owner-defined HTTPS protocol with schema-bound requests, encrypted secrets, outbound allowlists, DNS revalidation, private-network blocking, signed callbacks, and no arbitrary browser script.
5. Finalize the registry at exactly sixteen concrete adapters and reconcile its capability matrix with the super-admin control plane.
6. Implement `Global Payout Partners` and `Local Payment Methods via Licensed Partners` using generic product labels and code-defined capability records.
7. Implement virtual wallet ledger, platform fees, reserves, holds, payout approval, settlement, reconciliation, and KYC-gated merchant-of-record routing with serializable balance operations.
8. Implement payment subscriptions, recurring collection, retry and dunning, installment or financing framework, refunds, partial allocation, overpayment, underpayment, and receipts.
9. Implement chargebacks, disputes, consent and delivery evidence, immutable evidence packs, deadlines, provider submissions where officially supported, retention, and payment analytics.
10. Integrate payment accounting events through the future Step 14 posting contract without duplicating ledger logic.
11. Run official sandbox acceptance for the final providers and end-to-end payment operations, then run all shared gates, hand off, commit once, and push.

### Ownership boundary

Step 10 owns the final four adapters and downstream payment operations. It does not own client token pages, which consume these services in Step 11, or general accounting, which is Step 14.

### Completion gate

The registry contains exactly sixteen verified adapters; all routing is fail-closed; wallet and payout balances are race-safe; disputes and evidence are immutable; and every payment side effect is approved, idempotent, signed where external, and audited.

## Step 11 - Tokenized client experience, branding, collections, and document workflows

### Objective

Deliver secure login-free client journeys and complete tenant-facing branding and communication behavior.

### Substeps

1. Implement HMAC-signed, random, scoped, expiring, revocable, and masked client tokens with optional email OTP, brute-force protection, no PII in URLs, and no indexing.
2. Implement invoice, payment, estimate approval, receipt, client hub, contract, and expired-link pages with complete states, mobile behavior, accessibility, and tenant branding.
3. Integrate Step 06-10 hosted payment flows without placing client tokens in provider redirects or exposing card data.
4. Implement client consent, terms and refund-policy version snapshots, delivery acceptance, estimate approval, e-signature evidence, timeline, and immutable document history.
5. Implement the complete client email journey through Step 03 SMTP, including delivery, open and click policy, reminder, receipt, failure, refund, dispute, and secure-link messages.
6. Implement tenant themes, logos, document styles, custom domains, white-label entitlements, previews, import or export, and asset storage through Step 02.
7. Implement owner-only sending, staff proposal and approval, bulk email workflow, collection and dunning UX, industry templates, client data quality, and lifecycle UX.
8. Verify token isolation, revocation, expiry, forward-leak protections, branded output, payment handoff, accessibility, and all shared gates.

### Ownership boundary

Step 11 owns tokenized client pages, client communication journey, tenant visual branding application, white-label experience, collection UX, and client-side document acceptance. Core documents remain Step 04 and payment processing remains Steps 06-10.

### Completion gate

A client can securely view and act on authorized records without an account, while expired, revoked, guessed, cross-tenant, or leaked tokens fail safely and every action produces consent and audit evidence.

## Step 12 - Communications, public API, webhooks, ecosystem integrations, OCR, e-sign, and imports

### Objective

Deliver the external integration and multi-channel automation ecosystem through secure adapter boundaries.

### Substeps

1. Implement Meta Cloud API configuration, encrypted credentials, template management, consent, sending, inbound signed webhooks, campaigns, automation, delivery tracking, and opt-out handling.
2. Implement isolated Facebook, Instagram, LinkedIn, X, Threads, Telegram, and Pinterest adapters with scoped credentials, scheduling, approvals, analytics, and rate-limit handling.
3. Implement versioned REST API v1, OpenAPI 3.1 generation, API keys and scopes, pagination, filters, idempotency, rate limits, correlation, audit, and a complete developer portal.
4. Implement outgoing webhooks with signing, replay protection, subscriptions, retries, dead-letter handling, delivery logs, secret rotation, and endpoint SSRF controls.
5. Implement Zapier, Make, and browser-extension integration contracts without placing service secrets in the browser.
6. Implement Plaid and Salt Edge bank-feed adapters, import, normalization, matching, reconciliation suggestions, consent, and audit boundaries.
7. Implement receipt OCR through the configured provider, confidence review, expense draft creation, encrypted originals, and human approval.
8. Implement contracts, e-signatures, certificate evidence, multi-channel routing, support tickets, help content, feedback, NPS, and communication history.
9. Implement data migration and CSV import with safe parsing, preview, column mapping, duplicate policy, approval, batch identity, rollback record, and per-row results.
10. Verify signed inbound and outbound traffic, SSRF boundaries, retries, consent, scopes, imports, and all shared gates.

### Ownership boundary

Step 12 owns third-party communications, social integrations, public APIs, outgoing webhooks, bank feeds, OCR, contracts and e-sign services, support integration, and data imports. Provider payment webhooks remain owned by payment steps.

### Completion gate

Every external connection has encrypted credentials, least-privilege scopes, signed event handling where supported, idempotency, auditability, consent, deterministic retries, and a safe disable or revoke path.

## Step 13 - Platform administration, public site, CMS, SEO, analytics, and growth

### Objective

Deliver all platform operator surfaces and the production public marketing and content system.

### Substeps

1. Implement super-admin, CEO, and scoped admin-staff dashboards, tenant and user management, impersonation, communication, KYC queues, approval queues, payouts, disputes, fraud review, audit search, health, and configuration.
2. Implement plan, subscription, coupon, entitlement, feature flag, monetization, usage, add-on, and billing administration under approvals and optimistic locking.
3. Implement a block-based CMS for all public pages, blog, legal and trust pages, status and incident pages, road map, change log, help center, email templates, media, revisions, scheduling, and approvals.
4. Deliver complete public home, product, industry, use-case, comparison, migration, company, contact, partner, integration, legal, support, blog, status, lead-generation, calculator, and free-invoice experiences with real English content.
5. Implement SEO metadata, canonical URLs, sitemaps, robots controls, Open Graph, social cards, eight JSON-LD schema families, search verification, redirects, and SEO audit reports.
6. Implement consent-aware GA4, GTM, supported marketing pixels, server events, attribution, in-app analytics, A/B experiments, trust signals, and privacy controls.
7. Implement email campaigns, drip sequences, lead scoring, forms, booking, growth, retention, churn, health scoring, platform revenue and tenant intelligence, and first-run platform setup.
8. Apply role permissions, approval chains, 2FA and reauthentication for critical administration, audit, responsive and accessible page states, and all quality gates.

### Ownership boundary

Step 13 owns platform administration except the gateway credential page, public content, CMS, SEO, analytics, growth, entitlements, and platform intelligence. Tenant operational dashboards remain Step 05.

### Completion gate

Authorized platform roles can operate the SaaS without direct database edits or redeployment, public content is CMS-driven and complete, analytics honor consent, and every administrative mutation follows approval, version, and audit contracts.

## Step 14 - Payroll, HR, expenses, double-entry accounting, and financial reporting

### Objective

Deliver accounting-grade payroll and finance with immutable balanced ledgers and decimal-safe reports.

### Substeps

1. Implement employee profiles, organization, employment, compensation, benefits, deductions, tax profiles, bank-token references, documents, leave, onboarding, offboarding, and performance records.
2. Implement payroll calendars, USD decimal calculations, approvals, previews, corrections, immutable finalization, payouts through Step 10, payslips, employee token portal, reports, and compliance records.
3. Implement expanded expense management, receipts through Step 02 storage, policies, recurring expenses, approval, reimbursement, duplicate detection, and reporting.
4. Implement chart of accounts, dimensions, fiscal periods, journal drafts, balanced posting, reversals, recurring and adjusting entries, immutable posted records, close controls, and audit trail.
5. Implement automated postings from invoices, payments, refunds, fees, payroll, expenses, inventory, assets, tax, and bank reconciliation through one posting contract.
6. Implement profit and loss, balance sheet, cash flow, trial balance, general ledger, aging, tax, equity, budget, variance, and management reports without floating-point money.
7. Implement bank reconciliation, fixed assets, depreciation, budgets, multi-book configuration, multi-entity consolidation, period close, tax filing records, audit workpapers, forecasting, and business intelligence.
8. Verify debit-credit equality, period locks, reversal rules, duplicate payroll and journal guards, report reconciliation, RLS, approvals, audits, and all shared gates.

### Ownership boundary

Step 14 owns HR, payroll, expenses, accounting ledgers, postings, assets, budgets, reconciliation, close, tax filing records, and financial intelligence. Payment execution remains Step 10.

### Completion gate

All postings balance, finalized payroll and journals are immutable, reports reconcile to ledger sources, every money path remains fixed precision, and concurrent financial operations cannot double-post.

## Step 15 - Advanced security, privacy, fraud, compliance, SIEM, resilience, and edge cases

### Objective

Complete and independently reconcile every advanced security, compliance, observability, regional, enterprise, conflict, and duplicate requirement while preserving controls embedded in earlier steps.

### Substeps

1. Reconcile tenant isolation, RLS, encryption, key rotation, secret access, storage isolation, data classification, lineage, retention, residency, legal hold, privacy requests, consent, and jurisdiction controls.
2. Complete nonce CSP, Trusted Types, CORS, CSRF, XSS, SQL injection, SSRF, redirect, header, path, payload, XML, archive, upload, webhook, and supply-chain defenses.
3. Complete VPN, proxy, Tor, datacenter, IP reputation, ASN, geofence, device, session, impossible-travel, bot, abuse, account takeover, credential stuffing, and insider-threat controls.
4. Complete transaction risk scoring, protected fingerprint blacklists, velocity, AML and sanctions hooks, fraud review, holds, alerting, and privacy-minimized behavioral signals with no card-field telemetry.
5. Complete append-only hash-chained and signed audit logs, sequence-gap checks, integrity verification, encrypted archival, SIEM adapters, normalized events, threat intelligence, and tamper alerts.
6. Complete GDPR, CCPA, regional privacy, PCI scope documentation, SOC and ISO readiness, data residency, DSAR, deletion, portability, breach, vendor, and subprocessor workflows.
7. Complete conflict and duplicate prevention for invoices, clients, products, expenses, journals, payroll, webhooks, emails, forms, files, imports, batches, payments, queues, and cron operations.
8. Complete monitoring, SLO and error budgets, alert rules, on-call, incident lifecycle, status updates, evidence, post-incident review, disaster recovery, and resilience handling.
9. Complete Asia-Pacific display, calendar, tax-document, infrastructure, enterprise, lifecycle, and critical edge-case requirements while preserving English UI and USD accounting.
10. Run security scanners, RLS and grant assertions, dependency and secret scans, privacy review, manual abuse cases, payment boundary review, and all shared quality gates.

### Ownership boundary

Step 15 owns advanced and cross-domain security engines, compliance workflows, SIEM, fraud orchestration, observability, incident response, regional and enterprise extensions, and final conflict or duplicate reconciliation. It extends earlier primitives rather than creating parallel versions.

### Completion gate

The security and compliance matrix has evidence for every requirement; strict endpoints fail closed; audit integrity is verifiable; privacy controls are operational; card and secret boundaries are intact; and no duplicate cross-cutting implementation remains.

## Step 16 - Deployment, scheduled operations, performance, documentation, and launch certification

### Objective

Integrate, deploy, document, and certify the complete platform for production launch without adding an unowned parallel implementation.

### Substeps

1. Implement Netlify configuration, function and background-function mapping, raw webhook bodies, headers, redirects, cache rules, environment validation, preview policy, and rollback procedure.
2. Implement Docker and VPS parity with multi-stage images, health checks, reverse proxy, TLS guidance, process model, migrations, workers, scheduled jobs, logs, backups, and restore procedures.
3. Register and implement all scheduled operations through pg_cron or the approved runtime: recurrence, reminders, sessions, backups, retention, estimates, holds, sanctions, KYC, rates, files, quotas, subscriptions, payroll, depreciation, accruals, reports, audit integrity, and leader locks.
4. Complete CI and release gates for clean install, type checking, linting, production build, dependency audit, secret scan, English scan, path headers, forbidden artifacts, migration policy, RLS assertions, dead links, accessibility audit, responsive audit, API schema, and container scan without test-source files.
5. Complete PWA, offline-safe behavior, caching, image and PDF optimization, bundle budgets, database indexes, query plans, pagination, CDN behavior, Core Web Vitals, and graceful degradation.
6. Complete README, environment reference, architecture, ERD, data dictionary, ADRs, API and webhook references, provider records, security guide, deployment guide, backup and restore guide, incident runbooks, browser support, and release notes.
7. Run the full requirements ledger reconciliation across all 4,187 source rows and all latest-requirement identifiers, assigning evidence and resolving every uncovered item in its owning module.
8. Run end-to-end manual launch acceptance across roles, approvals, tenant isolation, auth lock, storage selection, invoice, all configured provider sandboxes, client portal, integrations, payroll, accounting, administration, security, and recovery.
9. Validate the production service matrix, key rotation metadata, SMTP, Turnstile, risk intelligence, Sentry redaction, storage providers, enabled payment credentials, DNS, and health endpoints.
10. Produce the launch certification, final handoff, one release commit, push the tracked branch, and report the commit identifier and gate results.

### Ownership boundary

Step 16 owns deployment, runtime scheduling, CI and release gates, performance integration, PWA completion, operational documentation, requirements certification, and release evidence. It fixes integration gaps only in the module that owns them and does not create duplicate services.

### Completion gate

All requirements have traceable evidence, all quality and security gates pass, production configuration is validated, backup and recovery are demonstrated, configured provider sandboxes succeed, deployment artifacts have parity, and the tracked branch is ready for reviewed release.

## 4. Step completion artifact

Each step creates `docs/handoffs/STEP_XX_COMPLETED.md` with:

- scope and canonical requirement ranges completed;
- architecture decisions made;
- files and migrations changed;
- dependency requests and integrator decisions;
- database and RLS changes;
- security, approval, audit, idempotency, and concurrency controls;
- verification commands and summarized results;
- provider research and sandbox evidence when applicable;
- environment variables added, with no secret values;
- exact next-step prerequisites;
- conventional commit subject and pushed branch name.

The handoff records completed facts and explicit prerequisites. It never contains unfinished implementation markers or fabricated pass results.
