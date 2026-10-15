-- path: supabase/migrations/019_backup_requests.down.sql
-- Reverses Step 03 substep N: encrypted backup requests.

drop table if exists app.backup_requests;
