<!-- path: docs/dependency-records/0003-step-02-data-plane.md -->

# Dependency Record 0003 - Step 02 Data Plane

## Approved in this record

| Package                 | Version | Runtime role                                                                                                                | Approved for                                 |
| ----------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `@supabase/supabase-js` | 2.117.3 | Supabase browser/server/privileged clients (auth headers, RLS-bound queries, storage API)                                   | Browser + server runtime                     |
| `pg`                    | 8.23.1  | Direct PostgreSQL driver for privileged server-side access: migrations, RLS-bound transactions, advisory/SKIP-LOCKED queues | Server runtime only (`import "server-only"`) |
| `decimal.js`            | 10.6.0  | Arbitrary-precision money arithmetic on canonical decimal strings                                                           | Browser + server runtime                     |
| `@types/pg` (dev)       | 8.23.1  | Type definitions for `pg`                                                                                                   | Development only                             |

## Rules the boundary enforces

1. **Money:** `pg` numeric and int8 response values parse to strings at the driver level; `decimal.js`
   works only on canonical digit strings; no JavaScript `Number`/`parseInt`/`parseFloat` ever enters
   monetary math (enforced in `lib/db/pg/`, `lib/money/decimal.ts`, and acceptance scripts).
2. **Server boundary:** `pg`, the privileged Supabase client, and all data-plane modules sit in
   server-only modules; a committed client-bundle secret scan (`scripts/check-bundle-secrets.sh`)
   plus the existing English-only/prohibited-artifact scans guard releases.
3. **No Google SDK / Distribution risk:** Google Drive integration deliberately uses direct REST
   (service-account JWT) instead of the `googleapis` SDK to shrink surface area; credentials are
   stored only AES-256-GCM-encrypted and decrypted on use inside server boundaries.
4. **Audit:** `npm audit --omit=dev --audit-level=high` after install; results recorded in the
   step handoff.
5. **Versions:** exact pinned versions in `package.json` (npm default saving-disabled by this
   record); all four added after product review of known risks (supabase-js SSR key handling,
   pg numeric coercion pitfalls, decimal.js rounding mode default).

## Post-install audit evidence

Recorded in `docs/handoffs/STEP_02_COMPLETED.md` section "Verification evidence".
