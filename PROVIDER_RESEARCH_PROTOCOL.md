// path: PROVIDER_RESEARCH_PROTOCOL.md

# Payment Provider Official Documentation Protocol

Version: 1.0  
Effective date: 2026-10-14

## 1. Purpose

No provider-specific implementation may be written or changed from memory. The implementation chat must retrieve current official documentation from the provider's own website immediately before provider code work. The resulting research record is a required implementation artifact, not optional commentary.

## 2. Required research sequence

For each provider in the active step:

1. Open the official API documentation starting point listed below.
2. Open the official sandbox, test-mode, or developer-account documentation.
3. Follow official links to the exact APIs and frontend components being implemented.
4. Record the retrieval date and every authoritative URL.
5. Record current API versions and version headers.
6. Record authentication and credential fields, including environment differences.
7. Record official SDK and browser package names and exact versions when required.
8. Record hosted checkout or hosted-field requirements and permitted CSP origins.
9. Record token lifetime, reuse rules, storage restrictions, and PCI boundary.
10. Record 3D Secure support and the provider's result fields.
11. Record provider idempotency semantics and retry requirements.
12. Record webhook signature algorithm, raw-body needs, timestamp tolerance, replay controls, and event identity.
13. Record connection-test operations, payment lifecycle, capture, void, refund, dispute, payout, and subscription capabilities.
14. Record rate limits, timeout guidance, retryable errors, non-retryable errors, fraud signals, insufficient-funds signals, and normalized error mapping.
15. Record sandbox credentials flow and official test values without committing secrets.
16. Compare all findings to the shared adapter interface and declare capabilities accurately.
17. Only then write or modify provider-specific code.

If an official source does not establish a security-critical behavior, the adapter must not invent it. Its capability remains disabled until official documentation establishes the behavior.

## 3. Evidence record

Each provider implementation creates an English research record under `docs/providers/` with these sections:

- Provider and adapter identifier
- Research date in UTC
- Official URLs consulted
- API version and changelog reference
- Authentication and credential model
- Sandbox or test-account setup
- Official server and browser packages
- Hosted card-data boundary
- Token lifecycle
- Payment and capture lifecycle
- 3D Secure behavior
- Idempotency behavior
- Webhook verification
- Refund, void, dispute, payout, and subscription capabilities
- Fraud and decline signals
- Rate limits, timeouts, and retries
- CSP and redirect requirements
- Normalized capability matrix
- Redacted sandbox acceptance evidence
- Integrator dependency decision

The record must contain observed facts and source links. It must not contain secret values, copied credentials, raw card data, or unsupported assumptions.

## 4. Official starting points

### 4.1 Stripe

- API: https://stripe.com/docs/api
- Testing: https://stripe.com/docs/testing

### 4.2 NMI

- Collect.js: https://docs.nmi.com/docs/collectjs
- API documentation: https://docs.nmi.com/
- Sandbox: https://docs.nmi.com/docs/testing-sandbox
- Official machine-readable index: https://docs.nmi.com/llms.txt

NMI research must cover both Collect.js and the current official Payment Component package. Collect.js remains the product default. Both modes must converge on the shared server-side NMI REST module.

### 4.3 Adyen

- API and platform documentation: https://docs.adyen.com/
- Testing: https://docs.adyen.com/development-resources/testing/

### 4.4 Verifone 2Checkout

- API and platform documentation: https://docs.verifone.com/
- Development partner and sandbox starting point: https://www.verifone.com/development-partner

### 4.5 Braintree by PayPal

- API documentation: https://developer.paypal.com/braintree/docs
- Sandbox help: https://developer.paypal.com/braintree/help/sandboxHelp

### 4.6 BlueSnap

- API documentation: https://developers.bluesnap.com/
- Official machine-readable index: https://developers.bluesnap.com/llms.txt

The implementation session must use the official index to locate and record the current test-mode page. It must not use an obsolete 404 path.

### 4.7 Square

