// path: scripts/db/lib/runner.mjs
// Shared migration runner library used by db:migrate, db:rollback, and
// db:assert. Uses the direct PostgreSQL driver with numeric-safe type
// parsing; credentials come only from environment configuration.

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import pg from "pg";

const { Client, types } = pg;

// Money and wide counters must never pass through a JavaScript number.
types.setTypeParser(1700, (value) => value); // numeric
types.setTypeParser(20, (value) => value); // int8 / bigint
types.setTypeParser(701, (value) => {
  throw new Error("float8 is prohibited in this platform (value: " + String(value) + ")");
});

const MIGRATIONS_DIR = path.resolve("supabase/migrations");
const ASSERTIONS_FILE = path.resolve("supabase/assertions/step-02-assert.sql");

function log(level, message, context) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "kd-solution-it",
    tool: "db-runner",
    message,
    ...(context === undefined ? {} : { context }),
  };
  process.stdout.write(JSON.stringify(entry) + "\n");
}

export async function listMigrationPairs() {
  const files = await readdir(MIGRATIONS_DIR);
  const ups = new Map();
  const downs = new Map();
  for (const file of files) {
    const match = /^(\d{3})_([a-z0-9_]+)\.(up|down)\.sql$/.exec(file);
    if (match === null) {
      continue;
    }
    const key = `${match[1]}_${match[2]}`;
    (match[3] === "up" ? ups : downs).set(key, file);
  }
  const pairs = [...ups.keys()].sort().map((key) => {
    if (!downs.has(key)) {
      throw new Error(`Migration ${key} is missing its rollback counterpart.`);
    }
    return { name: key, up: ups.get(key), down: downs.get(key) };
  });
  return pairs;
}

function checksum(sql) {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

export function requireDatabaseUrl() {
  const url = process.env.KD_DATABASE_URL ?? process.env.DATABASE_URL;
  if (url === undefined || url.trim() === "") {
    log("error", "database.url_missing", {
      hint: "Set KD_DATABASE_URL (or DATABASE_URL) to a PostgreSQL connection string, then re-run.",
      example: "postgres://postgres:postgres@127.0.0.1:5432/kd_platform",
    });
    process.exit(1);
  }
  return url;
}

export async function connect() {
  const client = new Client({ connectionString: requireDatabaseUrl() });
  await client.connect();
  return client;
}

async function appliedMigrations(client) {
  const result = await client.query(
    "select migration_name, direction, applied_at from app.schema_migrations order by id",
  );
  const upNames = new Map();
  for (const row of result.rows) {
    if (row.direction === "up") {
      upNames.set(row.migration_name, row.applied_at);
    } else if (upNames.has(row.migration_name)) {
      upNames.delete(row.migration_name);
    }
  }
  return upNames;
}

export async function migrateUp() {
  const pairs = await listMigrationPairs();
  const client = await connect();
  try {
    const applied = await appliedMigrations(client);
    let count = 0;
    for (const pair of pairs) {
      if (applied.has(pair.name)) {
        continue;
      }
      const sql = await readFile(path.join(MIGRATIONS_DIR, pair.up), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into app.schema_migrations (migration_name, checksum_sha256, direction) values ($1, $2, 'up')",
          [pair.name, checksum(sql)],
        );
        await client.query("commit");
        count += 1;
        log("info", "migration.applied", { migration: pair.name });
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
    log("info", "migration.complete", { applied_now: count, total: pairs.length });
  } finally {
    await client.end();
  }
}

export async function migrateDown(steps) {
  const pairs = await listMigrationPairs();
  const client = await connect();
  try {
    const applied = await appliedMigrations(client);
    const toUndo = [...applied.keys()].reverse().slice(0, steps);
    if (toUndo.length === 0) {
      log("info", "rollback.nothing_to_do", {});
      return;
    }
    for (const name of toUndo) {
      const pair = pairs.find((candidate) => candidate.name === name);
      if (pair === undefined) {
        throw new Error(`Rollback source missing for applied migration ${name}.`);
      }
      const sql = await readFile(path.join(MIGRATIONS_DIR, pair.down), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into app.schema_migrations (migration_name, checksum_sha256, direction) values ($1, $2, 'down')",
          [name, checksum(sql)],
        );
        await client.query("commit");
        log("info", "migration.rolled_back", { migration: name });
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

export async function runAssertions() {
  const client = await connect();
  const notices = [];
  client.on("notice", (notice) => {
    notices.push(notice.message);
  });
  try {
    const sql = await readFile(ASSERTIONS_FILE, "utf8");
    await client.query(sql);
    for (const line of notices.filter((line) => line.startsWith("assert."))) {
      log("info", line, {});
    }
    log("info", "assert.complete", { notices: notices.length });
  } finally {
    await client.end();
  }
}

export async function migrationStatus() {
  const client = await connect();
  try {
    const applied = await appliedMigrations(client);
    const pairs = await listMigrationPairs();
    const report = pairs.map((pair) => ({
      migration: pair.name,
      applied: applied.has(pair.name),
      applied_at: applied.get(pair.name) ?? null,
    }));
    log("info", "migration.status", { migrations: report });
  } finally {
    await client.end();
  }
}
