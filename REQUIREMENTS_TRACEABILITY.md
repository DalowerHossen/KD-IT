// path: REQUIREMENTS_TRACEABILITY.md

# Requirements Traceability and Scope Ownership

Version: 1.0  
Effective date: 2026-10-14

## 1. Reconciled source inventory

`FEATURE_LIST.md` contains 4,187 enumerated requirement rows. The numeric labels contain one intentional source overlap: Part 09 reaches feature label 3608, Part 10 restarts at 3451, and Part 11 starts at 3601. The plan therefore uses a part namespace and never relies on the numeric label alone.

Canonical source keys use this form:

- `P01-F0001` means Part 01, source feature 1.
- `P09-F3451` and `P10-F3451` are different requirements.
- `P09-F3601` and `P11-F3601` are different requirements.

No source row is discarded because its numeric label also appears in another part.

| Part | Source feature labels | Enumerated rows | Primary subject |
|---|---:|---:|---|
| P01 | 1-375 | 375 | Foundation, design, public experience |
| P02 | 376-766 | 391 | Auth, onboarding, settings |
| P03 | 767-1242 | 476 | Invoicing and business core |
| P04 | 1243-1665 | 423 | Payments, gateways, merchant operations |
| P05 | 1666-1940 | 275 | Client experience and branding |
| P06 | 1941-2353 | 413 | Communications, API, integrations |
| P07 | 2354-2798 | 445 | Administration, CMS, marketing |
| P08 | 2799-3154 | 356 | Payroll, HR, accounting |
| P09 | 3155-3608 | 454 | Security, performance, storage, edge cases |
| P10 | 3451-3600 | 150 | Deployment and release polish |
| P11 | 3601-4029 | 429 | Enhanced roles, security, compliance |
| Total | Namespaced | 4,187 | Full source inventory |

## 2. Single-owner source mapping

Every source range below has exactly one implementation owner. A step may consume a service built by another step but must not reimplement that service.

### Part 01

| Canonical range | Owner | Scope |
|---|---:|---|
| P01-F0001 through P01-F0204 | Step 01 | Brand system, layouts, responsive states, navigation, accessibility |
| P01-F0205 through P01-F0300 | Step 13 | Public site, content, legal, support, SEO, English content |
| P01-F0301 through P01-F0370 | Step 01 | Visual system, charts, shared components, design consistency |
| P01-F0371 through P01-F0375 | Step 04 | Print and document output styling |

### Part 02

| Canonical range | Owner | Scope |
|---|---:|---|
| P02-F0376 through P02-F0732 | Step 03 | Authentication, SMTP, onboarding, settings, team, KYC, domains, notifications, subscriptions, entitlements |
| P02-F0733 through P02-F0751 | Step 06 | Gateway settings and generic partner configuration |
| P02-F0752 through P02-F0760 | Step 03 | Tenant security settings |
| P02-F0761 through P02-F0766 | Step 16 | Backup operation and release verification |

### Part 03

| Canonical range | Owner | Scope |
|---|---:|---|
| P03-F0767 through P03-F0941 | Step 04 | Invoices, professional layouts, PDFs, estimates, commercial documents |
| P03-F0942 through P03-F1242 | Step 05 | Projects, CRM, catalog, inventory, suppliers, commerce, dashboards, reports, billing lifecycle, tax, bulk operations |

### Part 04

| Canonical range | Owner | Scope |
|---|---:|---|
| P04-F1243 through P04-F1260 | Step 06 | Provider-neutral gateway architecture |
| P04-F1261 through P04-F1278 | Step 07 | Stripe legacy source requirements |
| P04-F1279 through P04-F1288 | Step 09 | Standalone PayPal legacy source requirements |
| P04-F1289 through P04-F1295 | Step 09 | Paddle legacy source requirements |
| P04-F1296 through P04-F1305 | Step 07 | NMI legacy source requirements |
| P04-F1306 through P04-F1316 | Step 10 | Rapyd legacy source requirements |
| P04-F1317 through P04-F1328 | Step 07 | Adyen legacy source requirements |
| P04-F1329 through P04-F1337 | Step 10 | Custom gateway legacy source requirements |
| P04-F1338 through P04-F1474 | Step 06 | Generic partner framework, core payment processing, checkout, digital wallets |
| P04-F1475 through P04-F1665 | Step 10 | Wallets, fees, holds, payouts, merchant operations, disputes, consent, subscriptions, financing, compliance, analytics |

### Parts 05 through 08

| Canonical range | Owner | Scope |
|---|---:|---|
| P05-F1666 through P05-F1940 | Step 11 | Tokenized client experience, client email, branding, white label, workflow, collection UX |
| P06-F1941 through P06-F2353 | Step 12 | WhatsApp, social, API, webhooks, ecosystem, bank feeds, OCR, contracts, messaging, support, imports |
| P07-F2354 through P07-F2798 | Step 13 | Platform administration, CMS, SEO, analytics, marketing, entitlements, intelligence, growth |
| P08-F2799 through P08-F3154 | Step 14 | Payroll, HR, expenses, accounting, statements, reconciliation, assets, budgets, close, financial intelligence |

