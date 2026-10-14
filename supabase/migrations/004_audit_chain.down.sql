-- path: supabase/migrations/004_audit_chain.down.sql
-- Rollback of migration 004.

drop policy if exists audit_events_tenant_auditor_read on app.audit_events;

drop function if exists app.audit_mutation_trigger();
drop function if exists app.audit_append(uuid, text, text, uuid, uuid, text, uuid, inet, char, text, jsonb);
drop function if exists app.audit_chain_verify(uuid, bigint, bigint);

drop trigger if exists audit_events_reject_mutation on app.audit_events;
drop index if exists app.audit_events_correlation_idx;
drop index if exists app.audit_events_company_action_idx;
drop index if exists app.audit_events_company_resource_idx;
drop index if exists app.audit_events_company_sequence_idx;
drop table if exists app.audit_events;
