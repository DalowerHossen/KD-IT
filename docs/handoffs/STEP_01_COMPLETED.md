<!-- path: docs/handoffs/STEP_01_COMPLETED.md -->

# Step 01 Handoff: Foundation and Shared Application Shell

- Date: 2026-10-14
- Branch: arena/8c8370ee-kd-it
- Commit: recorded below at handoff time (single commit, subject
  `feat(foundation): complete step 01 application foundation`)

## Scope delivered

### Project and toolchain

- Next.js 16.4.0 (App Router, `proxy.ts` conventions) + React 19.2.4, strict
  TypeScript 5.9.3, exact pinned dependencies, committed lockfile, engines
  pinned (Node >= 20.9), `.npmrc` (engine-strict, save-exact), `.nvmrc`.
- Formatting: Prettier 3.6.2 + prettier-plugin-tailwindcss; enforced by
  `npm run format:check` and husky pre-commit hook.
- Linting: flat `eslint.config.mjs` on eslint-config-next 16.4.0
  (core-web-vitals + typescript), English-only no-restricted-syntax selectors,
  zero-warning gate.
- Quality scripts in `scripts/` executed by `npm run quality:scans`:
  English-only scan, path-header scan, no-tests scan, unfinished-marker scan,
  navigation/route integrity scan.

### Configuration and runtime safety

- Zod-validated environment with fail-fast boot (`instrumentation.ts`):
  invalid configuration aborts startup with a structured error log naming
  every offending variable (verified: `LOG_LEVEL=verbose` refuses to start).
- `.env.example` documents every variable; client env via `lib/config/env.ts`,
  server env via `lib/config/server-env.ts` (`server-only` guard).

### Platform contracts

- Structured JSON logger with level, service, timestamp, correlation id, and
  recursive PII/secret redaction (`lib/logging/*`).
- Typed error taxonomy with stable machine codes (`lib/errors/app-error.ts`).
- Standard API envelope for success and error including correlation id and
  timestamp (`lib/api/envelope.ts`), exercised by `app/api/health/route.ts`.
- Shared Zod helpers (`lib/validation/zod-helpers.ts`) and input sanitization
  (`lib/validation/sanitize.ts`); USD canonical decimal-string schema and
  string-based display formatting (no float money anywhere).
- Central navigation map + route metadata + role-based permission hooks
  (`config/nav-map.ts`, `lib/providers/session-provider.tsx`,
  `lib/hooks/use-permissions.ts`).

### Design system (Tailwind CSS 4, CSS-first theme)

- Semantic tokens for light, dark, and high-contrast; eight chart colors;
  typography presets caption..display-2xl; spacing/radius/shadow/z-index/
  motion scales; breakpoints including 320px (`xs`), 1600px page container.
- 27 shared primitives and composites in `components/ui/`: button, input,
  textarea, label, checkbox, badge, card, skeleton, spinner, separator,
  avatar, progress, tag, table, pagination, form (RHF-aware), toast/toaster/
  use-toast, dialog, sheet, dropdown-menu, popover, tabs, tooltip, command,
  breadcrumb.
- Page states: loading, error (with reference + retry + report), empty,
  success (`components/states/*`).
- Layout contracts: public header/footer, auth split shell, app shell
  (persisted collapsible sidebar, topbar, offline banner, breadcrumb,
  shortcut reference), token-portal shell (noindex), skip link, page header
  (`components/layout/*`).
- Motion primitives honoring `prefers-reduced-motion`; chart container and
  legend driven by design tokens (`components/motion`, `components/charts`).
- Command palette (Ctrl/Cmd+K), not-found site search, offline detection.

### Application surface

- `/` public home (complete copy), `/design-system` (noindexed reference for
  every token, primitive, state, overlay, chart, motion, and shell),
  `/api/health` envelope endpoint, 404 page with working search, route-level
  error and global error boundaries, loading state, web manifest, robots,
  favicon, generated Open Graph image.
- Route groups `(auth)`, `(dashboard)`, `(admin)`, `(portal)` contain layout
  contracts only - no incomplete feature routes were created (those steps own
  their pages).

## Verification evidence (all executed 2026-10-14)

| Gate                                                  | Result                                                                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run quality` (format + lint + typecheck + scans) | PASS                                                                                                                                                 |
| English-only scan                                     | PASS (0 non-ASCII bytes in product artifacts)                                                                                                        |
| Path-header scan                                      | PASS (every authored file)                                                                                                                           |
| No automated test files scan                          | PASS                                                                                                                                                 |
| Unfinished-marker scan                                | PASS                                                                                                                                                 |
| Navigation/route integrity scan                       | PASS (2 registered paths, 2 routes)                                                                                                                  |
| `npm run typecheck`                                   | PASS (strict, zero errors)                                                                                                                           |
| `npm run lint`                                        | PASS (`--max-warnings=0`)                                                                                                                            |
| `npm run build`                                       | PASS (compiled, 8 pages generated)                                                                                                                   |
| Clean install                                         | PASS (`rm -rf node_modules .next && npm ci` 11.4s; full quality + build green)                                                                       |
| `npm audit --omit=dev`                                | PASS - 0 vulnerabilities                                                                                                                             |
| Full `npm audit`                                      | 5 high findings, dev-only lint chain; documented exception in `docs/dependency-records/0001-foundation-registry.md`                                  |
| Env fail-safe                                         | PASS (`LOG_LEVEL=verbose` aborts boot with structured log)                                                                                           |
| Runtime smoke (production server)                     | PASS - `/` 200, `/design-system` 200, `/api/health` 200 with envelope + correlation id, unknown path 404, nonce CSP + HSTS + full header set present |

## Known constraints and follow-ups for later steps

- Pages render dynamically by design (per-request nonce CSP); plan caching
  accordingly (see ADR 0001).
- Keep `config/design-tokens.ts` and the `@theme` block in sync when tokens
  change; the design system page shows both for visual parity.
- Re-run `npm audit` (full tree) at the start of every step; the five dev-only
  findings clear when a compliant `eslint-config-next` release ships.
- Steps 02+ register their routes in `config/nav-map.ts`; the sidebar and
  command palette pick them up automatically.
- The dev-only audit exception is re-justified each step; it is not a
  standing waiver.
