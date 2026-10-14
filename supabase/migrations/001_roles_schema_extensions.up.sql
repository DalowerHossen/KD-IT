-- path: supabase/migrations/001_roles_schema_extensions.up.sql
-- Step 02 migration 001: Supabase role shim (for non-managed databases),
-- application schema, required extensions, and migration ledger.
-- Idempotent where PostgreSQL permits per project migration conventions.

create extension if not exists pgcrypto with schema public;

create schema if not exists app;

-- Supabase-managed databases already own these roles. On plain PostgreSQL
-- (local verification, Docker, VPS parity) they are created so the identical
-- policies and grants apply everywhere. Password logins are never enabled.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create role supabase_admin nologin noinherit bypassrls;
  end if;
end
$$;

-- Minimal auth.jwt() shim used by tenant helpers when running outside
-- Supabase; on managed Supabase the real auth.jwt() already exists and this
-- block never replaces it.
create schema if not exists auth;
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'jwt'
  ) then
    execute $auth$create function auth.jwt() returns jsonb
      language sql stable
      as 'select nullif(current_setting(''request.jwt.claims'', true), '''')::jsonb'$auth$;
  end if;
end
$$;

-- Migration ledger: created here so rollback history itself is tenant-free
-- infrastructure metadata. The runner writes via the direct pg connection,
-- never through PostgREST.
create table if not exists app.schema_migrations (
  id bigint generated always as identity primary key,
  migration_name text not null unique,
  checksum_sha256 char(64) not null,
  direction text not null check (direction in ('up', 'down')),
  applied_at timestamptz not null default now(),
  applied_by text not null default current_user
);

revoke all on app.schema_migrations from public;
