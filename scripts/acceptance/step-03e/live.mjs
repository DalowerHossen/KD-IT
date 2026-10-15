// path: scripts/acceptance/step-03e/live.mjs
// Step 03 substep E live acceptance: verifies the database is reachable, the
// race-safe lock writers exist, and -- with a dedicated throwaway subject that
// is deleted afterwards -- the exact lock contract holds end to end:
//   - a single failure does not lock;
//   - a success resets the sequence without locking;
//   - the second consecutive failure opens an exact two-hour window (counter
//     consumed, lock_count incremented);
//   - a success during an active lock does not clear it.
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

  // 1. Database connectivity.
  const ping = await db.query("select 1 as ok");
  check("live.db_reachable", ping.rows[0]?.ok === 1);

  // 2. The race-safe writers exist in the app schema.
  const fns = await db.query(
    `select proname from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app'
       and proname in ('auth_locks_record_failure', 'auth_locks_record_success')`,
  );
  check("live.lock_writers_exist", fns.rows.length === 2, fns.rows.map((r) => r.proname).join(","));

  // 3. End-to-end lock round-trip on a throwaway subject (deleted afterwards).
  const subjectHash = createHash("sha256").update("step03e-live-acceptance").digest("hex");
  const fail = (subject) =>
    db.query(`select app.auth_locks_record_failure($1, null::uuid, 2, '2 hours'::interval) as s`, [
      subject,
    ]);
  const succeed = (subject) => db.query(`select app.auth_locks_record_success($1)`, [subject]);
  const state = (subject) =>
    db.query(
      `select lock_count, consecutive_failures,
              (locked_until is not null) as has_lock,
              (locked_until > clock_timestamp()) as window_open,
              (locked_until between clock_timestamp() + interval '1 hour 59 minutes'
                                    and clock_timestamp() + interval '2 hours 1 minute') as duration_ok
       from app.auth_locks where subject_hash = $1`,
      [subject],
    );

  try {
    await db.query(`delete from app.auth_locks where subject_hash = $1`, [subjectHash]);

    // (a) one failure -> not locked, counter 1.
    const r1 = await fail(subjectHash);
    check("live.first_failure_not_locked", r1.rows[0]?.s?.just_locked === false);
    const s1 = await state(subjectHash);
    check("live.first_failure_counter_one", s1.rows[0]?.consecutive_failures === 1);

    // (b) success -> counter reset, still not locked.
    await succeed(subjectHash);
    const s2 = await state(subjectHash);
    check(
      "live.success_resets_sequence",
      s2.rows[0]?.consecutive_failures === 0 && s2.rows[0]?.has_lock === false,
    );

    // (c) second consecutive failure -> exact two-hour window, counter consumed.
    await fail(subjectHash);
    const r2 = await fail(subjectHash);
    check("live.second_failure_locks", r2.rows[0]?.s?.just_locked === true);
    const s3 = await state(subjectHash);
    check(
      "live.lock_exact_two_hours",
      s3.rows[0]?.lock_count === 1 &&
        s3.rows[0]?.consecutive_failures === 0 &&
        s3.rows[0]?.window_open === true &&
        s3.rows[0]?.duration_ok === true,
    );

    // (d) success during the active lock -> counter stays 0, lock not cleared.
    await succeed(subjectHash);
    const s4 = await state(subjectHash);
    check(
      "live.success_does_not_clear_lock",
      s4.rows[0]?.consecutive_failures === 0 &&
        s4.rows[0]?.has_lock === true &&
        s4.rows[0]?.window_open === true,
    );
  } finally {
    await db.query(`delete from app.auth_locks where subject_hash = $1`, [subjectHash]);
  }
} catch (error) {
  check("live.lock_roundtrip", false, String(error));
} finally {
  await db.end?.();
}

if (failures > 0) {
  process.exit(1);
}
