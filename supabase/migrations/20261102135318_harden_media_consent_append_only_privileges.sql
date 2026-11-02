begin;

-- Application writes use the SECURITY DEFINER record_user_media_consent RPC.
-- The security-invoker current-state view still needs direct SELECT on events.
-- Supabase default table grants otherwise leave service_role able to TRUNCATE
-- the audit history without firing the UPDATE/DELETE immutability trigger.
revoke all on table public.user_media_consent_events from service_role;
grant select on table public.user_media_consent_events to service_role;

commit;