- API documentation: https://developer.squareup.com/docs
- Sandbox: https://developer.squareup.com/docs/testing/sandbox

### 4.8 Payoneer

- API reference: https://developer.payoneer.com/docs/payoneer-api-reference
- Developer portal: https://developer.payoneer.com/

### 4.9 FastSpring

- API overview: https://developer.fastspring.com/reference/api-overview

The implementation session must discover and record the current official test or sandbox instructions from FastSpring's own documentation.

### 4.10 Paddle

- API and platform documentation: https://developer.paddle.com/
- Sandbox: https://developer.paddle.com/sdks/sandbox/

### 4.11 PayPro Global

- API overview: https://developers.payproglobal.com/docs/api/overview/

The implementation session must discover and record the current official sandbox or test-mode instructions from PayPro Global's own documentation.

### 4.12 PayPal standalone

- REST API: https://developer.paypal.com/api/rest/
- Sandbox: https://developer.paypal.com/sandbox-testing/overview

The standalone PayPal adapter is separate from Braintree in code, credentials, registry identity, webhooks, and capability evidence.

### 4.13 Payarc or PaymentCloud

- API documentation: https://docs.payarc.net/

The implementation session must discover and record the current official sandbox instructions. The adapter capability record must reflect the contracted API rather than treating two commercial relationships as interchangeable at runtime.

### 4.14 Rapyd

- API documentation: https://docs.rapyd.net/

The implementation session must discover and record the current official sandbox instructions from Rapyd documentation.

### 4.15 Authorize.Net

- API reference: https://developer.authorize.net/api/reference/index.html
- Sandbox introduction: https://developer.authorize.net/hello_world/sandbox.html
- Testing guide: https://developer.authorize.net/hello_world/testing_guide.html

### 4.16 Custom HTTPS gateway

The Custom adapter has no provider-specific documentation. Its authority is the internal protocol specification produced in Step 10. That specification must require:

- HTTPS only;
- explicit host and port allowlists;
- DNS resolution and re-resolution checks;
- private, loopback, link-local, and metadata network blocking;
- strict request and response Zod schemas;
- modeled authentication fields encrypted at rest;
- deterministic idempotency headers;
- signed callback verification;
- explicit timeout and retry policy;
- no arbitrary code, template execution, browser script, or unmodeled redirect;
- no silent routing fallback.

## 5. Provider wave ownership

| Step | Providers |
|---|---|
| 07 | Stripe, NMI, Adyen, Verifone 2Checkout |
| 08 | Braintree, BlueSnap, Square, Payoneer |
| 09 | FastSpring, Paddle, PayPro Global, PayPal standalone |
| 10 | Payarc or PaymentCloud, Rapyd, Authorize.Net, Custom HTTPS gateway |

A provider is researched and implemented only in its owning step. Later modifications require a fresh official-documentation read in that later chat.

## 6. Dependency integrator gate

Before adding a provider package, the active chat creates or updates the dependency decision record with:

- official package name and registry link;
- exact version and release date;
- official provider documentation linking that package;
- runtime target and client or server boundary;
- license;
- integrity and provenance evidence;
- known vulnerability review;
- bundle-size or server-runtime impact;
- alternatives considered;
- integrator approval.

Only the logical integrator owner changes `package.json` and the lockfile. NMI Payment Component package installation always passes this gate. A package is not added merely because an unofficial example uses it.

## 7. Sandbox acceptance minimum

For every supported capability, the provider record includes redacted evidence of the applicable official sandbox paths:

- credential or connection check;
- successful authorization or sale;
- 3D Secure success and failure when supported;
- ordinary decline;
- insufficient funds classification when the sandbox supports it;
- duplicate idempotency behavior;
- invalid and valid webhook signature behavior;
- capture, void, and refund when supported;
- token reuse or expiry behavior where testable;
- provider fraud signal where the sandbox exposes it;
- secret and PII redaction in logs and monitoring.

Unsupported capabilities are disabled in the registry and control plane. They are never represented as successful no-op behavior.
