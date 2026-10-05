-- LOCAL-ONLY disposable fixture for the home sections:
--   - Circuiti MOVI
--   - Tornei Home with Baraonda and Coppie fisse system backgrounds
--
-- Apply only to the local Supabase database:
-- psql "postgresql://postgres:postgres@127.0.0.1:55022/postgres" \
--   -v LOCAL_FIXTURE_OK=true \
--   -f supabase/tests/fixtures/home_sections_visual.local.sql
--
-- Cleanup:
-- psql "postgresql://postgres:postgres@127.0.0.1:55022/postgres" \
--   -c "delete from public.tournaments where id in ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000004'); delete from public.circuits where id = '10000000-0000-4000-8000-000000000001';"

\if :{?LOCAL_FIXTURE_OK}
\if :LOCAL_FIXTURE_OK
\echo 'Applying disposable LOCAL home visual fixture'
\else
\echo 'Refusing to run: pass -v LOCAL_FIXTURE_OK=true and use port 55022.'
\quit
\endif
\else
\echo 'Refusing to run: pass -v LOCAL_FIXTURE_OK=true and use port 55022.'
\quit
\endif

begin;

insert into public.circuits (
  id,
  name,
  slug,
  tournament_type,
  status,
  hero_subtitle,
  theme_key
)
values (
  '10000000-0000-4000-8000-000000000001',
  'Circuito MOVI — Fixture locale',
  'fixture-locale-home',
  'Coppie fisse',
  'active',
  'Fixture locale usa e getta',
  'default'
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  tournament_type = excluded.tournament_type,
  status = excluded.status,
  hero_subtitle = excluded.hero_subtitle,
  theme_key = excluded.theme_key,
  updated_at = now();

insert into public.tournaments (
  id,
  name,
  type,
  category,
  level,
  date,
  "time",
  location,
  max_participants,
  registrations_open,
  show_participants,
  circuit_id,
  notes
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    'Coppie Maschile — Fixture locale',
    'Coppie fisse',
    'Maschile',
    'intermedio',
    (now() at time zone 'Europe/Rome')::date + 1,
    '19:30',
    'MOVI Club Fixture locale',
    16,
    true,
    false,
    '10000000-0000-4000-8000-000000000001',
    'Fixture locale per background Coppie Maschile'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'Baraonda Maschile — Fixture locale',
    'Baraonda',
    'Maschile',
    'avanzato',
    (now() at time zone 'Europe/Rome')::date + 2,
    '20:00',
    'MOVI Club Manta',
    16,
    true,
    false,
    null,
    'Fixture locale per background Baraonda Maschile'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    'Baraonda Femminile — Fixture locale',
    'Baraonda',
    'Femminile',
    'intermedio',
    (now() at time zone 'Europe/Rome')::date + 3,
    '18:30',
    'MOVI Club Saluzzo',
    16,
    true,
    false,
    null,
    'Fixture locale per badge Femminile'
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    'Coppie Open — Fixture locale',
    'Coppie fisse',
    'Libero',
    'open',
    (now() at time zone 'Europe/Rome')::date + 4,
    '21:00',
    'MOVI Club Centallo',
    16,
    true,
    false,
    null,
    'Fixture locale per badge Open Libero'
  )
on conflict (id) do update set
  name = excluded.name,
  type = excluded.type,
  category = excluded.category,
  level = excluded.level,
  date = excluded.date,
  "time" = excluded."time",
  location = excluded.location,
  max_participants = excluded.max_participants,
  registrations_open = excluded.registrations_open,
  show_participants = excluded.show_participants,
  circuit_id = excluded.circuit_id,
  notes = excluded.notes,
  updated_at = now();

commit;
