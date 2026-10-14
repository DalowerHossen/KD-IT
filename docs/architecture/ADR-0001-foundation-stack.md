<!-- path: docs/architecture/ADR-0001-foundation-stack.md -->

# ADR 0001: Foundation Stack and Security Posture

- Date: 2026-10-14
- Status: Accepted
- Step: 01

## Context

Step 01 defines the toolchain every later step lives inside. Choices here
must be actively supported through the delivery window, strict-TypeScript
clean, and consistent with the security baseline (least privilege, nonce CSP,
fail-fast configuration).

## Decisions

1. Next.js 16 (App Router) with React 19. The middleware hook is authored as
   `proxy.ts` per the current convention (the framework warns on the
   deprecated `middleware.ts` name).
2. TypeScript 5 with strict flags; exactOptionalPropertyTypes stays off so
   shadcn-style prop spreading remains ergonomic.
3. Styling: Tailwind CSS 4, CSS-first theme authored in
   `styles/globals.css` (`@theme` block). The numeric values mirror
   `config/design-tokens.ts`, which is the TypeScript-side source consumed by
   documentation and charts. Chosen over Tailwind 3 because the 3.4.x line
   accumulated unfixable dev-chain audit findings (chokidar/glob/
   postcss-selector-parser) while v4 ships none and is the actively
   maintained line. Dark mode uses the `.dark` class custom variant so
   next-themes can drive it; `.high-contrast` raises muted-text and border
   contrast toward AAA; `prefers-reduced-motion` and `forced-colors` media
   handling live in the same stylesheet.
4. Security headers per request from `proxy.ts`: a fresh nonce per response
   feeds a CSP with `script-src 'self' 'nonce-...' 'strict-dynamic'`; HSTS,
   frame-ancestors none, nosniff, strict referrer policy, and a deny-by-
   default permissions policy. Nonces flow into the root layout through
   request headers, so all pages render dynamically (static prerender
   incompatible with per-request nonces).
5. Configuration: Zod 4 schemas parsed once in `instrumentation.ts`
   (fail-fast at startup, structured error log, process abort). Client-safe
   env access goes through `lib/config/env.ts`; server-only access through
   `lib/config/server-env.ts` guarded by the `server-only` package.
6. Observability: one structured logger (`lib/logging/logger.ts`) emitting
   JSON lines with level, service, timestamp, message, correlation id, and
   redacted context. One typed error taxonomy (`lib/errors/app-error.ts`)
   mapped one-to-one onto the API envelope (`lib/api/envelope.ts`).
7. Zod 4 is used across client and server; forms bind via
   `@hookform/resolvers/standard-schema` so input types never drift between
   validation and form state.
8. No automated test source files in this project phase (explicit owner
   requirement); correctness is enforced by typecheck, lint, scans, and the
   scripted gates in `scripts/`.

## Consequences

- Pages are dynamic (nonce CSP); caching strategy must account for this.
- Token edits must keep `config/design-tokens.ts` and the `@theme` block in
  sync; the design-system page surfaces both for visual verification.
- Downgrading eslint-config-next below the Next 16 line is prohibited by the
  audit-exception decision recorded in
  `docs/dependency-records/0001-foundation-registry.md`.
