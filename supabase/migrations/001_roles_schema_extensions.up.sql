-- path: supabase/migrations/001_roles_schema_extensions.up.sql
-- Step 02 migration 001: application schema, required extension, migration
-- ledger, and a compatibility layer so the same migrations run identically
-- on Supabase-hosted and self-hosted PostgreSQL.

create schema if not exists app;

-- SHA-256 digest functions and cryptographically strong random bytes
-- underpin the audit chain, UUID v7, and SQL-side hashing helpers. The
-- extension lands in the environment-appropriate schema (public on
-- self-hosted, extensions on Supabase); all platform functions set
-- search_path = app, public, extensions so resolution works identically.
create extension if not exists pgcrypto;

-- Migration ledger written by scripts/db/lib/runner.mjs after every
-- successful migration transaction. Down entries are retained as history;
-- applied state is the set difference of up and successful down rows.
create table if not exists app.schema_migrations (
  id bigint generated always as identity primary key,
  migration_name text not null unique check (migration_name ~ '^[0-9]{3}_[a-z0-9_]+$'),
  checksum_sha256 char(64) not null,
  direction text not null check (direction in ('up', 'down')),
  applied_at timestamptz not null default clock_timestamp(),
  applied_by text not null default current_user
);

comment on table app.schema_migrations is 'Migration ledger: forward and rollback entries recorded with checksums so artifacts are verifiable.';

-- Supabase roles exist on hosted projects. On self-hosted PostgreSQL they
-- do not, so this shim creates advertising-compatible roles with matching
-- containment and bypassrls characteristics. Idempotent by creation failure
-- guard.
do $$
declare
  wanted text[] := array['anon', 'authenticated', 'service_role', 'supabase_admin'];
  role_name text;
begin
  foreach role_name in array wanted loop
    if not exists (select 1 from pg_roles where rolename = role_name) then
      if role_name = 'service_role' then
        execute format('create role %I nologin inherit bypassrls', role_name);
      else
        execute format('create role %I nologin inherit', role_name);
      end if;
    end if;
  end loop;
end;
$$;

-- Membership: platform database owner keeps full authority; service_role
-- and supabase_admin receive the running owner so the security-definer and
-- migration code execute with the same truth on every environment.
do $$
declare
  owner_role text;
begin
  select pg_get_userbyid(d.oid) into owner_role
  from pg_database d
  where d.datname = current_database();
  if owner_role is not null and owner_role <> 'service_role' then
    begin
      execute format('grant %I to service_role', owner_role);
    exception when others then
      null;
    end;
  end if;
  if owner_role is not null and owner_role <> 'supabase_admin' then
    begin
      execute format('grant %I to supabase_admin', owner_role);
    exception when others then
      null;
    end;
  end if;
end;
$$;

-- Supabase exposes auth.jwt() for policies. Self-hosted deployments do not,
-- so we provide a shim reading the same request-scoped setting that the
-- GoTrue proxy sets (request.jwt.claims). The shim is only created when the
-- native function is missing.
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'jwt'
  ) then
    create schema if not exists auth;
    execute $shim$
      create or replace function auth.jwt()
      returns jsonb
      language sql
      stable
      leakproof
      as $inner$
        select coalesce(
          nullif(current_setting('request.jwt.claims', true), ''),
          '{}'
        )::jsonb;
      $inner$;
    $shim$;
  end if;
end;
$$;
