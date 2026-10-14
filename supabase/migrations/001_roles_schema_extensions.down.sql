-- path: supabase/migrations/001_roles_schema_extensions.down.sql
-- Rollback of migration 001. Roles and the pgcrypto extension are shared
-- platform infrastructure: dropping them would break sibling Supabase
-- features, so only application-owned artifacts are removed.

drop table if exists app.schema_migrations;
drop schema if exists app;

-- auth.jwt() is dropped only when it is the local shim (Supabase databases
-- have additional overloads owned by supabase_admin and are left untouched).
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'jwt'
      and pg_get_function_identity_arguments(p.oid) = ''
      and p.proowner <> (select oid from pg_roles where rolname = 'supabase_admin')
  ) then
    execute 'drop function if exists auth.jwt()';
  end if;
end
$$;
drop schema if exists auth;
