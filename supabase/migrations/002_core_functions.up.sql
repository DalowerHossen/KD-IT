-- path: supabase/migrations/002_core_functions.up.sql
-- Step 02 migration 002: PostgreSQL-side primitives consumed by every later
-- migration and by the application access layer: UUID v7 generation, UTC
-- timestamp maintenance, optimistic-lock guard, identity/claims helpers,
-- and the tamper-evident hash helper.

-- Entropy source helper: cryptographically secure random integers through
-- pgcrypto, returned as numeric so 60-bit windows fit safely.
create or replace function app.getrandbits(bits integer default 32)
returns numeric
language plpgsql
volatile
as $fn$
declare
  raw bytea;
  acc  numeric := 0;
  i    integer;
begin
  if bits is null or bits <= 0 or bits > 64 then
    raise exception 'getrandbits requires 1..64 bits' using errcode = '22023';
  end if;
  raw := gen_random_bytes(ceil(bits / 8.0)::int);
  for i in 0..length(raw) - 1 loop
    acc := acc * 256 + get_byte(raw, i);
  end loop;
  acc := mod(acc, pow(2::numeric, bits));
  return floor(acc);
end;
$fn$;

-- UUID v7 generator: 48-bit unix-epoch milliseconds, version nibble 7,
-- 12 random bits, variant bits 10xx, 62 random bits (RFC 9562 profile).
-- Clients never choose authoritative identifiers; every table defaults to
-- this function.
create or replace function app.uuid_v7()
returns uuid
language plpgsql
volatile
leakproof
as $fn$
declare
  epoch_ms text;
  rand_a   text;
  rand_b   text;
begin
  epoch_ms := lpad(to_hex(floor(extract(epoch from clock_timestamp()) * 1000)::bigint), 12, '0');
  rand_a  := lpad(to_hex(app.getrandbits(12)::integer), 3, '0');
  rand_b  := lpad(to_hex(app.getrandbits(60)::bigint), 15, '0');
  return (epoch_ms || '7' || rand_a || (array['8','9','a','b'])[1 + floor(random() * 4)::int] || rand_b)::uuid;
end;
$fn$;

-- UTC maintenance: refreshed on every update; creation uses clock_timestamp
-- defaults in each table so timestamps are always database-truth UTC.
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$fn$;

-- Optimistic lock guard: callers update with WHERE version = :expected.
-- The trigger advances the version by exactly one and rejects any attempt
-- to write a stale or arbitrary version value.
create or replace function app.guard_optimistic_version()
returns trigger
language plpgsql
as $fn$
begin
  if new.version is distinct from old.version then
    if new.version = old.version + 1 then
      return new;
    end if;
    raise exception 'optimistic-lock version conflict on %', tg_table_name
      using errcode = '40001';
  end if;
  new.version := old.version + 1;
  return new;
end;
$fn$;

-- Append-only guard for immutable ledgers: UPDATE and DELETE are forbidden
-- (soft-delete flows use dedicated guarded columns where allowed).
create or replace function app.reject_mutation()
returns trigger
language plpgsql
as $fn$
begin
  raise exception 'table % is append-only', tg_table_name using errcode = '55000';
end;
$fn$;

-- Identity context: set per request by the server access layer through
-- set_config after membership verification. anon clients never receive a
-- permissive policy, so a missing context fails closed.
create or replace function app.current_company_id()
returns uuid
language plpgsql
stable
leakproof
as $fn$
declare
  raw text;
begin
  raw := nullif(current_setting('app.company_id', true), '');
  if raw is not null then
    return raw::uuid;
  end if;
  begin
    raw := auth.jwt() ->> 'company_id';
  exception
    when others then
      raw := null;
  end;
  return nullif(raw, '')::uuid;
end;
$fn$;

create or replace function app.current_user_id()
returns uuid
language plpgsql
stable
leakproof
as $fn$
declare
  raw text;
begin
  raw := nullif(current_setting('app.user_id', true), '');
  if raw is not null then
    return raw::uuid;
  end if;
  begin
    raw := coalesce(auth.jwt() ->> 'sub', auth.jwt() -> 'user_metadata' ->> 'user_id');
  exception
    when others then
      raw := null;
  end;
  return nullif(raw, '')::uuid;
end;
$fn$;

create or replace function app.current_user_role()
returns text
language plpgsql
stable
leakproof
as $fn$
declare
  raw text;
begin
  raw := nullif(current_setting('app.user_role', true), '');
  if raw is not null then
    return raw;
  end if;
  begin
    raw := auth.jwt() -> 'user_metadata' ->> 'role';
  exception
    when others then
      raw := null;
  end;
  return coalesce(raw, 'anon');
end;
$fn$;

create or replace function app.current_correlation_id()
returns uuid
language sql
stable
leakproof
as $fn$
  select nullif(current_setting('app.correlation_id', true), '')::uuid
$fn$;

-- The reserved platform company constant: version-7-shaped, deterministic,
-- used instead of NULL tenancy for platform-level rows.
create or replace function app.platform_company_id()
returns uuid
language sql
immutable
leakproof
as $fn$
  select '00000000-0000-7000-8000-000000000001'::uuid
$fn$;

-- SHA-256 hex helper used by the audit chain and file integrity metadata.
create or replace function app.sha256_hex(payload text)
returns char(64)
language sql
immutable
leakproof
as $fn$
  select encode(public.digest(payload::bytea, 'sha256'), 'hex')
$fn$;

comment on function app.uuid_v7() is 'RFC 9562 UUID v7 generated in PostgreSQL; clients never choose authoritative identifiers.';
comment on function app.guard_optimistic_version() is 'Advances version by one; WHERE version expected updates that match zero rows report an optimistic-lock conflict.';
comment on function app.current_company_id() is 'Tenant boundary from verified request context; missing context fails closed.';
