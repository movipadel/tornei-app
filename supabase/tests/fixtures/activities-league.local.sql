-- Run only through the verified local activities fixture runner.
begin;
insert into public.league_seasons(id,name,slug,status,public_visibility,published_at) values('edee8000-0000-4000-8000-000000000001','Monday League Demo Attività','activities-demo','phase1','public',now()) on conflict(id) do nothing;
insert into public.league_phases(id,season_id,code,name,sequence,status) values('edee8100-0000-4000-8000-000000000001','edee8000-0000-4000-8000-000000000001','phase1','Girone Demo',1,'generated') on conflict(id) do nothing;
insert into public.league_teams(id,season_id,name,slug,captain_player_id) values
('edee8200-0000-4000-8000-000000000001','edee8000-0000-4000-8000-000000000001','MOVI Team Demo','movi-team-demo','edee8300-0000-4000-8000-000000000001'),
('edee8200-0000-4000-8000-000000000002','edee8000-0000-4000-8000-000000000001','Avversari Demo','avversari-demo','edee8300-0000-4000-8000-000000000002') on conflict(id) do nothing;
insert into public.league_team_players(id,team_id,display_name,user_id) values
('edee8300-0000-4000-8000-000000000001','edee8200-0000-4000-8000-000000000001','Utente Richieste Demo 1','eded6000-0000-4000-8000-000000000001'),
('edee8300-0000-4000-8000-000000000002','edee8200-0000-4000-8000-000000000002','Capitano Avversari Demo','eded6000-0000-4000-8000-000000000002') on conflict(id) do nothing;
insert into public.league_phase_teams(phase_id,team_id,seed_position,tie_break_order) values
('edee8100-0000-4000-8000-000000000001','edee8200-0000-4000-8000-000000000001',1,1),
('edee8100-0000-4000-8000-000000000001','edee8200-0000-4000-8000-000000000002',2,2) on conflict do nothing;
insert into public.league_rounds(id,phase_id,round_number) values('edee8400-0000-4000-8000-000000000001','edee8100-0000-4000-8000-000000000001',1) on conflict(id) do nothing;
insert into public.league_venues(id,code,name) values('edee8500-0000-4000-8000-000000000001','ACTIVITIES_DEMO','Costigliole · Demo attività') on conflict(id) do nothing;
insert into public.league_matches(id,phase_id,round_id,home_team_id,away_team_id,venue_id,scheduled_at,match_status) values
('edee8600-0000-4000-8000-000000000001','edee8100-0000-4000-8000-000000000001','edee8400-0000-4000-8000-000000000001','edee8200-0000-4000-8000-000000000001','edee8200-0000-4000-8000-000000000002','edee8500-0000-4000-8000-000000000001',((date_trunc('week',now() at time zone 'Europe/Rome')+interval '14 days 21 hours 30 minutes') at time zone 'Europe/Rome'),'scheduled') on conflict(id) do nothing;
insert into public.league_match_team_slots(match_id,round_id,team_id,side) values
('edee8600-0000-4000-8000-000000000001','edee8400-0000-4000-8000-000000000001','edee8200-0000-4000-8000-000000000001','home'),
('edee8600-0000-4000-8000-000000000001','edee8400-0000-4000-8000-000000000001','edee8200-0000-4000-8000-000000000002','away') on conflict do nothing;
commit;