### Part 09

| Canonical range | Owner | Scope |
|---|---:|---|
| P09-F3155 through P09-F3177 | Step 02 | Tenant and storage isolation |
| P09-F3178 through P09-F3202 | Step 02 | Encryption and secret primitives |
| P09-F3203 through P09-F3281 | Step 15 | Application, bot, and abuse security |
| P09-F3282 through P09-F3293 | Step 02 | Foundational file upload security |
| P09-F3294 through P09-F3356 | Step 15 | Token security, privacy, supply chain, webhook security |
| P09-F3357 through P09-F3391 | Step 16 | Performance budgets and optimization |
| P09-F3392 through P09-F3422 | Step 02 | Database engineering and concurrency primitives |
| P09-F3423 through P09-F3436 | Step 16 | Netlify runtime behavior |
| P09-F3437 through P09-F3476 | Step 02 | Storage abstraction, operations, lifecycle |
| P09-F3477 through P09-F3490 | Step 02 | Secure media processing pipeline |
| P09-F3491 through P09-F3524 | Step 15 | Asia-Pacific and regional extensions |
| P09-F3525 through P09-F3544 | Step 15 | Enterprise and B2B extensions |
| P09-F3545 through P09-F3575 | Step 15 | Critical domain and system edge cases |
| P09-F3576 through P09-F3596 | Step 15 | Observability and incident behavior |
| P09-F3597 through P09-F3608 | Step 16 | Delivery and release gates |

### Part 10

| Canonical range | Owner | Scope |
|---|---:|---|
| P10-F3451 through P10-F3600 | Step 16 | Hosting, schedules, CI, documentation, operations, lifecycle, release, final UX |

### Part 11

| Canonical range | Owner | Scope |
|---|---:|---|
| P11-F3601 through P11-F3642 | Step 03 | Updated roles and global approval behavior |
| P11-F3643 through P11-F3670 | Step 15 | Deep file security reconciliation |
| P11-F3671 through P11-F3695 | Step 15 | Immutable audit and SIEM |
| P11-F3696 through P11-F3730 | Step 15 | User, payment, and account fraud controls |
| P11-F3731 through P11-F3768 | Step 15 | Governance, jurisdiction compliance, data residency |
| P11-F3769 through P11-F3793 | Step 15 | Dependency and supply-chain security |
| P11-F3794 through P11-F3835 | Step 15 | Monitoring, alerting, and incident response |
| P11-F3836 through P11-F3863 | Step 15 | VPN, proxy, Tor, IP, ASN, and geofence controls |
| P11-F3864 through P11-F3909 | Step 15 | Input security and browser security policy |
| P11-F3910 through P11-F3933 | Step 10 | Chargeback and refund evidence |
| P11-F3934 through P11-F3978 | Step 15 | Device, network, and privacy-minimized activity risk |
| P11-F3979 through P11-F4004 | Step 15 | Zero Trust and Zero Tolerance |
| P11-F4005 through P11-F4029 | Step 15 | Conflict and duplicate prevention |

## 3. Reconciled row count by owner

This table proves that the ranges above assign all 4,187 source rows exactly once.

| Step | Assigned source rows |
|---:|---:|
| 01 | 274 |
| 02 | 145 |
| 03 | 408 |
| 04 | 180 |
| 05 | 301 |
| 06 | 174 |
| 07 | 40 |
| 08 | 0 legacy rows; new provider requirements below |
| 09 | 17 |
| 10 | 235 |
| 11 | 275 |
| 12 | 413 |
| 13 | 541 |
| 14 | 356 |
| 15 | 611 |
| 16 | 217 |
| Total | 4,187 |

Step 08 has no matching legacy provider rows because its four providers were added by the latest product requirements. Its scope is mandatory through the addendum identifiers below.

## 4. Latest requirement identifiers

The latest product-owner requirements are tracked separately so they cannot be lost inside older source ranges.

