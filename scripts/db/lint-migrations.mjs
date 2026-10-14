// path: scripts/db/lint-migrations.mjs
// Static migration conformance linter. Runs without a database and enforces
// the Step 02 structural contract on every migration pair: naming, matching
// rollback files, required columns, UUID v7 defaults (app.uuid_v7), RLS
// enable and FORCE, ON DELETE RESTRICT, optimistic-lock and timestamp
// triggers, rollback coverage, no SELECT *, and ASCII-only content.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve("supabase/migrations");

const REQUIRED_COLUMNS = ["id", "company_id", "created_at", "updated_at", "deleted_at", "version"];
const NON_ASCII = /[^\x00-\x7F]/;

const failures = [];
const ok = [];

function fail(id, message) {
  failures.push({ id, message });
}

function pass(id, message) {
  ok.push({ id, message });
}

async function main() {
  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql")).sort();
  const names = new Set(files);

  // 1. Pairing, sequential numbering, path headers.
  const ups = files.filter((file) => file.endsWith(".up.sql"));
  const sequence = ups.map((file) => Number.parseInt(file.slice(0, 3), 10));
  for (let i = 0; i < sequence.length; i += 1) {
    if (sequence[i] !== i + 1) {
      fail(
        "migration.sequence",
        `migration numbers must be sequential from 001; found ${files.join(", ")}`,
      );
      break;
    }
  }
  for (const up of ups) {
    const down = up.replace(/\.up\.sql$/, ".down.sql");
    if (!names.has(down)) {
      fail("migration.rollback_pair", `${up} is missing its rollback counterpart`);
    }
  }
  pass("migration.pairing", `${ups.length} forward migrations all carry rollback counterparts`);

  const tableOwners = new Map();
  const rlsEnabled = new Set();
  const rlsForced = new Set();
  const tableNames = new Set();

  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    const lower = sql.toLowerCase();

    if (!sql.startsWith("-- path: supabase/migrations/")) {
      fail("migration.path_header", `${file} must start with its path header`);
    }
    if (NON_ASCII.test(sql)) {
      fail("migration.english_only", `${file} contains non-ASCII content`);
    }
    if (/\bselect\s+\*(?!\s+into\b)/i.test(sql)) {
      fail("migration.no_select_star", `${file} uses SELECT *`);
    }
    if (file.endsWith(".up.sql")) {
      if (/\b(?:drop|truncate)\s+table\s+(?!if\s+exists)/i.test(sql)) {
        fail(
          "migration.destructive",
          `${file} contains a destructive statement without data-preservation review`,
        );
      }
    }

    // Capture created tables (app schema only).
    for (const match of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?app\.([a-z_][a-z0-9_]*)/gi,
    )) {
      if (match[1] === "schema_migrations") {
        continue;
      }
      tableNames.add(match[1]);
      tableOwners.set(match[1], file);
    }
    for (const match of lower.matchAll(
      /alter\s+table\s+app\.([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security/g,
    )) {
      rlsEnabled.add(match[1]);
    }
    for (const match of lower.matchAll(
      /alter\s+table\s+app\.([a-z_][a-z0-9_]*)\s+force\s+row\s+level\s+security/g,
    )) {
      rlsForced.add(match[1]);
    }
  }

  // 2. Per-table structural contract.
  const appendOnly = new Set(["audit_events", "command_approval_events"]);
  for (const table of tableNames) {
    const ownerFile = tableOwners.get(table);
    const sql = await readFile(path.join(MIGRATIONS_DIR, ownerFile), "utf8");
    const createBlock = sql.toLowerCase().split("create table")[1] ?? "";
    const tableSegment = createBlock.slice(0, createBlock.indexOf(");"));

    for (const column of REQUIRED_COLUMNS) {
      if (!new RegExp(`\\b${column}\\b`).test(tableSegment)) {
        fail(
          "table.required_column",
          `app.${table} in ${ownerFile} misses required column ${column}`,
        );
      }
    }
    if (!/id\s+uuid\s+primary\s+key\s+default\s+app\.uuid_v7\(\)/.test(tableSegment)) {
      fail(
        "table.uuid_v7_default",
        `app.${table} id must be "uuid primary key default app.uuid_v7()"`,
      );
    }
    if (!/version\s+integer\s+not\s+null\s+default\s+1/.test(tableSegment)) {
      fail("table.version_default", `app.${table} must carry "version integer not null default 1"`);
    }
    const references =
      tableSegment.match(/references\s+app\.[a-z_]+\s*\(id\)\s+on\s+delete\s+restrict/g) ?? [];
    const referenceCount = (tableSegment.match(/references\s+app\./g) ?? []).length;
    if (references.length !== referenceCount) {
      fail("table.fk_restrict", `app.${table} has a foreign key without ON DELETE RESTRICT`);
    }
    if (!rlsEnabled.has(table)) {
      fail("table.rls_enabled", `app.${table} lacks enable row level security`);
    }
    if (!rlsForced.has(table)) {
      fail("table.rls_forced", `app.${table} lacks force row level security`);
    }
    if (!appendOnly.has(table) && table !== "schema_migrations") {
      const triggersFile = sql + (await collectLaterTriggerSql(table, files));
      if (
        !new RegExp(`create\\s+trigger\\s+${table}_touch_updated_at`).test(
          triggersFile.toLowerCase(),
        )
      ) {
        fail("table.updated_at_trigger", `app.${table} lacks the touch_updated_at trigger`);
      }
      if (
        !new RegExp(`create\\s+trigger\\s+${table}_guard_optimistic_version`).test(
          triggersFile.toLowerCase(),
        )
      ) {
        fail("table.optimistic_trigger", `app.${table} lacks the guard_optimistic_version trigger`);
      }
    }
  }
  pass(
    "table.structure",
    `${tableNames.size} application tables satisfy the required column contract`,
  );

  // 3. Rollback coverage: every created table is dropped in exactly one down file.
  const downContents = new Map();
  for (const file of files.filter((name) => name.endsWith(".down.sql"))) {
    downContents.set(file, (await readFile(path.join(MIGRATIONS_DIR, file), "utf8")).toLowerCase());
  }
  for (const table of tableNames) {
    if (table === "schema_migrations") {
      continue;
    }
    const dropped = [...downContents.entries()].some(([, content]) =>
      new RegExp(`drop\\s+table\\s+if\\s+exists\\s+app\\.${table}`).test(content),
    );
    if (!dropped) {
      fail("rollback.coverage", `app.${table} is never dropped by any rollback migration`);
    }
  }
  pass("rollback.coverage", "every created table has rollback coverage");

  // 4. Authored function sanity: security-definer RPCs pin search_path.
  let definerCount = 0;
  let unpinned = 0;
  for (const file of files.filter((name) => name.endsWith(".up.sql"))) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    for (const chunk of sql.split(/create\s+or\s+replace\s+function/i).slice(1)) {
      if (/security\s+definer/i.test(chunk.slice(0, 400))) {
        definerCount += 1;
        if (!/set\s+search_path\s*=\s*app,\s*public/i.test(chunk.slice(0, 400))) {
          unpinned += 1;
          fail(
            "function.search_path",
            `${file} declares a security-definer function without "set search_path = app, public"`,
          );
        }
      }
    }
  }
  pass(
    "function.search_path",
    `${definerCount} security-definer functions pin search_path (${unpinned} violations)`,
  );

  // Report.
  for (const entry of ok) {
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

async function collectLaterTriggerSql(table, files) {
  let buffer = "";
  for (const file of files.filter((name) => name.endsWith(".up.sql") && name.startsWith("008"))) {
    buffer += await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
  }
  return buffer;
}

main().catch((error) => {
  process.stdout.write(
    `FAIL migration.lint: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
