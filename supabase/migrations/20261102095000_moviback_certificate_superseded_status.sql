begin;

-- Bridge for historical duplicate-pending remediation. Keep the unique index
-- in the later hardening migration, after the operational cleanup has run.
alter table public.medical_certificates drop constraint medical_status_check;
alter table public.medical_certificates add constraint medical_status_check
  check (status in ('uploaded','pending_review','approved','rejected','expired','superseded'));

commit;
