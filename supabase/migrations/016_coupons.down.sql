-- path: supabase/migrations/016_coupons.down.sql
-- Reverses Step 03 substep K: the platform coupon catalog.

drop table if exists app.coupons;
