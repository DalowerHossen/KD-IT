// path: scripts/acceptance/step-03a/live-db.mjs
// Step 03 substep A live-database acceptance: identity profiles with
// ownership checks, approval-gated permission grants with optimistic
// revocation, server-side permission evaluation with denial audits,
// discrete-command evidence, standing-grant checks, browser-role RLS
// isolation, and attempt/lock constraint behavior. Requires KD_DATABASE_URL
// against a migrated database; creates scoped probe rows and removes every
// probe row on completion, so it is idempotent and non-destructive.

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
const tenantContext = await import("../../../lib/db/tenant-context.ts");
const profiles = await import("../../../lib/db/repositories/profiles.ts");
const grants = await import("../../../lib/db/repositories/permission-grants.ts");
const commandRepo = await import("../../../lib/db/repositories/commands.ts");
const authorization = await import("../../../lib/auth/authorization.ts");

const COMPANY = "44444444-4444-7444-8444-444444444444";
const OTHER_COMPANY = "49999999-9999-7999-8999-999999999999";
const STAFF = "55555555-5555-7555-8555-555555555555";
const OWNER = "66666666-6666-7666-8666-666666666666";
const CEO = "77777777-7777-7777-8777-777777777777";
const CHIEF = "88888888-8888-7888-8888-888888888888";
const OTHER_OWNER = "59999999-9999-7999-8999-999999999999";
const CORRELATION = "61111111-1111-7111-8111-111111111111";

const client = await connect();

async function sql(text, params = []) {
  return client.query(text, params);
}

function makeContext(companyId, userId, role) {
  return tenantContext.makeTenantContext({
    companyId,
    userId,
    role,
    correlationId: CORRELATION,
  });
}

const ownerCtx = makeContext(COMPANY, OWNER, "owner");
const staffCtx = makeContext(COMPANY, STAFF, "staff");
const ceoCtx = makeContext(COMPANY, CEO, "ceo");
const chiefCtx = makeContext(COMPANY, CHIEF, "super_admin");
const otherOwnerCtx = makeContext(OTHER_COMPANY, OTHER_OWNER, "owner");

