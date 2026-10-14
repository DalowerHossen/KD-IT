// path: CHAT_INSTRUCTIONS.md

# New-Chat Execution Instructions

Version: 1.0  
Use: Paste exactly one matching block as the first message in each new chat.

## Universal session contract

Every step chat must:

1. Stay on the Arena-assigned tracked branch; treat it as the integration baseline and do not create or switch branches.
2. Read, in order, `REQUIREMENTS_ADDENDUM.md`, `IMPLEMENTATION_PLAN.md`, `REQUIREMENTS_TRACEABILITY.md`, `PROVIDER_RESEARCH_PROTOCOL.md`, `MASTER_PROMPT.md`, `FEATURE_LIST.md`, and the previous step handoff.
3. Inspect `git status`, recent commits, existing files, migrations, dependency decisions, and registries before editing.
4. First present a concise substep execution plan for the assigned step, then implement that entire step in the same chat without expanding into another step.
5. Preserve correct existing work, use documented extension points, search before creating files, and avoid parallel implementations.
6. Apply every security, tenancy, approval, audit, validation, money, storage, accessibility, and quality rule to the current scope.
7. Use current official documentation before provider-specific code and record source evidence.
8. Never create automated test source files or fabricated credentials. Use the approved verification mechanisms.
9. Run all available quality gates and inspect the final diff.
10. Create or update `docs/handoffs/STEP_XX_COMPLETED.md` with factual evidence.
11. Create exactly one conventional completion commit for the step, push the tracked branch without force, and report the commit identifier and verification results.

## Chat 01 prompt

```text
Execute KD SOLUTION IT Step 01 of 16: Repository foundation, design system, and shared application shell. Work only on the Arena-assigned tracked branch and do not create or switch branches. First read all authoritative documents in the order defined by CHAT_INSTRUCTIONS.md, inspect repository and Git state, and present a concise breakdown of Step 01 into its listed substeps. Then implement the complete Step 01 scope in this same chat. Do not implement business database domains, authentication flows, or payment providers. Apply every absolute rule, create no automated test source files, run every available quality gate, create docs/handoffs/STEP_01_COMPLETED.md, make exactly one conventional commit with subject "feat(foundation): complete step 01 application foundation", push the tracked branch, and report the commit identifier and gate results.
```

## Chat 02 prompt

```text
Execute KD SOLUTION IT Step 02 of 16: Supabase data plane, tenancy, audit, approvals, encryption, and storage. Work only on the Arena-assigned tracked branch and do not create or switch branches. Read all authoritative documents and docs/handoffs/STEP_01_COMPLETED.md, verify the Step 01 commit is present, inspect existing migrations and shared contracts, and first present a concise substep breakdown. Then implement the complete Step 02 scope in this same chat, including encrypted Google Drive selection when connected and encrypted Supabase Storage when not connected, with automatic healthy-provider fallback and migration. Do not implement auth journeys or business domains. Run all approved gates and SQL assertions, create docs/handoffs/STEP_02_COMPLETED.md, make exactly one commit with subject "feat(platform): complete step 02 secure data plane", push the tracked branch, and report evidence and the commit identifier.
```

## Chat 03 prompt

```text
Execute KD SOLUTION IT Step 03 of 16: Authentication, role hierarchy, lockout, onboarding, settings, SMTP, and KYC. Work only on the Arena-assigned tracked branch. Read all authoritative documents and docs/handoffs/STEP_02_COMPLETED.md, verify Steps 01-02, inspect the permission and approval foundations, and first present a concise substep breakdown. Then implement the entire Step 03 scope in this same chat. Enforce the five-role hierarchy, tokenized clients, full approval chain, mandatory 2FA, and the exact two-failure two-hour database-persistent lock with reset blocking, generic responses, email alert, and audited permissioned unlock. Do not implement provider payment credentials. Run all approved gates, create docs/handoffs/STEP_03_COMPLETED.md, make exactly one commit with subject "feat(auth): complete step 03 identity and onboarding", push the tracked branch, and report evidence and the commit identifier.
```

