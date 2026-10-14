-- path: supabase/assertions/step-02-assert.sql
-- Step 02 SQL assertion suite. Executed by npm run db:assert against a
-- migrated database. Every violation raises an exception with a readable
-- identifier; success prints notices. Structural blocks run directly;
-- behavioral probes run inside one explicit transaction that is rolled
-- back, so assertions never leave residue.

set client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- 1. Required column contract on every application table.
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
    app_tables as (
      select tablename from pg_tables
      where schemaname = 'app' and tablename <> 'schema_migrations'
    )
    select t.tablename as tbl, e.col as col
    from app_tables t
    cross join expected e
    left join information_schema.columns c
      on c.table_schema = 'app'
      and c.table_name = t.tablename
      and c.column_name = e.col
      and c.data_type = e.typ
    where c.column_name is null
  loop
    raise exception 'assert.required_columns: missing % on app.%', missing.col, missing.tbl;
  end loop;
  raise notice 'assert.required_columns OK';
end
$$;

do $$
declare
  bad record;
begin
  for bad in
    select c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema = 'app'
      and c.table_name <> 'schema_migrations'
      and c.column_name in ('id', 'company_id', 'created_at', 'updated_at', 'version')
      and c.is_nullable <> 'NO'
  loop
    raise exception 'assert.not_null: app.%.% must be NOT NULL', bad.table_name, bad.column_name;
  end loop;
  for bad in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'app'
      and c.table_name <> 'schema_migrations'
      and c.column_name = 'version'
      and c.column_default <> '1'
  loop
    raise exception 'assert.version_default: app.% version must default to 1', bad.table_name;
  end loop;
  raise notice 'assert.not_null_and_version_defaults OK';
end
$$;

do $$
declare
  bad record;
begin
  for bad in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'app'
      and c.table_name <> 'schema_migrations'
      and c.column_name = 'id'
      and coalesce(c.column_default, '') not like '%uuid_v7()%'
  loop
    raise exception 'assert.uuid_v7_default: app.% id must default to app.uuid_v7()', bad.table_name;
  end loop;
  raise notice 'assert.uuid_v7_defaults OK';
end
$$;

-- ---------------------------------------------------------------------------
-- 2. UUID v7 generator correctness (version, variant, embedded timestamp).
-- ---------------------------------------------------------------------------
do $$
declare
  sample uuid := app.uuid_v7();
  ms bigint;
  drift_ms bigint;
begin
  if substr(sample::text, 15, 1) <> '7' then
    raise exception 'assert.uuid_v7_version: expected version nibble 7, got %', sample;
  end if;
  if substr(sample::text, 20, 1) not in ('8', '9', 'a', 'b') then
    raise exception 'assert.uuid_v7_variant: expected RFC variant, got %', sample;
  end if;
  ms := ('x' || substr(sample::text, 1, 12))::bit(64)::bigint;
  drift_ms := abs(ms - floor(extract(epoch from clock_timestamp()) * 1000)::bigint);
  if drift_ms > 10000 then
    raise exception 'assert.uuid_v7_timestamp: embedded timestamp drifts % ms', drift_ms;
  end if;
  raise notice 'assert.uuid_v7_format OK (%)', sample;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. RLS enabled and forced on every application table.
-- ---------------------------------------------------------------------------
do $$
declare
  bad record;
begin
  for bad in
    select tablename from pg_tables
    where schemaname = 'app'
      and tablename <> 'schema_migrations'
      and rowsecurity = false
  loop
    raise exception 'assert.rls_enabled: app.% lacks row level security', bad.tablename;
  end loop;
  for bad in
    select c.relname as tablename
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app'
      and c.relkind = 'r'
      and c.relname <> 'schema_migrations'
      and c.relforcerowsecurity = false
  loop
    raise exception 'assert.rls_forced: app.% is not FORCE ROW LEVEL SECURITY', bad.tablename;
  end loop;
  raise notice 'assert.rls_enabled_and_forced OK';
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Privilege matrix: anon holds nothing; authenticated is read-only.
-- ---------------------------------------------------------------------------
do $$
declare
  bad record;