| Identifier | Requirement | Primary owner | Verification owner |
|---|---|---:|---:|
| LR-001 | English-only product artifacts | Step 01 | Step 16 |
| LR-002 | USD-only `numeric(18,4)` and no binary floating-point money | Step 02 | Steps 14 and 16 |
| LR-003 | PostgreSQL structured data and tenant-selected encrypted Drive or Supabase file storage | Step 02 | Steps 15 and 16 |
| LR-004 | No automated test source files | Step 01 | Step 16 |
| LR-005 | Strict TypeScript, structured logs, file path headers, no unfinished copy | Step 01 | Step 16 |
| LR-006 | UUID v7, `company_id`, timestamps, soft deletion, RLS default-deny on every table | Step 02 | Steps 15 and 16 |
| LR-007 | Audit every mutation and validate and sanitize every boundary | Step 02 | Steps 15 and 16 |
| LR-008 | Payment idempotency and optimistic locking | Step 06 | Steps 15 and 16 |
| LR-009 | Five authenticated roles and tokenized clients | Step 03 | Steps 15 and 16 |
| LR-010 | Staff-origin, CEO, and super-admin approval chain | Step 02 and Step 03 | Steps 15 and 16 |
| LR-011 | Generic regional payment partner naming | Step 06 | Steps 13 and 16 |
| LR-012 | Zero Trust, Zero Tolerance, and VPN, proxy, Tor controls | Step 15 | Step 16 |
| LR-013 | Fresh official provider documentation before provider code | Steps 07-10 | Step 16 |
| LR-014 | Exactly sixteen separate payment adapters and one registry | Steps 06-10 | Step 16 |
| LR-015 | NMI Collect.js default plus Payment Component and shared REST module | Step 07 | Step 16 |
| LR-016 | Super-admin encrypted credential test, enable, disable, and mode control | Step 06 | Steps 07-10 and 16 |
| LR-017 | Two failures cause a two-hour database-persistent login lock | Step 03 | Steps 15 and 16 |
| LR-018 | Provider-hosted card input only and no card-field telemetry | Step 06 | Steps 07-10 and 15 |
| LR-019 | Invoice-card success guard, failure guard, blacklist, and velocity limits | Step 06 | Steps 07-10 and 15 |
| LR-020 | 3DS request, postal and country fallback, manual review, signed idempotent webhooks | Step 06 | Steps 07-10 and 15 |
| LR-021 | Integrator-owned dependencies and sequential tracked-branch workflow | Step 01 | Every step and Step 16 |

## 5. Sixteen-adapter traceability

| Adapter identifier | Provider | Owner | Legacy source link |
|---|---|---:|---|
| `stripe` | Stripe | Step 07 | P04-F1261 through P04-F1278 |
| `nmi` | NMI | Step 07 | P04-F1296 through P04-F1305, LR-015 |
| `adyen` | Adyen | Step 07 | P04-F1317 through P04-F1328 |
| `verifone_2checkout` | Verifone 2Checkout | Step 07 | LR-013, LR-014 |
| `braintree_paypal` | Braintree by PayPal | Step 08 | LR-013, LR-014 |
| `bluesnap` | BlueSnap | Step 08 | LR-013, LR-014 |
| `square` | Square | Step 08 | LR-013, LR-014 |
| `payoneer` | Payoneer | Step 08 | LR-013, LR-014 |
| `fastspring` | FastSpring | Step 09 | LR-013, LR-014 |
| `paddle` | Paddle | Step 09 | P04-F1289 through P04-F1295 |
| `paypro_global` | PayPro Global | Step 09 | LR-013, LR-014 |
| `paypal` | PayPal standalone | Step 09 | P04-F1279 through P04-F1288 |
| `payarc_paymentcloud` | Payarc or PaymentCloud | Step 10 | LR-013, LR-014 |
| `rapyd` | Rapyd | Step 10 | P04-F1306 through P04-F1316 |
| `authorize_net` | Authorize.Net | Step 10 | LR-013, LR-014 |
| `custom` | Custom HTTPS gateway | Step 10 | P04-F1329 through P04-F1337 |

## 6. Evidence requirements

A feature is complete only when the owning step handoff records:

1. canonical source key or latest requirement identifier;
2. implementation files and database migrations;
3. UI route and API surface when applicable;
4. RLS policy and permission rule when persisted;
5. Zod schema and sanitization boundary;
6. approval, audit, idempotency, and version behavior;
7. verification command or documented acceptance run;
8. official provider source and sandbox evidence when applicable;
9. environment configuration names without values;
10. final status as implemented and verified.

Step 16 creates the release ledger from these handoffs and proves that each source row and latest requirement identifier has exactly one owner and at least one evidence record.

## 7. Duplicate-prevention rules for implementation chats

- Search the repository before creating a service, schema, component, table, route, permission, event, provider identifier, or environment variable.
- Extend the owning registry rather than create a second registry.
- Reuse Step 02 audit, approval, idempotency, encryption, storage, and tenant services.
- Reuse Step 01 errors, logging, validation helpers, UI states, and navigation.
- Provider steps implement only provider-specific translation and verification; shared payment behavior stays in Step 06.
- Domain steps publish events to the Step 14 posting contract and never write parallel accounting ledgers.
- A later step may change an earlier shared file only through the extension rule in `IMPLEMENTATION_PLAN.md` and must record the reason in its handoff.
- If two source rows express the same behavior, one implementation may satisfy both only when the evidence ledger explicitly links both canonical keys.
