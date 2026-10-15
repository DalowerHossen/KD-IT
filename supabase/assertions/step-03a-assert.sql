-- path: supabase/assertions/step-03a-assert.sql
-- Step 03 substep A SQL assertion suite. Executed by npm run db:assert
-- against a migrated database alongside the Step 02 suite. Every violation
-- raises an exception with a readable identifier; success prints notices.
-- Structural blocks run directly; behavioral probes run inside one explicit
-- transaction that is rolled back, so assertions never leave residue.

set client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- 1. Required column contract on the six identity tables, plus the new
--    membership provenance columns.
-- ---------------------------------------------------------------------------
do $$
declare
  missing record;
begin
  for missing in
    with expected(col, typ) as (
      values
        ('id', 'uuid'),
        ('company_id', 'uuid'),
        ('created_at', 'timestamp with time zone'),
        ('updated_at', 'timestamp with time zone'),
        ('deleted_at', 'timestamp with time zone'),
        ('version', 'integer')
    ),
    new_tables(tbl) as (
      values
        ('profiles'),
        ('permission_grants'),
        ('auth_devices'),
        ('auth_sessions'),
        ('auth_attempts'),
        ('auth_locks')
    )
    select t.tbl as tbl, e.col as col
    from new_tables t
    cross join expected e
    left join information_schema.columns c
      on c.table_schema = 'app'
      and c.table_name = t.tbl
      and c.column_name = e.col
      and c.data_type = e.typ
    where c.column_name is null
  loop
    raise exception 'assert03a.required_columns: missing % on app.%', missing.col, missing.tbl;
  end loop;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'app' and table_name = 'memberships'
      and column_name = 'granted_by_command_id' and data_type = 'uuid'
      and is_nullable = 'YES'
  ) then
    raise exception 'assert03a.membership_columns: memberships.granted_by_command_id must exist as nullable uuid';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'app' and table_name = 'memberships'
      and column_name = 'status_reason' and data_type = 'text'
      and is_nullable = 'YES'
  ) then
    raise exception 'assert03a.membership_columns: memberships.status_reason must exist as nullable text';
  end if;
  raise notice 'assert03a.required_columns OK';
end
$$;

-- ---------------------------------------------------------------------------
-- 2. RLS enabled and forced on every new table.
-- ---------------------------------------------------------------------------
do $$
declare
  tbl text;
begin
  for tbl in
    select unnest(array[
      'profiles', 'permission_grants', 'auth_devices',
      'auth_sessions', 'auth_attempts', 'auth_locks'
    ])
  loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'app' and c.relname = tbl
        and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception 'assert03a.rls: app.% must enable and force row level security', tbl;
    end if;
  end loop;
  raise notice 'assert03a.rls OK';
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Grants: privileged DML on all six tables, browser SELECT on the four
--    self-service tables only, and no browser privilege at all on attempt
--    and lock evidence.
-- ---------------------------------------------------------------------------
do $$
declare
  tbl text;
  priv text;
begin
  for tbl in
    select unnest(array[
      'profiles', 'permission_grants', 'auth_devices',
      'auth_sessions', 'auth_attempts', 'auth_locks'
    ])
  loop
    for priv in
      select unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
    loop
      if not exists (
        select 1 from information_schema.role_table_grants
        where table_schema = 'app' and table_name = tbl
          and grantee = 'service_role' and privilege_type = priv
      ) then
        raise exception 'assert03a.grants: service_role lacks % on app.%', priv, tbl;
      end if;
    end loop;
  end loop;

  for tbl in
    select unnest(array['profiles', 'permission_grants', 'auth_devices', 'auth_sessions'])
  loop
    if not exists (
      select 1 from information_schema.role_table_grants
      where table_schema = 'app' and table_name = tbl
        and grantee = 'authenticated' and privilege_type = 'SELECT'
    ) then
      raise exception 'assert03a.grants: authenticated lacks SELECT on app.%', tbl;
    end if;
    if exists (
      select 1 from information_schema.role_table_grants
      where table_schema = 'app' and table_name = tbl
        and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
    ) then
      raise exception 'assert03a.grants: authenticated must not write app.%', tbl;
    end if;
  end loop;

  for tbl in select unnest(array['auth_attempts', 'auth_locks']) loop
    if exists (
      select 1 from information_schema.role_table_grants
      where table_schema = 'app' and table_name = tbl
        and grantee = 'authenticated'
    ) then
      raise exception 'assert03a.grants: authenticated must hold no privilege on app.%', tbl;
    end if;
  end loop;
  raise notice 'assert03a.grants OK';
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Membership role check still carries exactly the five roles, and the
--    user-global tables enforce platform scope.
-- ---------------------------------------------------------------------------
do $$
declare
  role_def text;
  role_name text;
