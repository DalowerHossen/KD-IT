// path: scripts/db/migrate.mjs
// Applies pending Step 02 migrations in order. Uses schema_migrations as the
// ledger; each migration runs in its own transaction.

import { migrateUp } from "./lib/runner.mjs";

migrateUp().catch((error) => {
  process.stdout.write(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      service: "kd-solution-it",
      tool: "db-migrate",
      message: "migration.failed",
      context: { error: error instanceof Error ? error.message : String(error) },
    }) + "\n",
  );
  process.exit(1);
});
