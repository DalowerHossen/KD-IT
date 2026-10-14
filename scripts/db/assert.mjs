// path: scripts/db/assert.mjs
// Runs the Step 02 SQL assertion suite (RLS, grants, constraints, UUID v7,
// tenant isolation, approval chain, queue primitives) against the database
// referenced by KD_DATABASE_URL. Exits non-zero on the first violation.

import { runAssertions } from "./lib/runner.mjs";

runAssertions().catch((error) => {
  process.stdout.write(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      service: "kd-solution-it",
      tool: "db-assert",
      message: "assertion.failed",
      context: { error: error instanceof Error ? error.message : String(error) },
    }) + "\n",
  );
  process.exit(1);
});
