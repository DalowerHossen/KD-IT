// path: scripts/acceptance/step-03c/all.mjs
// Step 03 substep C acceptance orchestrator: runs the offline suite. The
// behavioral SQL probes (if added later) would run under npm run db:assert.

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
if (offlineCode !== 0) {
  process.stdout.write(`step-03c acceptance: FAILED (offline=${offlineCode})\n`);
  process.exit(1);
}
process.stdout.write("step-03c acceptance: all suites passed\n");