begin
  for bad in
    select grantee, table_name, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'app'
      and grantee in ('anon', 'public')
  loop
    raise exception 'assert.anon_zero_privileges: % has % on app.%', bad.grantee, bad.privilege_type, bad.table_name;
  end loop;
  for bad in
    select table_name, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'app'
      and grantee = 'authenticated'
      and privilege_type <> 'SELECT'
  loop
    raise exception 'assert.authenticated_read_only: authenticated holds % on app.%', bad.privilege_type, bad.table_name;
  end loop;
  raise notice 'assert.privilege_matrix OK';
end
$$;

do $$
begin
  if has_table_privilege('authenticated', 'app.audit_events', 'INSERT')
     or has_table_privilege('anon', 'app.audit_events', 'INSERT')
     or has_table_privilege('public', 'app.audit_events', 'INSERT') then
    raise exception 'assert.audit_insert_revoked: direct audit inserts must be impossible';
  end if;
  if not has_function_privilege(
    'service_role',
    'app.audit_append(uuid, text, text, uuid, uuid, text, uuid, inet, character, text, jsonb)'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'assert.audit_append_service_grant: service_role must execute app.audit_append';
  end if;
  if has_function_privilege(
    'authenticated',
    'app.audit_append(uuid, text, text, uuid, uuid, text, uuid, inet, character, text, jsonb)'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'assert.audit_append_client_denied: authenticated must not execute app.audit_append';
  end if;
  raise notice 'assert.audit_write_path OK';
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Foreign keys: ON DELETE RESTRICT everywhere.
-- ---------------------------------------------------------------------------
do $$
declare
  bad record;
begin
  for bad in
    select conname, conrelid::regclass::text as tbl, confdeltype
    from pg_constraint
    where connamespace = 'app'::regnamespace
      and contype = 'f'
      and confdeltype <> 'r'
  loop
    raise exception 'assert.fk_restrict: % on % must use ON DELETE RESTRICT', bad.conname, bad.tbl;
  end loop;
  raise notice 'assert.fk_on_delete_restrict OK';
end
$$;

-- ---------------------------------------------------------------------------
-- Behavioral probes: one explicit transaction, rolled back afterwards.
-- ---------------------------------------------------------------------------
begin;

-- 6. Audit chain behavior and tamper evidence.
do $$
declare
  probe uuid;
  first_hash char(64);
  second_prev char(64);
  valid_count integer;
begin
  probe := app.uuid_v7();
  insert into app.companies (id, company_id, legal_name, display_name, is_platform)
  values (probe, app.platform_company_id(), 'Assertion Probe Tenant', 'Assertion Probe', false);

  perform app.audit_append(probe, 'assert.probe_one', 'companies', probe, null, 'service');
  select current_hash into first_hash
  from app.audit_events where company_id = probe order by sequence desc limit 1;

  perform app.audit_append(probe, 'assert.probe_two', 'companies', probe, null, 'service');
  select prev_hash into second_prev
  from app.audit_events where company_id = probe order by sequence desc limit 1;

  if first_hash is distinct from second_prev then
    raise exception 'assert.audit_chain_link: prev_hash does not chain to the prior row';
  end if;

  select count(*) into valid_count
  from app.audit_chain_verify(probe)
  where valid = true;
  if valid_count < 2 then
    raise exception 'assert.audit_chain_verify: expected at least 2 valid rows, found %', valid_count;
  end if;
  raise notice 'assert.audit_chain OK';
end
$$;

-- 7. Approval chain: routing, self-approval denial, single execution,
--    idempotent replay, and terminal immutability.
do $$
declare
  probe_company uuid := app.uuid_v7();
  staff uuid := app.uuid_v7();
  boss uuid := app.uuid_v7();
  supreme uuid := app.uuid_v7();
  cmd uuid;
  st text;
  expected_error boolean;
  exec_one jsonb;
  exec_two jsonb;
begin
  insert into app.companies (id, company_id, legal_name, display_name, is_platform)
  values (probe_company, app.platform_company_id(), 'Approval Probe Tenant', 'Approval Probe', false);

  perform set_config('app.company_id', probe_company::text, true);
  perform set_config('app.user_id', staff::text, true);
  perform set_config('app.user_role', 'staff', true);
  cmd := app.command_propose(probe_company, 'assert.command', '{"probe":true}'::jsonb);

  select status into st from app.command_approvals where id = cmd;
  if st <> 'awaiting_l2' then
    raise exception 'assert.command_route: staff proposal must await l2, found %', st;
  end if;

  expected_error := false;
  begin
    perform app.command_approve_l2(cmd);
  exception
    when raise_exception then
      expected_error := position('awaiting l2' in sqlerrm) > 0;
  end;
  if not expected_error then
    raise exception 'assert.command_self_approval: initiator self-approval must be denied';
  end if;

  perform set_config('app.user_id', boss::text, true);
  perform set_config('app.user_role', 'ceo', true);
  perform app.command_approve_l2(cmd);

  perform set_config('app.user_id', supreme::text, true);
  perform set_config('app.user_role', 'super_admin', true);
  perform app.command_approve_l3(cmd);

  select status into st from app.command_approvals where id = cmd;
  if st <> 'approved' then
    raise exception 'assert.command_approval: expected approved, found %', st;
  end if;

  exec_one := app.command_execute(cmd, '{"done":true}'::jsonb);
  exec_two := app.command_execute(cmd, '{"done":true}'::jsonb);
  if exec_one ->> 'status' <> 'executed' then
    raise exception 'assert.command_execute_once: expected executed, found %', exec_one;
  end if;
  if exec_two ->> 'status' <> 'replay' then
    raise exception 'assert.command_replay: repeated execution must replay, found %', exec_two;
  end if;

  expected_error := false;
  begin
    perform set_config('app.user_id', boss::text, true);
    perform set_config('app.user_role', 'ceo', true);
    perform app.command_approve_l2(cmd);
  exception
    when raise_exception then
      expected_error := position('awaiting l2' in sqlerrm) > 0;
  end;
  if not expected_error then
    raise exception 'assert.command_terminal: executed commands must not transition again';
  end if;

  raise notice 'assert.command_chain OK';
end
$$;

-- 8. Tenant isolation under the authenticated role.
do $$
declare
  tenant_a uuid := app.uuid_v7();
  tenant_b uuid := app.uuid_v7();
  user_a uuid := app.uuid_v7();
  seen integer;
  denied boolean := false;
begin
  insert into app.companies (id, company_id, legal_name, display_name, is_platform)
  values (tenant_a, app.platform_company_id(), 'Isolation Probe A', 'Probe A', false);
  insert into app.companies (id, company_id, legal_name, display_name, is_platform)
  values (tenant_b, app.platform_company_id(), 'Isolation Probe B', 'Probe B', false);

  insert into app.file_records (
    company_id, storage_provider, provider_object_id, category,
    original_filename, sanitized_filename, mime_type, byte_length,
    encryption_key_version, encryption_nonce, encryption_tag,
    ciphertext_sha256, plaintext_hmac
  )
  values (
    tenant_b, 'supabase_storage', 'probe/object-b', 'other',
    'probe.txt', 'probe.txt', 'text/plain', 12,
    1, decode('0102030405060708090a0b0c', 'hex'), decode('0102030405060708090a0b0c0d0e0f10', 'hex'),
    repeat('a', 64), repeat('b', 64)
  );

  execute 'set local role authenticated';
  perform set_config('app.company_id', tenant_a::text, true);
  perform set_config('app.user_id', user_a::text, true);
  perform set_config('app.user_role', 'owner', true);

  select count(*) into seen from app.file_records;
  if seen <> 0 then
    raise exception 'assert.tenant_isolation: tenant A sees % rows from tenant B', seen;
  end if;

  begin
    insert into app.file_records (
      company_id, storage_provider, provider_object_id, category,
      original_filename, sanitized_filename, mime_type, byte_length,
      encryption_key_version, encryption_nonce, encryption_tag,
      ciphertext_sha256, plaintext_hmac
    )
    values (
      tenant_a, 'supabase_storage', 'probe/inject', 'other',
      'inject.txt', 'inject.txt', 'text/plain', 1,
      1, decode('0102030405060708090a0b0c', 'hex'), decode('0102030405060708090a0b0c0d0e0f10', 'hex'),
      repeat('c', 64), repeat('d', 64)
    );
  exception
    when insufficient_privilege then
      denied := true;
  end;
  if not denied then
    raise exception 'assert.write_denied: authenticated direct insert must be denied';
  end if;

  execute 'reset role';
  raise notice 'assert.tenant_isolation OK';
end
$$;

-- 9. Queue claim, rate limit, and leader lock primitives.
do $$
declare
  probe_company uuid := app.uuid_v7();
  claimed_count integer;
  first jsonb;
  leader_a boolean;
  leader_b boolean;
begin
  insert into app.companies (id, company_id, legal_name, display_name, is_platform)
  values (probe_company, app.platform_company_id(), 'Queue Probe Tenant', 'Queue Probe', false);

  insert into app.queue_jobs (company_id, kind, payload)
  values (probe_company, 'assert.job', '{"n":1}'::jsonb);

  select count(*) into claimed_count
  from app.queue_claim('assert-worker', array['assert.job']::text[], 10, 60);
  if claimed_count <> 1 then
    raise exception 'assert.queue_claim: expected 1 claimed job, found %', claimed_count;
  end if;

  first := app.rate_limit_hit(probe_company, 'assert.bucket', 2, 60);
  if (first ->> 'allowed')::boolean is distinct from true then
    raise exception 'assert.rate_limit_first: first window hit must be allowed (%)', first;
  end if;
  first := app.rate_limit_hit(probe_company, 'assert.bucket', 2, 60);
  if (first ->> 'allowed')::boolean is distinct from true then
    raise exception 'assert.rate_limit_second: second window hit must be allowed';
  end if;
  first := app.rate_limit_hit(probe_company, 'assert.bucket', 2, 60);
  if (first ->> 'allowed')::boolean then
    raise exception 'assert.rate_limit_third: third hit must be denied';
  end if;

  leader_a := app.leader_try_acquire(probe_company, 'assert.lock', 'holder-a', 60);
  leader_b := app.leader_try_acquire(probe_company, 'assert.lock', 'holder-b', 60);
  if leader_a is distinct from true or leader_b is distinct from false then
    raise exception 'assert.leader_lock: single-holder contract violated (% %)', leader_a, leader_b;
  end if;
  raise notice 'assert.queue_rate_leader OK';
end
$$;

-- 10. Partial unique soft-delete index behavior.
do $$
declare
  probe_company uuid := app.uuid_v7();
  conflicted boolean := false;
begin
  insert into app.companies (id, company_id, legal_name, display_name, is_platform)
  values (probe_company, app.platform_company_id(), 'Uniqueness Probe', 'Uniqueness Probe', false);

  insert into app.storage_connections (company_id, provider, status)
  values (probe_company, 'supabase_storage', 'enabled');

  begin
    insert into app.storage_connections (company_id, provider, status)
    values (probe_company, 'supabase_storage', 'enabled');
  exception
    when unique_violation then
      conflicted := true;
  end;
  if not conflicted then
    raise exception 'assert.partial_unique: duplicate provider connection must conflict';
  end if;

  update app.storage_connections
  set deleted_at = clock_timestamp()
  where company_id = probe_company and provider = 'supabase_storage';

  insert into app.storage_connections (company_id, provider, status)
  values (probe_company, 'supabase_storage', 'enabled');

  raise notice 'assert.partial_unique_soft_delete OK';
end
$$;

rollback;

raise notice 'step-02 assertions completed';
