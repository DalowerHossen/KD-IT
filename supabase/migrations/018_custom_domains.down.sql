-- path: supabase/migrations/018_custom_domains.down.sql
-- Reverses Step 03 substep M: tenant custom domains.

drop table if exists app.custom_domains;
