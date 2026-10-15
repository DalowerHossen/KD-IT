// path: scripts/acceptance/step-03f/live.mjs
// Step 03 substep F live acceptance: verifies the database is reachable, the
// optimistic-locked clear writer exists, and -- with a throwaway subject and a
// dummy approved command (both deleted afterwards) -- the unlock contract holds:
//   - an active lock is cleared, recording actor + command + reason and
//     restarting the failure sequence;
//   - replaying the clear is a safe no-op (the window is already gone);
//   - a stale expected version is refused, leaving the lock intact.
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and KD_DATABASE_URL;
// skips cleanly when absent.

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(".");

let failures = 0;
function check(id, outcome, detail) {
  process.stdout.write(
    `${outcome ? "PASS" : "FAIL"} ${id}${detail === undefined ? "" : `: ${detail}`}\n`,
  );
  if (!outcome) {
    failures += 1;
  }
}

const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "KD_DATABASE_URL"].filter(
  (key) => process.env[key] === undefined || process.env[key].trim() === "",
);
if (missing.length > 0) {
  process.stdout.write(`SKIP live acceptance: ${missing.join(", ")} is not set\n`);
  process.exit(0);
}

const runnerPath = pathToFileURL(path.join(ROOT, "scripts/db/lib/runner.mjs")).href;
const { connect } = await import(runnerPath);

let db;
try {
  db = await connect();

  const ping = await db.query("select 1 as ok");
  check("live.db_reachable", ping.rows[0]?.ok === 1);

  const fn = await db.query(
    `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and proname = 'auth_locks_clear'`,
  );
  check("live.clear_function_exists", fn.rows.length === 1);

  const subjectHash = createHash("sha256").update("step03f-live-acceptance").digest("hex");
  const actorUuid = "22222222-2222-2222-2222-222222222222";
  let dummyCommandId = null;

  const lockState = () =>
    db.query(
      `select version, (locked_until > clock_timestamp()) as window_open,
              consecutive_failures, unlocked_by, unlock_command_id
       from app.auth_locks where subject_hash = $1`,
      [subjectHash],
    );
  const fail = () =>
    db.query(`select app.auth_locks_record_failure($1, null::uuid, 2, '2 hours'::interval) as s`, [
      subjectHash,
    ]);

  try {
    await db.query(`delete from app.auth_locks where subject_hash = $1`, [subjectHash]);

    // Build an active lock (two consecutive failures).
    await fail();
    await fail();
    let st = await lockState();
    const v1 = st.rows[0]?.version;
    check("live.setup_active_lock", st.rows[0]?.window_open === true && v1 !== undefined);

    // A dummy approved command to satisfy the unlock_command_id FK.
    const ins = await db.query(
      `insert into app.command_approvals
         (company_id, kind, payload, payload_hash, status, initiator_id, expires_at)
       values (app.platform_company_id(), 'auth.account.unlock', '{}'::jsonb,
               app.sha256_hex('{}'), 'approved', $1, clock_timestamp() + interval '1 hour')
       returning id`,
      [actorUuid],
    );
    dummyCommandId = ins.rows[0]?.id;

    // Clear with the correct expected version.
    const cleared = await db.query(
      `select app.auth_locks_clear($1, $2::uuid, $3::uuid, 'live acceptance unlock', $4::int) as s`,
      [subjectHash, actorUuid, dummyCommandId, v1],
    );
    st = await lockState();
    check(
      "live.clears_active_lock",
      cleared.rows[0]?.s?.cleared === true &&
        st.rows[0]?.window_open === false &&
        st.rows[0]?.consecutive_failures === 0 &&
        st.rows[0]?.unlocked_by === actorUuid &&
        st.rows[0]?.unlock_command_id === dummyCommandId,
    );

    // Replaying the clear is a safe no-op (the window is already gone).
    const replay = await db.query(
      `select app.auth_locks_clear($1, $2::uuid, $3::uuid, 'replay', $4::int) as s`,
      [subjectHash, actorUuid, dummyCommandId, st.rows[0]?.version],
    );
    check(
      "live.replay_is_noop",
      replay.rows[0]?.s?.cleared === false && replay.rows[0]?.s?.reason === "no_active_lock",
    );

    // Re-lock, then a stale expected version must be refused (lock intact).
    await fail();
    await fail();
    st = await lockState();
    const v2 = st.rows[0]?.version;
    let staleRefused = false;
    try {
      await db.query(`select app.auth_locks_clear($1, $2::uuid, $3::uuid, 'stale', $4::int) as s`, [
        subjectHash,
        actorUuid,
        dummyCommandId,
        v2 + 999,
      ]);
    } catch {
      staleRefused = true;
    }
    st = await lockState();
    check("live.stale_version_refused", staleRefused === true && st.rows[0]?.window_open === true);
  } finally {
    await db.query(`delete from app.auth_locks where subject_hash = $1`, [subjectHash]);
    if (dummyCommandId !== null) {
      await db.query(`delete from app.command_approvals where id = $1`, [dummyCommandId]);
    }
  }
} catch (error) {
  check("live.unlock_roundtrip", false, String(error));
} finally {
  await db.end?.();
}

if (failures > 0) {
  process.exit(1);
}
