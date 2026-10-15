-- path: supabase/migrations/010_auth_lifecycle.down.sql
-- Step 03 substep B rollback for migration 010. Drops the password history
-- store and session token columns, and restores the four-state profile
-- status. Rows awaiting approval return to pending_verification so the
-- restored constraint holds; re-running the forward migration plus the
-- verification flow moves them forward again.

drop table if exists app.password_history;

drop index if exists app.idx_auth_devices_user_key;
drop index if exists app.idx_auth_sessions_user_token;

alter table app.auth_sessions drop column if exists refresh_token_ciphertext;
alter table app.auth_sessions drop column if exists refresh_token_nonce;
alter table app.auth_sessions drop column if exists refresh_token_tag;
alter table app.auth_sessions drop column if exists refresh_token_key_version;
alter table app.auth_sessions drop column if exists refresh_token_sha256;

update app.profiles
set status = 'pending_verification'
where status = 'pending_approval' and deleted_at is null;

alter table app.profiles drop constraint if exists profiles_status_check;

alter table app.profiles add constraint profiles_status_check
  check (status in ('pending_verification', 'active', 'suspended', 'deactivated'));
