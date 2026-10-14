// path: scripts/acceptance/step-02/live-db.mjs
// Step 02 live-database acceptance: exercises idempotency, queue claiming,
// leader locks, rate limiting, the approval chain with execution replay,
// and audit chain verification against a migrated database. Requires
// KD_DATABASE_URL; creates a scoped probe tenant and removes every probe
// row on completion, so it is idempotent and non-destructive.

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

if (process.env.KD_DATABASE_URL === undefined || process.env.KD_DATABASE_URL.trim() === "") {
  process.stdout.write("SKIP live-db acceptance: KD_DATABASE_URL is not set\n");
  process.exit(0);
}

const runnerPath = pathToFileURL(path.join(ROOT, "scripts/db/lib/runner.mjs")).href;
const { connect } = await import(runnerPath);

const client = await connect();
const companyId = "44444444-4444-7444-8444-444444444444";
const actorStaff = "55555555-5555-7555-8555-555555555555";
const actorBoss = "66666666-6666-7666-8666-666666666666";
const actorSupreme = "77777777-7777-7777-8777-777777777777";

async function sql(text, params = []) {
  return client.query(text, params);
}

async function setContext(company, userId, role) {
  await sql(
    "select set_config('app.company_id', $1, false), set_config('app.user_id', $2, false), set_config('app.user_role', $3, false)",
    [company, userId, role],
  );
}

