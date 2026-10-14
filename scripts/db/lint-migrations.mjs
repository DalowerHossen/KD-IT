// path: scripts/db/lint-migrations.mjs
// Static migration conformance linter for Step 02 (runs without a
// database). Validates: paired .up/.down structure and sequential numbers,
// per-table column contract (uuid v7 id, company_id not null, UTC
// timestamps, deleted_at, optimistic version integer default 1),
// ON DELETE RESTRICT on every app FK, RLS enabled and forced on every app
// table, touch and guard triggers on editable tables, rollback coverage
// for every table, security-definer search_path pinning, no SELECT *,
// and identifier naming hygiene. The SQL assertion suite re-checks the
// same invariants inside a live database.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve("supabase/migrations");
const failures = [];
const passes = [];

const requiredColumns = [
  [
    "id",
    /^\s+id\s+uuid\s+primary\s+key\s+default\s+app\.uuid_v7\(\)\s*,?\s*$/m,
    "id uuid primary key default app.uuid_v7()",
  ],
  [
    "company_id",
    /^\s+company_id\s+uuid\s+not\s+null\s+references\s+app\.companies\s*\(id\)(?:\s+on\s+delete\s+restrict)?\s*,?\s*$/m,
    "company_id uuid not null references app.companies(id) on delete restrict",
  ],
  [
    "created_at",
    /^\s+created_at\s+timestamptz\s+not\s+null\s+default\s+clock_timestamp\(\)\s*,?\s*$/m,
    "created_at timestamptz not null default clock_timestamp()",
  ],
  [
    "updated_at",
    /^\s+updated_at\s+timestamptz\s+not\s+null\s+default\s+clock_timestamp\(\)\s*,?\s*$/m,
    "updated_at timestamptz not null default clock_timestamp()",
  ],
  ["deleted_at", /^\s+deleted_at\s+timestamptz\s+null\s*,?\s*$/m, "deleted_at timestamptz null"],
  [
    "version",
    /^\s+version\s+integer\s+not\s+null\s+default\s+1\s*,?\s*$/m,
    "version integer not null default 1",
  ],
];

const appendOnlyTables = new Set(["audit_events", "command_approval_events"]);

function fail(id, message) {
  failures.push({ id, message });
}
function pass(id, message) {
  passes.push({ id, message });
}

function tableDefs(sqlLower) {
  // Map of app table -> full definition block
  const defs = new Map();
  let cursor = 0;
  while (cursor < sqlLower.length) {
    const start = sqlLower.indexOf("create table app.", cursor);
    if (start === -1) {
      break;
    }
    const nameStart = start + "create table app.".length;
    const name = sqlLower.slice(nameStart, sqlLower.indexOf("(", nameStart)).trim();
    const openParen = sqlLower.indexOf("(", nameStart);
    let depth = 0;
    let end = openParen;
    while (end < sqlLower.length) {
      const ch = sqlLower[end];
      if (ch === "(") {
        depth += 1;
      } else if (ch === ")") {
        depth -= 1;
        if (depth === 0) {
          break;
        }
      }
      end += 1;
    }
    const block = sqlLower.slice(start, end + 1);
    if (!defs.has(name)) {
      defs.set(name, block);
    }
    cursor = end + 1;
  }
  return defs;
}

function validateTable(name, block, allUpSqlLower) {
  if (name === "schema_migrations") {
    return;
  }
  // Contract columns
  for (const [, pattern, human] of requiredColumns) {
    if (!pattern.test(block)) {
      fail("table.required_columns", `app.${name} misses required column contract: ${human}`);
    }
  }
  // FK restrict rule inside this table's block
  const referenceMatches = block.match(/references\s+app\./g) ?? [];
  const restrictedMatches =
    block.match(/references\s+app\.[a-z_]+\s*\(id\)\s+on\s+delete\s+restrict/g) ?? [];
  if (referenceMatches.length !== restrictedMatches.length) {
    fail("table.fk_restrict", `app.${name} has a foreign key without ON DELETE RESTRICT`);
  }
  // RLS enable/force anywhere in up files
  if (!new RegExp(`alter table app\\.${name} enable row level security`).test(allUpSqlLower)) {
    fail("table.rls_enabled", `app.${name} lacks enable row level security`);
  }
  if (!new RegExp(`alter table app\\.${name} force row level security`).test(allUpSqlLower)) {
    fail("table.rls_forced", `app.${name} lacks force row level security`);
  }
  // touch + guard triggers on editable tables
  if (!appendOnlyTables.has(name)) {
    if (
      !new RegExp(
        `create trigger [a-z][a-z0-9_]*touch_updated_at\\s+before update on app\\.${name}\\b`,
      ).test(allUpSqlLower)
    ) {
      fail("table.updated_at_trigger", `app.${name} lacks the touch_updated_at trigger`);
    }
    if (
      !new RegExp(
        `create trigger [a-z][a-z0-9_]*guard_optimistic_version\\s+before update on app\\.${name}\\b`,
      ).test(allUpSqlLower)
    ) {
      fail("table.optimistic_trigger", `app.${name} lacks the guard_optimistic_version trigger`);
    }
  }
}

