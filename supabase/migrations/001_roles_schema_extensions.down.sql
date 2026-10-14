-- path: supabase/migrations/001_roles_schema_extensions.down.sql
-- Rollback of migration 001. Roles that pre-existed on hosted Supabase are
-- never dropped because the shim only creates them when absent; the shim
-- itself cannot reliably prove origin, so it only removes objects it is
-- certain it created: the schema-shim function is kept (it is inert on
-- hosted environments).

drop table if exists app.schema_migrations;

-- Drop the auth.jwt() shim ONLY when it is demonstrably ours: hosted
-- Supabase ships its own auth.jwt() whose body never references the
-- request.jwt.claims fallback used by the shim.
do $$
declare
  shim_body text;
begin
  select p.prosrc into shim_body
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'auth' and p.proname = 'jwt' and pg_get_function_arguments(p.oid) = '';

  if found and shim_body like '%request.jwt.claims%' then
    execute 'drop function auth.jwt() cascade';
  end if;
  if exists (select 1 from pg_tables where schemaname = 'auth' limit 1)
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'auth') then
    null;
  else
    begin
      execute 'drop schema auth';
    exception when others then
      null;
    end;
  end if;
end;
$$;

-- pgcrypto and Supabase-compatible roles remain: they may be shared by the
-- hosting platform. The app schema is dropped (empty after later rollbacks).
drop schema if exists app;
