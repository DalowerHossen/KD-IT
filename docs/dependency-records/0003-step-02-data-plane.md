// path: docs/dependency-records/0003-step-02-data-plane.md

# Dependency Record 0003: Step 02 Data Plane Additions

- Date: 2026-10-14
- Step owner: Step 02 (secure data plane)
- Integrator decision: approved for this step's manifest change

## Requests

| Package               | Exact version | Reason                                                                                                                                              | Review                                                                  |
| --------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| @supabase/supabase-js | 2.117.3       | Official Supabase JavaScript data plane for browser, server, and privileged clients. Official source: supabase.com/docs and registry. License: MIT. | Approved; runtime=browser+server; no alternative with official support. |
| pg                    | 8.23.1        | node-postgres driver used ONLY by migration, rollback, and SQL assertion tooling plus typed numeric-as-string parsing. License: MIT.                | Approved; server/tooling only, never bundled to the client.             |
| @types/pg             | 8.23.1        | Type definitions matching pg 8.x. License: MIT.                                                                                                     | Approved; dev-only.                                                     |
| decimal.js            | 10.6.0        | Approved arbitrary-precision decimal library for money arithmetic (addendum section 2.3). License: MIT; deterministic string-backed operations.     | Approved; alternative big.js lacks required rounding modes.             |

## Boundary rules

- supabase-js service-role keys stay inside `lib/db/clients/privileged.ts` behind `server-only`.
- pg is imported only under `scripts/db/` and `lib/db/driver/` (server-only).
- decimal.js is the only permitted money-arithmetic library; raw Number is prohibited for money.

## Verification

- Exact versions pinned in package.json; lockfile updated by the integrator in this chat.
- `npm audit` re-run after installation; findings recorded in the step handoff.