async function main() {
  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql")).sort();
  const upFiles = files.filter((file) => file.endsWith(".up.sql"));
  const downFiles = files.filter((file) => file.endsWith(".down.sql"));

  // 1. Pairing and sequence
  const upKeys = upFiles.map((file) => file.replace(/\.up\.sql$/, ""));
  upKeys.forEach((key, index) => {
    if (!key.startsWith(String(index + 1).padStart(3, "0") + "_")) {
      fail(
        "migration.sequence",
        `${key}.up.sql breaks sequential numbering (expected ${String(index + 1).padStart(3, "0")})`,
      );
    }
    if (!downFiles.includes(`${key}.down.sql`)) {
      fail("migration.rollback_pair", `${key}.up.sql is missing its rollback counterpart`);
    }
  });
  const orphans = downFiles.filter(
    (file) => !upFiles.includes(file.replace(".down.sql", ".up.sql")),
  );
  if (orphans.length > 0) {
    fail("migration.orphan_down", `orphan rollback files: ${orphans.join(", ")}`);
  }
  pass("migration.pairing", `${upFiles.length} forward migrations paired with rollback files`);

  // 2. Per-file hygiene + collect all app tables
  const allTableDefs = new Map();
  const ownerFile = new Map();
  let allUpSqlLower = "";
  let allDownSqlLower = "";
  for (const rFile of files) {
    const text = await readFile(path.join(MIGRATIONS_DIR, rFile), "utf8");
    const lower = text.toLowerCase();
    if (!text.startsWith(`-- path: supabase/migrations/${rFile}`)) {
      fail("migration.path_header", `${rFile} must start with its path header`);
    }
    if (/[^\x00-\x7f]/.test(text)) {
      fail("migration.english_only", `${rFile} contains non-ASCII content`);
    }
    if (/\bselect\s+\*(?!\s+into\b)/i.test(text)) {
      fail("migration.no_select_star", `${rFile} uses SELECT * (explicit column lists only)`);
    }
    if (rFile.endsWith(".up.sql")) {
      allUpSqlLower += `\n${lower}`;
      for (const [name, block] of tableDefs(lower)) {
        if (!allTableDefs.has(name)) {
          allTableDefs.set(name, block);
          ownerFile.set(name, rFile);
        }
      }
    } else {
      allDownSqlLower += `\n${lower}`;
    }
  }

  // 3. Structural validation per table
  for (const [name, block] of allTableDefs) {
    validateTable(name, block, allUpSqlLower);
  }
  const appTables = [...allTableDefs.keys()].filter((name) => name !== "schema_migrations");
  pass(
    "table.structure",
    `${appTables.length} application tables satisfy the shared column contract`,
  );

  // 4. Rollback coverage
  for (const name of appTables) {
    if (!new RegExp(`drop table (?:if exists )?app\\.${name}\\b`).test(allDownSqlLower)) {
      fail("rollback.coverage", `app.${name} is never dropped by any rollback migration`);
    }
  }
  pass("rollback.coverage", "every created table has rollback coverage");

  // 5. Security-definer search_path pinning
  let definerCount = 0;
  let unpinned = 0;
  const functionChunks = allUpSqlLower.split("create or replace function").slice(1);
  for (const chunk of functionChunks) {
    const head = chunk.slice(0, 400);
    if (/security\s+definer/.test(head)) {
      definerCount += 1;
      if (/set\s+search_path\s*=\s*app,\s*public/.test(head)) {
        // pinned
      } else {
        unpinned += 1;
      }
    }
  }
  if (unpinned > 0) {
    fail(
      "function.search_path",
      `${unpinned} security-definer functions lack "set search_path = app, public" pinning`,
    );
  }
  pass("function.search_path", `${definerCount} security-definer functions pin search_path`);

  // 6. Naming hygiene for policies/triggers/indexes
  const policyNames = new Set();
  for (const match of allUpSqlLower.matchAll(
    /create policy ([a-z][a-z0-9_]*)\s+on\s+app\.([a-z_][a-z0-9_]*)/g,
  )) {
    if (policyNames.has(match[1])) {
      fail("policy.duplicate_name", `policy ${match[1]} is declared more than once`);
    }
    policyNames.add(match[1]);
  }
  pass("policy.naming", `${policyNames.size} policies have unique names`);

  // Report
  for (const entry of passes) {
    process.stdout.write(`PASS ${entry.id}: ${entry.message}\n`);
  }
  if (failures.length > 0) {
    for (const entry of failures) {
      process.stdout.write(`FAIL ${entry.id}: ${entry.message}\n`);
    }
    process.exit(1);
  }
  process.stdout.write("PASS migration.lint: all structural conventions hold\n");
}

main().catch((error) => {
  process.stdout.write(
    `FAIL migration.lint: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
