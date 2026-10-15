-- path: supabase/assertions/step-03b-assert.sql
-- Step 03 substep B SQL assertion suite. Executed by npm run db:assert
-- alongside the earlier suites. Structural blocks run directly; behavioral
-- probes run inside one explicit transaction that is rolled back.

set client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- 1. Profile lifecycle carries the approval state.
-- ---------------------------------------------------------------------------
do $$
declare
  status_def text;
  status_name text;
begin
  select pg_get_constraintdef(oid) into status_def
  from pg_constraint
  where conrelid = 'app.profiles'::regclass
    and conname = 'profiles_status_check';
  if status_def is null then
    raise exception 'assert03b.profile_status: profiles_status_check not found';
  end if;
  for status_name in
    select unnest(array[
      'pending_verification', 'pending_approval', 'active', 'suspended', 'deactivated'
    ])
  loop
    if position(status_name in status_def) = 0 then
      raise exception 'assert03b.profile_status: status check misses %', status_name;
    end if;
  end loop;
  raise notice 'assert03b.profile_status OK';
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Session token envelope columns exist with strict types and NOT NULL.
-- ---------------------------------------------------------------------------
do $$
declare
  expected record;
begin
  for expected in
    select * from (values
      ('refresh_token_ciphertext', 'bytea'),
      ('refresh_token_nonce', 'bytea'),
      ('refresh_token_tag', 'bytea'),
      ('refresh_token_key_version', 'integer'),
      ('refresh_token_sha256', 'text')
    ) as columns(column_name, data_type)
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'app'
        and table_name = 'auth_sessions'
        and column_name = expected.column_name
        and data_type = expected.data_type
        and is_nullable = 'NO'
    ) then
      raise exception 'assert03b.session_token_columns: app.auth_sessions.% must exist as NOT NULL %',
        expected.column_name, expected.data_type;
    end if;
  end loop;
  if not exists (
    select 1 from pg_indexes where schemaname = 'app' and indexname = 'idx_auth_sessions_user_token'
  ) then
    raise exception 'assert03b.session_token_columns: idx_auth_sessions_user_token is missing';
  end if;
  if not exists (
    select 1 from pg_indexes where schemaname = 'app' and indexname = 'idx_auth_devices_user_key'
  ) then
    raise exception 'assert03b.session_token_columns: idx_auth_devices_user_key is missing';
  end if;
  raise notice 'assert03b.session_token_columns OK';
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Password history: contract columns, forced RLS, no browser surface.
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
        ('version', 'integer'),
        ('user_id', 'uuid'),
        ('password_hash', 'text')
    )
    select e.col as col
    from expected e
    left join information_schema.columns c
      on c.table_schema = 'app'
      and c.table_name = 'password_history'
      and c.column_name = e.col
      and c.data_type = e.typ
    where c.column_name is null
  loop
    raise exception 'assert03b.password_history_columns: missing %', missing.col;
  end loop;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app' and c.relname = 'password_history'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'assert03b.password_history_rls: forced RLS is required';
  end if;

  if (select count(*) from pg_policies where schemaname = 'app' and tablename = 'password_history') <> 0 then
    raise exception 'assert03b.password_history_rls: no browser policy may exist';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'app' and table_name = 'password_history'
      and grantee = 'authenticated'
  ) then
    raise exception 'assert03b.password_history_grants: authenticated must hold no privilege';
  end if;

  if exists (
    select 1 from pg_trigger
    where tgrelid = 'app.password_history'::regclass
      and tgisinternal = false
      and tgname = 'password_history_audit'
  ) then
    raise exception 'assert03b.password_history_audit: verifiers must not be audited row-wise';
  end if;

  raise notice 'assert03b.password_history OK';
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Behavioral probes inside a rolled-back transaction.
-- ---------------------------------------------------------------------------
begin;

-- 4a. Token envelope and history guards reject malformed writes.
do $$
declare
  probe_user uuid := app.uuid_v7();
  rejected boolean;
begin
  rejected := false;
  begin
    insert into app.auth_sessions (
      company_id, user_id, expires_at,
      refresh_token_ciphertext, refresh_token_nonce, refresh_token_tag,
      refresh_token_key_version, refresh_token_sha256
    )
    values (
      app.platform_company_id(), probe_user, clock_timestamp() + make_interval(hours => 24),
      decode('aa', 'hex'), decode('bb', 'hex'), decode('cc', 'hex'),
      1, 'not-a-hash'
    );
  exception
    when check_violation then
      rejected := true;
  end;
  if not rejected then
    raise exception 'assert03b.token_fingerprint: malformed fingerprint must fail';
  end if;

  rejected := false;
  begin
    insert into app.password_history (company_id, user_id, password_hash)
    values (app.platform_company_id(), probe_user, 'short');
  exception
    when check_violation then
      rejected := true;
  end;
  if not rejected then
    raise exception 'assert03b.history_shape: short verifier must fail';
  end if;

  insert into app.password_history (company_id, user_id, password_hash)
  values (app.platform_company_id(), probe_user, repeat('h', 64));
  raise notice 'assert03b.constraint_guards OK';
end
$$;

-- 4b. Token fingerprint is unique per live session.
do $$
declare
  probe_user uuid := app.uuid_v7();
  fingerprint text := repeat('d', 64);
  rejected boolean;
begin
  insert into app.auth_sessions (
    company_id, user_id, expires_at,
    refresh_token_ciphertext, refresh_token_nonce, refresh_token_tag,
    refresh_token_key_version, refresh_token_sha256
  )
  values (
    app.platform_company_id(), probe_user, clock_timestamp() + make_interval(hours => 24),
    decode('aa', 'hex'), decode('bb', 'hex'), decode('cc', 'hex'),
    1, fingerprint
  );
  rejected := false;
  begin
    insert into app.auth_sessions (
      company_id, user_id, expires_at,
      refresh_token_ciphertext, refresh_token_nonce, refresh_token_tag,
      refresh_token_key_version, refresh_token_sha256
    )
    values (
      app.platform_company_id(), probe_user, clock_timestamp() + make_interval(hours => 24),
      decode('aa', 'hex'), decode('bb', 'hex'), decode('cc', 'hex'),
      1, fingerprint
    );
  exception
    when unique_violation then
      rejected := true;
  end;
  if not rejected then
    raise exception 'assert03b.token_unique: duplicate live fingerprint must fail';
  end if;
  raise notice 'assert03b.token_unique OK';
end
$$;

rollback;