## Chat 04 prompt

```text
Execute KD SOLUTION IT Step 04 of 16: Invoicing, documents, numbering, PDF, recurring billing, and print. Stay on the Arena-assigned tracked branch. Read all authoritative documents and docs/handoffs/STEP_03_COMPLETED.md, verify prerequisite commits, inspect shared money, storage, approval, and audit services, and first present a concise substep breakdown. Then implement the full Step 04 scope in this same chat with decimal-string money, PostgreSQL numeric(18,4), advisory-locked numbering, immutable sent and paid snapshots, encrypted PDFs, complete approvals, validation, RLS, and page states. Do not implement CRM, inventory, or client token pages. Run all gates, create docs/handoffs/STEP_04_COMPLETED.md, make exactly one commit with subject "feat(invoicing): complete step 04 document engine", push the tracked branch, and report evidence and the commit identifier.
```

## Chat 05 prompt

```text
Execute KD SOLUTION IT Step 05 of 16: CRM, products, inventory, suppliers, projects, commerce, tax, dashboards, and reports. Stay on the Arena-assigned tracked branch. Read all authoritative documents and docs/handoffs/STEP_04_COMPLETED.md, verify prerequisite commits, inspect existing domain extension points, and first present a concise substep breakdown. Then implement all Step 05 modules in this same chat without duplicating invoice, storage, audit, approval, or money services. Enforce tenant RLS, row locks, optimistic versions, duplicate controls, decimal-safe reports, complete responsive states, and approval for mutations. Do not implement payment providers or general accounting journals. Run all gates, create docs/handoffs/STEP_05_COMPLETED.md, make exactly one commit with subject "feat(business): complete step 05 business operations", push the tracked branch, and report evidence and the commit identifier.
```

## Chat 06 prompt

```text
Execute KD SOLUTION IT Step 06 of 16: Payment core, risk controls, hosted UI boundary, and gateway control plane. Stay on the Arena-assigned tracked branch. Read all authoritative documents and docs/handoffs/STEP_05_COMPLETED.md, verify prerequisites, inspect shared security services, and first present a concise substep breakdown. Then implement only the provider-neutral payment scope in this same chat: sixteen provider identifiers, strict adapter contract, concrete-only registry, encrypted super-admin credential control, fail-closed routing, hosted card boundary, mandatory idempotency, 3DS fallback checks, rolling card guards, blacklists, velocity, VPN blocking, manual review, and signature-first webhook dispatch. Do not invent provider-specific requests or signatures. Run all gates, create docs/handoffs/STEP_06_COMPLETED.md, make exactly one commit with subject "feat(payments): complete step 06 payment platform core", push the tracked branch, and report evidence and the commit identifier.
```

## Chat 07 prompt

```text
Execute KD SOLUTION IT Step 07 of 16: Stripe, NMI, Adyen, and Verifone 2Checkout adapters. Stay on the Arena-assigned tracked branch. Read every authoritative document, PROVIDER_RESEARCH_PROTOCOL.md, and docs/handoffs/STEP_06_COMPLETED.md. Before any provider code, fetch each provider's current official API and sandbox documentation from its own site and write the required research records. First present the substep plan, then implement all four adapters in this same chat. NMI must retain Collect.js as default, add the current official Payment Component only through the integrator dependency process, treat Collect.js tokens as single-use with a 24-hour expiry, share one NMI REST server module, and require a successful audited mode test before switching. Run official sandbox acceptance and all gates, create docs/handoffs/STEP_07_COMPLETED.md, make exactly one commit with subject "feat(payments): complete step 07 provider wave a", push, and report sources, evidence, and commit identifier.
```

## Chat 08 prompt

