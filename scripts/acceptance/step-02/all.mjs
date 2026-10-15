// path: scripts/acceptance/step-02/all.mjs
// Step 02 acceptance orchestrator: runs the offline suite and, when
// KD_DATABASE_URL is configured, the live-database suite. Exits non-zero
// if any suite reports a failure.

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

async function run(script) {
  const child = spawn(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      path.join(process.cwd(), "scripts/acceptance/lib/register.mjs"),
      path.join(HERE, script),
    ],
    { stdio: "inherit", env: { ...process.env } },
  );
  return new Promise((resolvePromise) => {
    child.on("exit", (code) => resolvePromise(code ?? 1));
  });
}

const offlineCode = await run("offline.mjs");
const liveCode = await run("live-db.mjs");

if (offlineCode !== 0 || liveCode !== 0) {
  process.stdout.write(
    `step-02 acceptance: FAILED (offline=${offlineCode}, live-db=${liveCode})\n`,
  );
  process.exit(1);
}
process.stdout.write("step-02 acceptance: all suites passed\n");
