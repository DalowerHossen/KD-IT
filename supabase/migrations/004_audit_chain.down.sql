-- path: supabase/migrations/004_audit_chain.down.sql
-- Rollback of migration 004.

drop policy if exists audit_events_ledger_read on app.audit_events;

drop function if exists app.audit_mutation_trigger();
drop function if exists app.audit_chain_verify(uuid, bigint, bigint);
drop function if exists app.audit_append(uuid, text, text, uuid, uuid, text, uuid, inet, char, text, jsonb);

drop trigger if exists audit_events_reject_mutation on app.audit_events;
drop table if exists app.audit_events;