try {
  await sql(
    `insert into app.companies (id, company_id, legal_name, display_name, is_platform)
     values ($1, app.platform_company_id(), 'Identity Probe Tenant', 'Identity Probe', false)
     on conflict (id) do nothing`,
    [COMPANY],
  );
  await sql(
    `insert into app.companies (id, company_id, legal_name, display_name, is_platform)
     values ($1, app.platform_company_id(), 'Identity Probe Other', 'Identity Other', false)
     on conflict (id) do nothing`,
    [OTHER_COMPANY],
  );
  for (const [companyId, userId, role] of [
    [COMPANY, OWNER, "owner"],
    [COMPANY, STAFF, "staff"],
    [OTHER_COMPANY, OTHER_OWNER, "owner"],
  ]) {
    await sql(
      `insert into app.memberships (company_id, user_id, role, status, activated_at)
       values ($1, $2, $3, 'active', clock_timestamp())
       on conflict do nothing`,
      [companyId, userId, role],
    );
  }

  // -----------------------------------------------------------------------
  // Profiles: creation, self read, owner member read, cross-tenant denial.
  // -----------------------------------------------------------------------
  const ownerProfile = await profiles.createProfile(ownerCtx, {
    userId: OWNER,
    displayName: "Probe Owner",
  });
  check("live.profile_create", ownerProfile.display_name === "Probe Owner");

  const ownProfile = await profiles.getOwnProfile(ownerCtx);
  check("live.profile_self_read", ownProfile !== null && ownProfile.id === ownerProfile.id);

  await profiles.createProfile(staffCtx, { userId: STAFF, displayName: "Probe Staff" });
  const memberProfile = await profiles.getProfileByUserId(ownerCtx, STAFF);
  check("live.profile_owner_reads_member", memberProfile.display_name === "Probe Staff");

  let crossDenied = false;
  let crossGeneric = false;
  try {
    await profiles.getProfileByUserId(otherOwnerCtx, STAFF);
  } catch (error) {
    crossDenied = error instanceof Error && error.name === "ForbiddenError";
    crossGeneric =
      error instanceof Error && error.message === "This record does not belong to your workspace.";
  }
  check("live.profile_cross_tenant_denied", crossDenied && crossGeneric);

  let staffDenied = false;
  try {
    await profiles.getProfileByUserId(staffCtx, OWNER);
  } catch (error) {
    staffDenied = error instanceof Error && error.name === "ForbiddenError";
  }
  check("live.profile_staff_cannot_read_other", staffDenied);

  let staleConflict = false;
  try {
    await profiles.updateProfile(ownerCtx, {
      subjectUserId: OWNER,
      displayName: "Stale Writer",
      expectedVersion: ownerProfile.version + 5,
    });
  } catch (error) {
    staleConflict = error instanceof Error && error.name === "ConflictError";
  }
  check("live.profile_version_conflict", staleConflict);

  // -----------------------------------------------------------------------
  // Approval-gated grants: full L1/L2/L3 chain, then grant and evaluate.
  // -----------------------------------------------------------------------
  const grantCommandId = await commandRepo.proposeCommand(ownerCtx, {
    companyId: COMPANY,
    kind: "auth.permission.grant",
    payload: { subject: STAFF, permission: "team.invite" },
  });
  await commandRepo.approveCommandL2(ceoCtx, grantCommandId, "Rotation coverage approved.");
  await commandRepo.approveCommandL3(chiefCtx, grantCommandId, "Final approval recorded.");
  const approved = await commandRepo.getCommandById(ownerCtx, grantCommandId);
  check("live.grant_command_approved", approved.status === "approved");

  const grant = await grants.grantPermission(ownerCtx, {
    companyId: COMPANY,
    subjectUserId: STAFF,
    permission: "team.invite",
    commandId: grantCommandId,
    reason: "Cover support rotation.",
  });
  check("live.grant_created", grant.permission === "team.invite");

  const evaluated = await grants.evaluateSubjectPermissions(staffCtx, STAFF, "staff");
  check(
    "live.grant_evaluated",
    evaluated.includes("team.invite") && evaluated.includes("notify.read"),
  );

  await authorization.requirePermission(staffCtx, "team.invite");
  check("live.require_permission_allow", true);

  let denied = false;
  try {
    await authorization.requirePermission(staffCtx, "team.ownership.transfer");
  } catch (error) {
    denied =
      error instanceof Error &&
      error.name === "AuthorizationError" &&
      error.message === "You do not have permission to perform this action.";
  }
  const denialAudit = await sql(
    `select count(*) as total from app.audit_events
     where company_id = $1 and action = 'authz.permission_denied'`,
    [COMPANY],
  );
  check("live.require_permission_deny_audited", denied && Number(denialAudit.rows[0].total) >= 1);

  const pendingCommandId = await commandRepo.proposeCommand(ownerCtx, {
    companyId: COMPANY,
    kind: "auth.permission.grant",
    payload: { subject: STAFF, permission: "team.suspend" },
  });
  let pendingDenied = false;
  try {
    await grants.grantPermission(ownerCtx, {
      companyId: COMPANY,
      subjectUserId: STAFF,
      permission: "team.suspend",
      commandId: pendingCommandId,
    });
  } catch (error) {
    pendingDenied =
      error instanceof Error &&
      error.name === "ApprovalRequiredError" &&
      error.message === "This action requires approval before it can run.";
  }
  check("live.grant_requires_approved_command", pendingDenied);

  let missingDenied = false;
  try {
    await grants.grantPermission(ownerCtx, {
      companyId: COMPANY,
      subjectUserId: STAFF,
      permission: "team.suspend",
      commandId: "01930000-0000-7000-8000-000000000099",
    });
  } catch (error) {
    missingDenied = error instanceof Error && error.name === "ApprovalRequiredError";
  }
  check("live.grant_missing_command_non_enumerating", missingDenied);

  // -----------------------------------------------------------------------
  // Revocation with optimistic locking.
  // -----------------------------------------------------------------------
  const revokeCommandId = await commandRepo.proposeCommand(ownerCtx, {
    companyId: COMPANY,
    kind: "auth.permission.revoke",
    payload: { grant: grant.id },
  });
  await commandRepo.approveCommandL2(ceoCtx, revokeCommandId, "Rotation ended.");
  await commandRepo.approveCommandL3(chiefCtx, revokeCommandId, "Final approval recorded.");

  let revokeConflict = false;
  try {
    await grants.revokePermission(ownerCtx, {
      grantId: grant.id,
      expectedVersion: grant.version + 4,
      commandId: revokeCommandId,
    });
  } catch (error) {
    revokeConflict = error instanceof Error && error.name === "ConflictError";
  }
  check("live.revoke_version_conflict", revokeConflict);

  const revoked = await grants.revokePermission(ownerCtx, {
    grantId: grant.id,
    expectedVersion: grant.version,
    commandId: revokeCommandId,
  });
  check("live.revoke_ok", revoked.revoked_at !== null);

  const afterRevoke = await grants.evaluateSubjectPermissions(staffCtx, STAFF, "staff");
  check("live.revoke_effective", !afterRevoke.includes("team.invite"));

  // -----------------------------------------------------------------------
  // Discrete-command evidence and standing grants.
  // -----------------------------------------------------------------------
  await commandRepo.executeCommand(ownerCtx, grantCommandId, { granted: true });
  const evidence = await authorization.requireApprovedCommand(
    ownerCtx,
    grantCommandId,
    "auth.permission.grant",
  );
  check("live.approved_command_evidence", evidence.status === "executed");

  let kindDenied = false;
  try {
    await authorization.requireApprovedCommand(ownerCtx, grantCommandId, "team.ownership.transfer");
  } catch (error) {
    kindDenied = error instanceof Error && error.name === "ApprovalRequiredError";
  }
  check("live.approved_command_kind_mismatch", kindDenied);

  const now = new Date();
  const past = new Date(now.getTime() - 3_600_000).toISOString();
  const future = new Date(now.getTime() + 3_600_000).toISOString();
  await sql(
    `insert into app.standing_grants (company_id, subject_id, scope, granted_by, valid_until)
     values ($1, $2, 'team:*', $3, $4::timestamptz)`,
    [COMPANY, STAFF, OWNER, future],
  );
  await sql(
    `insert into app.standing_grants (company_id, subject_id, scope, granted_by, valid_until)
     values ($1, $2, 'reports.monthly', $3, $4::timestamptz)`,
    [COMPANY, STAFF, OWNER, future],
  );
  await sql(
    `insert into app.standing_grants (company_id, subject_id, scope, granted_by, valid_from, valid_until)
     values ($1, $2, 'reports.expired', $3, $4::timestamptz, $5::timestamptz)`,
    [COMPANY, STAFF, OWNER, past, past],
  );

  const wildcard = await grants.hasStandingGrant(staffCtx, STAFF, "team.roster");
  const exactMissing = await grants.hasExactStandingGrant(staffCtx, STAFF, "team.roster");
  const exactHit = await grants.hasExactStandingGrant(staffCtx, STAFF, "reports.monthly");
  const expired = await grants.hasStandingGrant(staffCtx, STAFF, "reports.expired");
  check(
    "live.standing_grants",
    wildcard === true && exactMissing === false && exactHit === true && expired === false,
  );

  await authorization.requireStandingGrant(staffCtx, "team.roster");
  let standingDenied = false;
  try {
    await authorization.requireExactStandingGrant(staffCtx, "team.roster");
  } catch (error) {
    standingDenied = error instanceof Error && error.name === "AuthorizationError";
  }
  check("live.standing_grant_wildcard_excluded_when_exact", standingDenied);

  // -----------------------------------------------------------------------
  // Browser-role RLS: self reads pass, cross reads vanish, evidence hides.
  // -----------------------------------------------------------------------
  await sql("begin");
  await sql("set local role authenticated");
  await sql("select set_config('app.company_id', $1, true)", [COMPANY]);
  await sql("select set_config('app.user_id', $1, true)", [STAFF]);
  await sql("select set_config('app.user_role', 'staff', true)");
  const selfProfiles = await sql("select count(*) as total from app.profiles");
  check("live.rls_self_profile_only", Number(selfProfiles.rows[0].total) === 1);
  const selfGrants = await sql("select count(*) as total from app.permission_grants");
  check("live.rls_self_grants_only", Number(selfGrants.rows[0].total) === 0);
  let attemptsHidden = false;
  try {
    await sql("select count(*) from app.auth_attempts");
  } catch {
    attemptsHidden = true;
  }
  let locksHidden = false;
  try {
    await sql("select count(*) from app.auth_locks");
  } catch {
    locksHidden = true;
  }
  check("live.rls_evidence_hidden", attemptsHidden && locksHidden);
  await sql("rollback");

  // -----------------------------------------------------------------------
  // Attempt and lock records: constraints hold for the substep D engine.
  // -----------------------------------------------------------------------
  const subject = "a".repeat(64);
  await sql(
    `insert into app.auth_attempts (company_id, subject_hash, user_id, factor, outcome)
     values (app.platform_company_id(), $1, $2, 'password', 'failure')`,
    [subject, STAFF],
  );
  await sql(
    `insert into app.auth_locks (company_id, subject_hash, user_id, consecutive_failures)
     values (app.platform_company_id(), $1, $2, 1)`,
    [subject, STAFF],
  );
  const lockCount = await sql(
    "select consecutive_failures from app.auth_locks where subject_hash = $1",
    [subject],
  );
  check("live.attempt_lock_rows", lockCount.rows[0].consecutive_failures === 1);

  let duplicateLock = false;
  try {
    await sql(
      `insert into app.auth_locks (company_id, subject_hash, consecutive_failures)
       values (app.platform_company_id(), $1, 2)`,
      [subject],
    );
  } catch {
    duplicateLock = true;
  }
  check("live.lock_subject_unique", duplicateLock);
} finally {
  const users = [STAFF, OWNER, OTHER_OWNER];
  await sql(
    `delete from app.audit_events
     where company_id = app.platform_company_id()
       and resource_type = 'profiles'
       and resource_id in (select id from app.profiles where user_id = any($1))`,
    [users],
  );
  await sql("delete from app.permission_grants where company_id = any($1)", [
    [COMPANY, OTHER_COMPANY],
  ]);
  await sql("delete from app.standing_grants where company_id = any($1)", [
    [COMPANY, OTHER_COMPANY],
  ]);
  await sql("delete from app.auth_attempts where subject_hash = $1", ["a".repeat(64)]);
  await sql("delete from app.auth_locks where subject_hash = $1", ["a".repeat(64)]);
  await sql("delete from app.profiles where user_id = any($1)", [users]);
  await sql(
    "delete from app.command_approval_events where command_id in (select id from app.command_approvals where company_id = any($1))",
    [[COMPANY, OTHER_COMPANY]],
  );
  await sql("delete from app.command_approvals where company_id = any($1)", [
    [COMPANY, OTHER_COMPANY],
  ]);
  await sql("delete from app.audit_events where company_id = any($1)", [[COMPANY, OTHER_COMPANY]]);
  await sql("delete from app.memberships where company_id = any($1)", [[COMPANY, OTHER_COMPANY]]);
  await sql("delete from app.companies where id = any($1)", [[COMPANY, OTHER_COMPANY]]);
  await client.end();
}

if (failures > 0) {
  process.stdout.write(`step-03a live-db: FAILED (${failures} failing checks)\n`);
  process.exit(1);
}
process.stdout.write("step-03a live-db: all checks passed\n");