begin
  select pg_get_constraintdef(oid) into role_def
  from pg_constraint
  where conrelid = 'app.memberships'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%super_admin%';
  if role_def is null then
    raise exception 'assert03a.role_check: membership role check constraint not found';
  end if;
  for role_name in
    select unnest(array['super_admin', 'ceo', 'admin_staff', 'owner', 'staff'])
  loop
    if position(role_name in role_def) = 0 then
      raise exception 'assert03a.role_check: membership role check misses %', role_name;
    end if;
  end loop;

  for role_name in
    select unnest(array[
      'profiles_platform_scope',
      'auth_devices_platform_scope',
      'auth_sessions_platform_scope',
      'auth_attempts_platform_scope',
      'auth_locks_platform_scope'
    ])
  loop
    if not exists (
      select 1 from pg_constraint where conname = role_name and contype = 'c'
    ) then
      raise exception 'assert03a.platform_scope: constraint % is missing', role_name;
    end if;
  end loop;
  raise notice 'assert03a.role_and_scope_checks OK';
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Unique and lookup indexes, expected RLS policies, and audit triggers.
-- ---------------------------------------------------------------------------
do $$
declare
  idx text;
  pol record;
begin
  for idx in
    select unnest(array[
      'idx_profiles_user_id',
      'idx_permission_grants_active_key',
      'idx_auth_devices_user_key',
      'idx_auth_locks_subject'
    ])
  loop
    if not exists (
      select 1 from pg_indexes where schemaname = 'app' and indexname = idx
    ) then
      raise exception 'assert03a.indexes: index % is missing', idx;
    end if;
  end loop;

  for pol in
    select * from (values
      ('profiles', 2),
      ('permission_grants', 2),
      ('auth_devices', 2),
      ('auth_sessions', 2),
      ('auth_attempts', 0),
      ('auth_locks', 0)
    ) as expected(tbl, policy_count)
  loop
    if (select count(*) from pg_policies where schemaname = 'app' and tablename = pol.tbl)
      <> pol.policy_count then
      raise exception 'assert03a.policies: app.% must carry exactly % policies',
        pol.tbl, pol.policy_count;
    end if;
  end loop;

  for idx in
    select unnest(array['profiles_audit', 'permission_grants_audit', 'auth_devices_audit', 'auth_sessions_audit'])
  loop
    if not exists (
      select 1 from pg_trigger where tgname = idx and tgisinternal = false
    ) then
      raise exception 'assert03a.audit_triggers: trigger % is missing', idx;
    end if;
  end loop;
  raise notice 'assert03a.indexes_policies_triggers OK';
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Behavioral probes inside a rolled-back transaction.
-- ---------------------------------------------------------------------------
begin;

-- 6a. Platform-scope, permission-shape, lock-uniqueness, and outcome guards.
do $$
declare
  probe_company uuid := app.uuid_v7();
  probe_user uuid := app.uuid_v7();
  subject text := repeat('e', 64);
  rejected boolean;
