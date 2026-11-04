-- Applied to the existing project on 2026-11-04. No learning rows are changed.
revoke all privileges on table public.user_state from anon, authenticated;
grant select, insert, update, delete on table public.user_state to authenticated;
-- Retain the existing owner_id = auth.uid() RLS and blocked-account restrictive policy.
