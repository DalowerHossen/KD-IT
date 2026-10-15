-- path: supabase/migrations/017_tenant_settings.down.sql
-- Reverses Step 03 substep L: tenant profile and invoice settings.

drop table if exists app.company_invoice_settings;
drop table if exists app.company_profiles;