begin
  insert into app.companies (id, company_id, legal_name, display_name, is_platform)
  values (probe_company, app.platform_company_id(), 'Identity Probe Tenant', 'Identity Probe', false);

  rejected := false;
  begin
    insert into app.profiles (company_id, user_id, display_name)
    values (probe_company, probe_user, 'Probe User');
  exception
    when check_violation then
      rejected := true;
  end;
  if not rejected then
    raise exception 'assert03a.scope_guard: tenant-scoped profile insert must fail';
  end if;

  rejected := false;
  begin
    insert into app.permission_grants (company_id, subject_user_id, permission, granted_by)
    values (probe_company, probe_user, 'Bogus Code', probe_user);
  exception
    when check_violation then
      rejected := true;
  end;
  if not rejected then
    raise exception 'assert03a.permission_shape: malformed permission code must fail';
  end if;

  insert into app.auth_locks (company_id, subject_hash, consecutive_failures)
  values (app.platform_company_id(), subject, 1);
  rejected := false;
  begin
    insert into app.auth_locks (company_id, subject_hash, consecutive_failures)
    values (app.platform_company_id(), subject, 2);
  exception
    when unique_violation then
      rejected := true;
  end;
  if not rejected then
    raise exception 'assert03a.lock_unique: duplicate lock subject must fail';
  end if;

  rejected := false;
  begin
    insert into app.auth_attempts (company_id, subject_hash, factor, outcome, failure_reason_code)
    values (app.platform_company_id(), subject, 'password', 'success', 'auth.failed');
  exception
    when check_violation then
      rejected := true;
  end;
  if not rejected then
    raise exception 'assert03a.attempt_outcome: success with a failure reason must fail';
  end if;

  raise notice 'assert03a.constraint_guards OK';
end
$$;

-- 6b. Optimistic version guard on identity tables.
do $$
declare
  probe_user uuid := app.uuid_v7();
  rejected boolean;
begin
  insert into app.profiles (company_id, user_id, display_name)
  values (app.platform_company_id(), probe_user, 'Version Probe');

  rejected := false;
  begin
    update app.profiles set display_name = 'Stale Writer', version = version + 5
    where user_id = probe_user;
  exception
    when serialization_failure then
      rejected := true;
  end;
  if not rejected then
    raise exception 'assert03a.version_guard: stale version jump must raise 40001';
  end if;
  raise notice 'assert03a.version_guard OK';
end
$$;

-- 6c. RLS self-read isolation under the authenticated role, and complete
--     invisibility of attempt and lock evidence.
do $$
declare
  user_a uuid := app.uuid_v7();
  user_b uuid := app.uuid_v7();
  seen integer;
  denied boolean;
begin
  insert into app.profiles (company_id, user_id, display_name)
  values (app.platform_company_id(), user_a, 'User A');
  insert into app.profiles (company_id, user_id, display_name)
  values (app.platform_company_id(), user_b, 'User B');
  insert into app.auth_attempts (company_id, subject_hash, factor, outcome)
  values (app.platform_company_id(), repeat('f', 64), 'password', 'failure');

  execute 'set local role authenticated';
  perform set_config('app.company_id', app.platform_company_id()::text, true);
  perform set_config('app.user_id', user_a::text, true);
  perform set_config('app.user_role', 'staff', true);

  select count(*) into seen from app.profiles;
  if seen <> 1 then
    raise exception 'assert03a.rls_self_read: expected exactly 1 own profile, saw %', seen;
  end if;

  denied := false;
  begin
    perform count(*) from app.auth_attempts;
  exception
    when insufficient_privilege then
      denied := true;
  end;
  if not denied then
    raise exception 'assert03a.rls_attempt_hidden: authenticated must not read auth_attempts';
  end if;

  denied := false;
  begin
    perform count(*) from app.auth_locks;
  exception
    when insufficient_privilege then
      denied := true;
  end;
  if not denied then
    raise exception 'assert03a.rls_lock_hidden: authenticated must not read auth_locks';
  end if;

  execute 'reset role';
  raise notice 'assert03a.rls_isolation OK';
end
$$;

-- 6d. Audit trigger coverage on identity mutations.
do $$
declare
  probe_user uuid := app.uuid_v7();
  profile_id uuid;
  events integer;
begin
  insert into app.profiles (company_id, user_id, display_name)
  values (app.platform_company_id(), probe_user, 'Audit Probe')
  returning id into profile_id;

  select count(*) into events
  from app.audit_events
  where company_id = app.platform_company_id()
    and resource_type = 'profiles'
    and resource_id = profile_id
    and action = 'profiles.created';
  if events < 1 then
    raise exception 'assert03a.audit_trigger: profile insert produced no audit event';
  end if;
  raise notice 'assert03a.audit_trigger OK';
end
$$;

rollback;
