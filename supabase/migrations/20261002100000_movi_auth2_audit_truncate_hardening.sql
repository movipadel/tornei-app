-- MOVI Auth 2.0 prerelease hardening.
--
-- These tables are append-only audit/evidence records.
-- UPDATE and DELETE are already rejected by immutable-table triggers.
-- TRUNCATE does not fire row-level DELETE triggers, so it must also be
-- explicitly revoked from service_role.

revoke truncate on table public.user_auth_link_events
from service_role;

revoke truncate on table public.user_auth_migration_events
from service_role;

revoke truncate on table public.user_duplicate_review_decisions
from service_role;

revoke truncate on table public.user_legacy_login_events
from service_role;

revoke truncate on table public.user_merge_journal
from service_role;

revoke truncate on table public.user_moviback_reconciliation_evidence
from service_role;