```text
Execute KD SOLUTION IT Step 08 of 16: Braintree, BlueSnap, Square, and Payoneer adapters. Stay on the Arena-assigned tracked branch. Read all authoritative documents, PROVIDER_RESEARCH_PROTOCOL.md, and docs/handoffs/STEP_07_COMPLETED.md. Before provider code, retrieve and record current official API and sandbox documentation for all four providers; use BlueSnap's official index to locate the current valid test-mode documentation. First present a concise substep plan, then implement and register all four adapters in this same chat, keeping Braintree distinct from standalone PayPal and preserving the Step 06 card, routing, idempotency, credential, and webhook boundaries. Run official sandbox acceptance and all gates, create docs/handoffs/STEP_08_COMPLETED.md, make exactly one commit with subject "feat(payments): complete step 08 provider wave b", push, and report sources, evidence, and commit identifier.
```

## Chat 09 prompt

```text
Execute KD SOLUTION IT Step 09 of 16: FastSpring, Paddle, PayPro Global, and standalone PayPal adapters. Stay on the Arena-assigned tracked branch. Read all authoritative documents, PROVIDER_RESEARCH_PROTOCOL.md, and docs/handoffs/STEP_08_COMPLETED.md. Before provider code, retrieve and record each provider's current official API and sandbox documentation, including discovery of the official FastSpring and PayPro Global test-mode instructions. First present the substep plan, then implement and register all four adapters in this same chat. Keep standalone PayPal separate from Braintree and declare each provider's real capability model without fabricated parity. Run official sandbox acceptance and all gates, create docs/handoffs/STEP_09_COMPLETED.md, make exactly one commit with subject "feat(payments): complete step 09 provider wave c", push, and report sources, evidence, and commit identifier.
```

## Chat 10 prompt

```text
Execute KD SOLUTION IT Step 10 of 16: Payarc or PaymentCloud, Rapyd, Authorize.Net, Custom HTTPS adapter, and complete payment operations. Stay on the Arena-assigned tracked branch. Read all authoritative documents, PROVIDER_RESEARCH_PROTOCOL.md, and docs/handoffs/STEP_09_COMPLETED.md. Before provider code, retrieve and record current official API and sandbox documentation, including official sandbox discovery for Payarc or PaymentCloud and Rapyd. First present the substep plan, then implement the four adapters, finalize the registry at exactly sixteen, and complete wallets, fees, holds, payouts, merchant operations, subscriptions, refunds, disputes, evidence, and analytics in this same chat. Keep custom outbound traffic SSRF-safe and routing fail-closed. Run sandbox acceptance and all gates, create docs/handoffs/STEP_10_COMPLETED.md, make exactly one commit with subject "feat(payments): complete step 10 payment operations", push, and report sources, evidence, and commit identifier.
```

## Chat 11 prompt

```text
Execute KD SOLUTION IT Step 11 of 16: Tokenized client experience, branding, collections, and document workflows. Stay on the Arena-assigned tracked branch. Read all authoritative documents and docs/handoffs/STEP_10_COMPLETED.md, verify prerequisites, inspect invoice and payment service contracts, and first present a concise substep plan. Then implement the entire Step 11 scope in this same chat: signed scoped tokens, optional email OTP, invoice, payment, estimate, receipt, hub, and contract pages, consent and signature evidence, complete email journeys, tenant branding, white label, owner-only sending, approvals, collections, and client data quality. Never place client tokens in provider redirects. Run all gates, create docs/handoffs/STEP_11_COMPLETED.md, make exactly one commit with subject "feat(client): complete step 11 client experience", push, and report evidence and the commit identifier.
```

## Chat 12 prompt

```text
Execute KD SOLUTION IT Step 12 of 16: Communications, public API, webhooks, ecosystem integrations, OCR, e-sign, and imports. Stay on the Arena-assigned tracked branch. Read all authoritative documents and docs/handoffs/STEP_11_COMPLETED.md, verify prerequisites, inspect shared adapters and security boundaries, and first present a concise substep plan. Then implement the entire Step 12 scope in this same chat with encrypted credentials, least privilege, consent, signature verification, idempotency, retries, SSRF protection, approval, audit, and complete UI states. Reuse payment webhook infrastructure without duplicating provider handlers. Run all gates, create docs/handoffs/STEP_12_COMPLETED.md, make exactly one commit with subject "feat(integrations): complete step 12 integration ecosystem", push, and report evidence and the commit identifier.
```