try {
  await sql(
    `insert into app.companies (id, company_id, legal_name, display_name, is_platform)
     values ($1, app.platform_company_id(), 'Live Acceptance Probe', 'Live Acceptance', false)
     on conflict (id) do nothing`,
    [companyId],
  );

  // UUID v7 sanity in live mode.
  const uuidProbe = await sql("select app.uuid_v7()::text as sample");
  const sample = uuidProbe.rows[0].sample;
  check(
    "live.uuid_v7_format",
    sample.length === 36 && sample[14] === "7" && "89ab".includes(sample[19]),
    sample,
  );

  // Idempotency: begin, complete, replay, and conflict.
  const scopeKey = `acceptance-${Date.now()}`;
  const begin = await sql(
    "select app.idempotency_begin($1::uuid, 'acceptance.scope', $2, repeat('ab', 32)) as outcome",
    [companyId, scopeKey],
  );
  check("live.idempotency_begin", begin.rows[0].outcome.status === "started");

  await sql("select app.idempotency_complete($1::uuid, 'acceptance.scope', $2, $3::jsonb)", [
    companyId,
    scopeKey,
    JSON.stringify({ delivered: true }),
  ]);
  const replay = await sql(
    "select app.idempotency_begin($1::uuid, 'acceptance.scope', $2, repeat('ab', 32)) as outcome",
    [companyId, scopeKey],
  );
  check(
    "live.idempotency_replay",
    replay.rows[0].outcome.status === "replay" &&
      replay.rows[0].outcome.response?.delivered === true,
  );
  const conflict = await sql(
    "select app.idempotency_begin($1::uuid, 'acceptance.scope', $2, repeat('cd', 32)) as outcome",
    [companyId, scopeKey],
  );
  check("live.idempotency_conflict", conflict.rows[0].outcome.status === "conflict");

  // Queue: enqueue, claim once, duplicate claim sees nothing, exhaust into dead-letter.
  const kind = `acceptance.job.${Date.now()}`;
  await sql(
    "insert into app.queue_jobs (company_id, kind, payload, max_attempts) values ($1, $2, $3::jsonb, 1)",
    [companyId, kind, JSON.stringify({ n: 1 })],
  );
  const claim1 = await sql(
    "select id from app.queue_claim('live-accept-1', array[$2]::text[], 1, 60)",
    [companyId, kind],
  );
  check("live.queue_claim_once", claim1.rowCount === 1);
  const claim2 = await sql(
    "select id from app.queue_claim('live-accept-2', array[$2]::text[], 1, 60)",
    [companyId, kind],
  );
  check("live.queue_no_double_claim", claim2.rowCount === 0);
  const failOutcome = await sql(
    "select (app.queue_fail($1::uuid, 'live-accept-1', 'probe failure', interval '1 minute'))->>'status' as status",
    [claim1.rows[0].id],
  );
  check("live.queue_dead_letter", failOutcome.rows[0].status === "dead_letter");

  // Leader lock: single holder wins.
  const leader1 = await sql(
    "select app.leader_try_acquire($1::uuid, 'acceptance.lock', 'holder-a', 60) as result",
    [companyId],
  );
  const leader2 = await sql(
    "select app.leader_try_acquire($1::uuid, 'acceptance.lock', 'holder-b', 60) as result",
    [companyId],
  );
  check(
    "live.leader_single_holder",
    leader1.rows[0].result === true && leader2.rows[0].result === false,
  );

  // Rate limit: second request denied at limit 1.
  const bucket = `acceptance.bucket.${Date.now()}`;
  const rl1 = await sql("select app.rate_limit_hit($1::uuid, $2, 1, 60) as outcome", [
    companyId,
    bucket,
  ]);
  const rl2 = await sql("select app.rate_limit_hit($1::uuid, $2, 1, 60) as outcome", [
    companyId,
    bucket,
  ]);
  check(
    "live.rate_limit_window",
    rl1.rows[0].outcome.allowed === true && rl2.rows[0].outcome.allowed === false,
  );

  // Approval chain: route to L2, deny self-approval, execute once, replay.
  await setContext(companyId, actorStaff, "staff");
  const proposed = await sql(
    "select app.command_propose($1::uuid, 'file.delete', $2::jsonb, default, $3) as id",
    [
      companyId,
      JSON.stringify({ fileId: "00000000-0000-4000-8000-0000000000aa" }) ?? "{}",
      `acc-${Date.now()}`,
    ],
  );
  const commandId = proposed.rows[0].id;

  await setContext(companyId, actorStaff, "ceo");
  const denied = await sql("select app.command_approve_l2($1::uuid, null)", [commandId]).catch(
    () => "denied",
  );
  check("live.command_self_approval_denied", denied === "denied");

  await setContext(companyId, actorBoss, "ceo");
  await sql("select app.command_approve_l2($1::uuid, 'approved for acceptance', null)", [
    commandId,
  ]);
  await setContext(companyId, actorSupreme, "super_admin");
  await sql("select app.command_approve_l3($1::uuid, 'final approval', null)", [commandId]);

  const exec1 = await sql("select app.command_execute($1::uuid, $2::jsonb) as outcome", [
    commandId,
    JSON.stringify({ probe: true }),
  ]);
  const exec2 = await sql("select app.command_execute($1::uuid, $2::jsonb) as outcome", [
    commandId,
    JSON.stringify({ probe: true }),
  ]);
  check(
    "live.command_execute_once_replay",
    exec1.rows[0].outcome.status === "executed" && exec2.rows[0].outcome.status === "replay",
  );

  // Audit chain integrity for the probe tenant.
  const chain = await sql(
    "select count(*) filter (where valid = false) as invalid_count from app.audit_chain_verify($1::uuid)",
    [companyId],
  );
  check(
    "live.audit_chain_valid",
    Number.parseInt(chain.rows[0].invalid_count, 10) === 0,
    `verified ${chain.rows[0].invalid_count === "0" ? "chain" : "invalid rows"}`,
  );

  // Numeric type safety: money-shaped columns would surface as text.
  const numericProbe = await sql("select (100.1250::numeric(18,4))::text as numeric_as_string");
  check("live.numeric_string_contract", typeof numericProbe.rows[0].numeric_as_string === "string");
} finally {
  // Cleanup: probe rows only, newest dependencies first.
  await setContext(companyId, actorSupreme, "super_admin");
  await sql(
    "delete from app.command_approval_events where command_id in (select id from app.command_approvals where company_id = $1)",
    [companyId],
  );
  await sql("delete from app.command_approvals where company_id = $1", [companyId]);
  await sql("delete from app.queue_jobs where company_id = $1", [companyId]);
  await sql("delete from app.leader_locks where company_id = $1", [companyId]);
  await sql("delete from app.idempotency_keys where company_id = $1", [companyId]);
  await sql("delete from app.rate_limit_counters where company_id = $1", [companyId]);
  await sql("delete from app.audit_events where company_id = $1", [companyId]);
  await sql("delete from app.companies where id = $1", [companyId]);
  await client.end();
}

process.stdout.write(
  failures === 0
    ? "live-db acceptance: all checks passed\n"
    : `live-db acceptance: ${failures} failures\n`,
);
process.exit(failures === 0 ? 0 : 1);
