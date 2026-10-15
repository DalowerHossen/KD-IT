// path: scripts/db/rollback.mjs
// Rolls back the newest applied migrations. Usage: npm run db:rollback --
// --steps=1 (default 1). Down migrations execute newest-first.

import { migrateDown } from "./lib/runner.mjs";

const stepsArg = process.argv.find((arg) => arg.startsWith("--steps="));
const steps = stepsArg === undefined ? 1 : Number.parseInt(stepsArg.slice("--steps=".length), 10);

if (!Number.isInteger(steps) || steps < 1) {
  process.stdout.write(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      service: "kd-solution-it",
      tool: "db-rollback",
      message: "rollback.invalid_steps",
      context: { steps: stepsArg ?? "(default 1)" },
    }) + "\n",
  );
  process.exit(1);
}

migrateDown(steps).catch((error) => {
  process.stdout.write(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      service: "kd-solution-it",
      tool: "db-rollback",
      message: "rollback.failed",
      context: { error: error instanceof Error ? error.message : String(error) },
    }) + "\n",
  );
  process.exit(1);
});