## Chat 13 prompt

```text
Execute KD SOLUTION IT Step 13 of 16: Platform administration, public site, CMS, SEO, analytics, and growth. Stay on the Arena-assigned tracked branch. Read all authoritative documents and docs/handoffs/STEP_12_COMPLETED.md, verify prerequisites, inspect role and gateway-control ownership, and first present a concise substep plan. Then implement the full Step 13 scope in this same chat with complete real English content, CMS revisions and approvals, super-admin, CEO and admin-staff permissions, platform management, public pages, legal and trust content, SEO, consent-aware analytics, marketing automation, entitlements, and intelligence. Do not duplicate the Step 06 gateway credential page. Run all gates, create docs/handoffs/STEP_13_COMPLETED.md, make exactly one commit with subject "feat(admin): complete step 13 platform administration and public site", push, and report evidence and the commit identifier.
```

## Chat 14 prompt

```text
Execute KD SOLUTION IT Step 14 of 16: Payroll, HR, expenses, double-entry accounting, and financial reporting. Stay on the Arena-assigned tracked branch. Read all authoritative documents and docs/handoffs/STEP_13_COMPLETED.md, verify prerequisites, inspect payment and invoice event contracts, and first present a concise substep plan. Then implement the complete Step 14 scope in this same chat. Use decimal strings and numeric(18,4) for every financial value, one balanced posting contract, immutable finalized payroll and posted journals, period locks, reversals, duplicate guards, encrypted documents, approvals, RLS, and reconciled statements. Run all gates and financial invariants, create docs/handoffs/STEP_14_COMPLETED.md, make exactly one commit with subject "feat(accounting): complete step 14 payroll and finance", push, and report evidence and the commit identifier.
```

## Chat 15 prompt

```text
Execute KD SOLUTION IT Step 15 of 16: Advanced security, privacy, fraud, compliance, SIEM, resilience, and edge cases. Stay on the Arena-assigned tracked branch. Read all authoritative documents and docs/handoffs/STEP_14_COMPLETED.md, verify every prerequisite, inventory existing controls before editing, and first present a concise substep plan. Then complete the entire Step 15 scope in this same chat by extending, not duplicating, shared security services. Reconcile Zero Trust, Zero Tolerance, VPN and network blocking, privacy-minimized fraud signals, immutable audit and SIEM, compliance, data residency, conflict and duplicate prevention, observability, incidents, regional and enterprise behavior, and critical edge cases. Preserve the ban on card-field telemetry. Run all security and quality gates, create docs/handoffs/STEP_15_COMPLETED.md, make exactly one commit with subject "feat(security): complete step 15 security and compliance", push, and report evidence and the commit identifier.
```

## Chat 16 prompt

```text
Execute KD SOLUTION IT Step 16 of 16: Deployment, scheduled operations, performance, documentation, and launch certification. Stay on the Arena-assigned tracked branch. Read all authoritative documents and docs/handoffs/STEP_15_COMPLETED.md, verify all fifteen prior commits, inspect the complete repository, and first present a concise substep plan. Then complete Step 16 in this same chat: Netlify primary deployment, Docker and VPS parity, all scheduled jobs and leader locks, no-test-file CI gates, PWA and performance, operational documentation, backup and recovery, production configuration validation, manual launch acceptance, and full traceability reconciliation for all 4,187 namespaced source rows plus LR-001 through LR-021. Resolve every uncovered item in its owning module without parallel services. Create docs/handoffs/STEP_16_COMPLETED.md and launch certification, run every gate, make exactly one commit with subject "chore(release): complete step 16 launch certification", push, and report the final commit identifier and release evidence.
```

## Sequence rule

Use Chat 01 first. Start Chat 02 only after Chat 01 has pushed its completion commit. Continue in numeric order through Chat 16. Never run two steps concurrently against the same integration baseline.
