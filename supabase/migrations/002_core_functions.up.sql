-- path: supabase/migrations/002_core_functions.up.sql
-- Step 02 migration 002: database-side foundational functions. All
-- application tables mint IDs through app.uuid_v7(); timestamps, row
-- versions, context readers, and the SHA-256 helper live only here.

-- Cryptographically strong uniform random bit source (pgcrypto-backed).
create or replace function app.getrandbits(bits integer)
returns bigint
language plpgsql
volatile
as $fn$
declare
  v bigint;
begin
  if bits is null or bits < 1 or bits > 63 then
    raise exception 'getrandbits requires bits between 1 and 63, got %', bits
      using errcode = '22023';
  end if;
  v := ('x' || lpad(encode(gen_random_bytes(8), 'hex'), 16, '0'))::bit(64)::bigint;
  return v & ((1::bigint << (bits - 1)) + ((1::bigint << (bits - 1)) - 1));
end;
$fn$;

-- RFC 9562 UUID version 7: 48-bit Unix epoch milliseconds, version nibble,
-- 12 crypto-random a bits, variant nibble, 62 crypto-random b bits.
create or replace function app.uuid_v7()
returns uuid
language plpgsql
volatile
as $fn$
declare
  now_ms bigint;
  rand_a integer;
  rand_variant integer;
  rand_b bigint;
  hex_text text;
begin
  now_ms := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  rand_a := app.getrandbits(12);
  rand_variant := 8 + app.getrandbits(2);
  rand_b := app.getrandbits(60);

  hex_text :=
    lpad(to_hex(now_ms), 12, '0')
    || '7'
    || lpad(to_hex(rand_a), 3, '0')
    || to_hex(rand_variant)
    || lpad(to_hex(rand_b), 15, '0');

  return (
    substr(hex_text, 1, 8) || '-'
    || substr(hex_text, 9, 4) || '-'
    || substr(hex_text, 13, 4) || '-'
    || substr(hex_text, 17, 4) || '-'
    || substr(hex_text, 21, 12)
  )::uuid;
end;
$fn$;

comment on function app.uuid_v7() is 'RFC 9562 v7 time-ordered UUID; default generator for every application table id.';

-- UTC updated_at maintenance.
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = app, public, extensions
as $fn$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$fn$;

-- Optimistic concurrency guard: writers either supply exactly the next
-- version or let the database increment; anything else is a lost-update
-- attempt and raises serialization_failure (40001).
create or replace function app.guard_optimistic_version()
returns trigger
language plpgsql
set search_path = app, public, extensions
as $fn$
begin
  if new.version is null then
    raise exception 'version must not be null' using errcode = '22023';
  end if;
  if new.version = old.version then
    new.version := old.version + 1;
    return new;
  end if;
  if new.version = old.version + 1 then
    return new;
  end if;
  raise exception 'stale optimistic version % (expected % or %)',
    new.version, old.version, old.version + 1
    using errcode = '40001';
end;
$fn$;

-- Hard append-only enforcement for audit and event ledgers.
create or replace function app.reject_mutation()
returns trigger
language plpgsql
set search_path = app, public, extensions
as $fn$
begin
  raise exception 'table % is append-only; % is prohibited', TG_TABLE_NAME, TG_OP
    using errcode = '55000';
end;
$fn$;

/**
 * Request-scoped tenant context. Every session establishes
 * app.company_id, app.user_id, app.user_role, and app.correlation_id via auto
 * set_config (see lib/db/pg/tenant-context). Supabase-hosted environments
 * additionally accept the same claims from auth.jwt(). Null and empty
 * settings fail closed.
 */
create or replace function app.current_company_id()
returns uuid
language sql
stable
set search_path = app, public, extensions
as $fn$
  select coalesce(
    nullif(current_setting('app.company_id', true), '')::uuid,
    nullif(coalesce(auth.jwt() ->> 'company_id', ''), '')::uuid
  );
$fn$;

create or replace function app.current_user_id()
returns uuid
language sql
stable
set search_path = app, public, extensions
as $fn$
  select coalesce(
    nullif(current_setting('app.user_id', true), '')::uuid,
    nullif(coalesce(auth.jwt() ->> 'sub', ''), '')::uuid
  );
$fn$;

create or replace function app.current_user_role()
returns text
language sql
stable
set search_path = app, public, extensions
as $fn$
  select nullif(current_setting('app.user_role', true), '');
$fn$;

create or replace function app.current_correlation_id()
returns uuid
language sql
stable
set search_path = app, public, extensions
as $fn$
  select nullif(current_setting('app.correlation_id', true), '')::uuid;
$fn$;

-- Platform-reserved company record. The platform tenant is a real row so
-- every shared-tenant rule and foreign key behaves identically for it.
create or replace function app.platform_company_id()
returns uuid
language sql
immutable
leakproof
set search_path = app, public, extensions
as $fn$
  select '00000000-0000-7000-8000-000000000001'::uuid;
$fn$;

-- Deterministic SHA-256 hex helper (audit chain and payload hashing).
create or replace function app.sha256_hex(value text)
returns char(64)
language sql
strict
set search_path = app, public, extensions
as $fn$
  select encode(digest(value, 'sha256'), 'hex')::char(64);
$fn$;
