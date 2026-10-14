<!-- path: docs/dependency-records/0001-foundation-registry.md -->

# Dependency Record 0001: Foundation Registry

- Date: 2026-10-14
- Step owner: Step 01 (application foundation)
- npm lifecycle: package.json and package-lock.json are owned by the Step 01
  integrator. Later steps may change them only through a recorded dependency
  record approved in their own handoff.

## Runtime dependencies (exact versions)

| Package                         | Version      | Research record (why this exact package)                                                                                                |
| ------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| next                            | 16.4.0       | Supported major (app router, proxy.ts conventions), actively released this month                                                        |
| react                           | 19.2.4       | Peer of Next 16; concurrent features stable                                                                                             |
| react-dom                       | 19.2.4       | Lockstep with react                                                                                                                     |
| zod                             | 4.1.12       | Runtime validation with Standard Schema interop; client and server parity                                                               |
| @hookform/resolvers             | 5.2.2        | Standard Schema resolver bridges Zod 4 to react-hook-form without type drift                                                            |
| react-hook-form                 | 7.63.0       | Form state with accessible error semantics                                                                                              |
| next-themes                     | 0.4.6        | Light/dark/system theme with nonce-compatible inline bootstrap script                                                                   |
| lucide-react                    | 0.545.0      | Sole icon system (single symbol set, tree-shaken)                                                                                       |
| clsx                            | 2.1.1        | Class composition primitive                                                                                                             |
| tailwind-merge                  | 3.3.1        | Conflict-safe Tailwind class merging in `cn()`                                                                                          |
| class-variance-authority        | 0.7.1        | Typed variant systems for shared primitives                                                                                             |
| cmdk                            | 1.1.1        | Accessible command palette engine                                                                                                       |
| recharts                        | 3.2.1        | Declarative SVG charts; token-driven colors via CSS variables                                                                           |
| framer-motion                   | 12.23.24     | Motion primitives with first-class reduced-motion hooks                                                                                 |
| server-only                     | 0.0.1        | Build-time guard against server modules leaking to the client                                                                           |
| tailwindcss                     | 4.3.3        | CSS-first design token pipeline (see ADR 0001)                                                                                          |
| @tailwindcss/postcss            | 4.3.3        | Official PostCSS bridge for Tailwind 4                                                                                                  |
| tw-animate-css                  | 1.4.0        | Tailwind-4-native animation utilities replacing tailwindcss-animate                                                                     |
| @radix-ui/react-* (13 packages) | per lockfile | Unstyled accessible primitives (dialog, sheet, menu, tooltip, toast, tabs, avatar, checkbox, label, popover, separator, slot, progress) |

## Dev dependencies (exact versions)

typescript 5.9.3, eslint 9.37.0, eslint-config-next 16.4.0, prettier 3.6.2,
prettier-plugin-tailwindcss 0.7.1, husky 9.1.7, @types/node, @types/react,
@types/react-dom (all pinned in package.json; lockfile is authoritative).

## Audit status at handoff

- Production scope: `npm audit --omit=dev` = 0 vulnerabilities (verified 2026-10-14).
- Full tree: 5 high-severity findings in one dev-only chain:
  `eslint-config-next@16 -> @next/eslint-plugin-next@16.4.0 (exact-pins fast-glob@3.3.1) -> micromatch -> braces`.
- Decision: documented exception, not an acceptance blocker. Rationale:
  the advisories are unpatchable upstream today (`braces` has no fixed
  version; npm's only suggested remediation downgrades the lint stack to the
  Next 14 line, which would violate the supported-stack requirement). The
  chain runs only at lint time over this repository's own authored files;
  it never ships to production and has no untrusted input path.
- Review trigger: re-run the full audit at the start of every step chat;
  upgrade or substitute the lint chain the moment a compliant release of
  `eslint-config-next` or its transitive packages appears.

## Resolved earlier in this step

- tailwindcss 3.4.19 dev chain (10 findings incl. postcss-selector-parser,
  chokidar, postcss-nested): fully cleared by migrating to the Tailwind CSS 4
  line (tailwindcss 4.3.3, @tailwindcss/postcss, tw-animate-css 1.4.0).
  tailwindcss-animate and autoprefixer removed (dead dependencies).
