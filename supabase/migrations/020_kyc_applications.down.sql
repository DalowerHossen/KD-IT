-- path: supabase/migrations/020_kyc_applications.down.sql
-- Reverses Step 03 substep O: KYC upload and review.

drop table if exists app.kyc_applications;

-- Restore the pre-KYC in-app notification type vocabulary.
alter table app.notifications drop constraint if exists notifications_type_check;
alter table app.notifications add constraint notifications_type_check
  check (type in (
    'membership.invited',
    'membership.role_changed',
    'workspace.ready',
    'security.alert'
  ));
