// path: scripts/acceptance/step-03p/all.mjs
// Step 03 substep P acceptance orchestrator: runs the offline suite and, when
// Supabase and database credentials are configured, the live suite. Exits
// non-zero if any suite reports a failure.

import { spawn } from "node:child_process";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);

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
const liveCode = await run("live.mjs");

if (offlineCode !== 0 || liveCode !== 0) {
  process.stdout.write(`step-03p acceptance: FAILED (offline=${offlineCode}, live=${liveCode})\n`);
  process.exit(1);
}
process.stdout.write("step-03p acceptance: all suites passed\n");
