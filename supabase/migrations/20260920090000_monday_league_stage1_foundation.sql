-- Monday League Stage 1: additive domain foundation and locked-down security.
-- No season, team, phase, round, or match production data is created here.

CREATE TABLE public.league_seasons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    timezone text DEFAULT 'Europe/Rome'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    max_teams integer DEFAULT 16 NOT NULL,
    lottery_seed text,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT league_seasons_pkey PRIMARY KEY (id),
    CONSTRAINT league_seasons_slug_key UNIQUE (slug),
    CONSTRAINT league_seasons_name_check CHECK (btrim(name) <> ''::text),
    CONSTRAINT league_seasons_slug_check CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text),
    CONSTRAINT league_seasons_timezone_check CHECK (timezone = 'Europe/Rome'::text),
    CONSTRAINT league_seasons_status_check CHECK (status = ANY (ARRAY[
        'draft'::text, 'phase1'::text, 'phase2'::text,
        'completed'::text, 'archived'::text
    ])),
    CONSTRAINT league_seasons_max_teams_check CHECK (max_teams BETWEEN 2 AND 16)
);

CREATE INDEX league_seasons_status_published_idx
    ON public.league_seasons (status, published_at);

CREATE TABLE public.league_teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    season_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    captain_player_id uuid NOT NULL,
    slogan text,
    logo_path text,
    image_path text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT league_teams_pkey PRIMARY KEY (id),
    CONSTRAINT league_teams_season_id_fkey
        FOREIGN KEY (season_id) REFERENCES public.league_seasons(id) ON DELETE CASCADE,
    CONSTRAINT league_teams_season_name_key UNIQUE (season_id, name),
    CONSTRAINT league_teams_season_slug_key UNIQUE (season_id, slug),
    CONSTRAINT league_teams_name_check CHECK (btrim(name) <> ''::text),
    CONSTRAINT league_teams_slug_check CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text)
);

CREATE UNIQUE INDEX league_teams_id_season_key ON public.league_teams (id, season_id);
CREATE INDEX league_teams_season_active_idx ON public.league_teams (season_id, is_active);

CREATE TABLE public.league_team_players (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    display_name text NOT NULL,
    user_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    left_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT league_team_players_pkey PRIMARY KEY (id),
    CONSTRAINT league_team_players_team_id_fkey
        FOREIGN KEY (team_id) REFERENCES public.league_teams(id) ON DELETE CASCADE,
    CONSTRAINT league_team_players_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
    CONSTRAINT league_team_players_team_id_id_key UNIQUE (team_id, id),
    CONSTRAINT league_team_players_display_name_check CHECK (btrim(display_name) <> ''::text),
    CONSTRAINT league_team_players_active_dates_check CHECK (
        (is_active AND left_at IS NULL)
        OR (NOT is_active AND left_at IS NOT NULL AND left_at >= joined_at)
    )
);

CREATE UNIQUE INDEX league_team_players_team_user_key
    ON public.league_team_players (team_id, user_id)
    WHERE user_id IS NOT NULL;
CREATE INDEX league_team_players_team_active_idx
    ON public.league_team_players (team_id, is_active);
CREATE INDEX league_team_players_user_idx
    ON public.league_team_players (user_id)
    WHERE user_id IS NOT NULL;

ALTER TABLE public.league_teams
    ADD CONSTRAINT league_teams_captain_player_fkey
    FOREIGN KEY (id, captain_player_id)
    REFERENCES public.league_team_players(team_id, id)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.league_phases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    season_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    sequence integer NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    source_phase_id uuid,
    algorithm_version text,
    generation_fingerprint text,
    generated_at timestamp with time zone,
    finalized_at timestamp with time zone,
    finalized_by_staff_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT league_phases_pkey PRIMARY KEY (id),
    CONSTRAINT league_phases_season_id_fkey
        FOREIGN KEY (season_id) REFERENCES public.league_seasons(id) ON DELETE CASCADE,
    CONSTRAINT league_phases_finalized_by_staff_id_fkey
        FOREIGN KEY (finalized_by_staff_id) REFERENCES public.staff_users(id) ON DELETE RESTRICT,
    CONSTRAINT league_phases_season_code_key UNIQUE (season_id, code),
    CONSTRAINT league_phases_season_id_id_key UNIQUE (season_id, id),
    CONSTRAINT league_phases_code_check CHECK (code = ANY (ARRAY[
        'phase1'::text, 'serie_a'::text, 'serie_b'::text
    ])),
    CONSTRAINT league_phases_name_check CHECK (btrim(name) <> ''::text),
    CONSTRAINT league_phases_sequence_check CHECK (sequence > 0),
    CONSTRAINT league_phases_status_check CHECK (status = ANY (ARRAY[
        'draft'::text, 'generated'::text, 'in_progress'::text, 'finalized'::text
    ])),
    CONSTRAINT league_phases_source_shape_check CHECK (
        (code = 'phase1'::text AND source_phase_id IS NULL)
        OR (code IN ('serie_a'::text, 'serie_b'::text) AND source_phase_id IS NOT NULL)
    ),
    CONSTRAINT league_phases_generation_fingerprint_check CHECK (
        generation_fingerprint IS NULL
        OR generation_fingerprint ~ '^[0-9a-f]{64}$'::text
    ),
    CONSTRAINT league_phases_finalization_check CHECK (
        (status = 'finalized'::text AND finalized_at IS NOT NULL AND finalized_by_staff_id IS NOT NULL)
        OR (status <> 'finalized'::text)
    ),
    CONSTRAINT league_phases_source_same_season_fkey
        FOREIGN KEY (season_id, source_phase_id)
        REFERENCES public.league_phases(season_id, id)
        ON DELETE RESTRICT
        DEFERRABLE INITIALLY DEFERRED
);

CREATE UNIQUE INDEX league_phases_source_code_key
    ON public.league_phases (source_phase_id, code)
    WHERE source_phase_id IS NOT NULL;
CREATE INDEX league_phases_season_status_idx
    ON public.league_phases (season_id, status);

CREATE TABLE public.league_phase_teams (
    phase_id uuid NOT NULL,
    team_id uuid NOT NULL,
    seed_position integer NOT NULL,
    tie_break_order integer NOT NULL,
    source_phase_position integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT league_phase_teams_pkey PRIMARY KEY (phase_id, team_id),
    CONSTRAINT league_phase_teams_phase_id_fkey
        FOREIGN KEY (phase_id) REFERENCES public.league_phases(id) ON DELETE CASCADE,
    CONSTRAINT league_phase_teams_team_id_fkey
        FOREIGN KEY (team_id) REFERENCES public.league_teams(id) ON DELETE RESTRICT,
    CONSTRAINT league_phase_teams_phase_seed_key UNIQUE (phase_id, seed_position),
    CONSTRAINT league_phase_teams_phase_tie_break_key UNIQUE (phase_id, tie_break_order),
    CONSTRAINT league_phase_teams_seed_position_check CHECK (seed_position > 0),
    CONSTRAINT league_phase_teams_tie_break_order_check CHECK (tie_break_order > 0),
    CONSTRAINT league_phase_teams_source_position_check CHECK (
        source_phase_position IS NULL OR source_phase_position > 0
    )
);

CREATE INDEX league_phase_teams_team_idx ON public.league_phase_teams (team_id);

CREATE TABLE public.league_venues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT league_venues_pkey PRIMARY KEY (id),
    CONSTRAINT league_venues_code_key UNIQUE (code),
    CONSTRAINT league_venues_name_key UNIQUE (name),
    CONSTRAINT league_venues_code_check CHECK (code ~ '^[A-Z0-9_]+$'::text),
    CONSTRAINT league_venues_name_check CHECK (btrim(name) <> ''::text)
);

CREATE TABLE public.league_venue_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    venue_id uuid NOT NULL,
    weekday smallint DEFAULT 1 NOT NULL,
    local_time time without time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT league_venue_slots_pkey PRIMARY KEY (id),
    CONSTRAINT league_venue_slots_venue_id_fkey
        FOREIGN KEY (venue_id) REFERENCES public.league_venues(id) ON DELETE CASCADE,
    CONSTRAINT league_venue_slots_venue_weekday_time_key
        UNIQUE (venue_id, weekday, local_time),
    CONSTRAINT league_venue_slots_monday_check CHECK (weekday = 1)
);

CREATE INDEX league_venue_slots_active_idx
    ON public.league_venue_slots (is_active, venue_id, local_time);

CREATE TABLE public.league_rounds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phase_id uuid NOT NULL,
    round_number integer NOT NULL,
    play_date date,
    status text DEFAULT 'generated'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT league_rounds_pkey PRIMARY KEY (id),
    CONSTRAINT league_rounds_phase_id_fkey
        FOREIGN KEY (phase_id) REFERENCES public.league_phases(id) ON DELETE CASCADE,
    CONSTRAINT league_rounds_phase_round_key UNIQUE (phase_id, round_number),
    CONSTRAINT league_rounds_id_phase_key UNIQUE (id, phase_id),
    CONSTRAINT league_rounds_number_check CHECK (round_number > 0),
    CONSTRAINT league_rounds_status_check CHECK (status = ANY (ARRAY[
        'generated'::text, 'scheduling'::text, 'scheduled'::text, 'completed'::text
    ])),
    CONSTRAINT league_rounds_monday_check CHECK (
        play_date IS NULL OR extract(isodow FROM play_date) = 1
    )
);

CREATE UNIQUE INDEX league_rounds_phase_play_date_key
    ON public.league_rounds (phase_id, play_date)
    WHERE play_date IS NOT NULL;

CREATE TABLE public.league_matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phase_id uuid NOT NULL,
    round_id uuid NOT NULL,
    home_team_id uuid NOT NULL,
    away_team_id uuid NOT NULL,
    venue_id uuid,
    scheduled_at timestamp with time zone,
    schedule_version integer DEFAULT 1 NOT NULL,
    match_status text DEFAULT 'unscheduled'::text NOT NULL,
    current_result_id uuid,
    lineups_reopened_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT league_matches_pkey PRIMARY KEY (id),
    CONSTRAINT league_matches_round_phase_fkey
        FOREIGN KEY (round_id, phase_id)
        REFERENCES public.league_rounds(id, phase_id) ON DELETE CASCADE,
    CONSTRAINT league_matches_home_phase_team_fkey
        FOREIGN KEY (phase_id, home_team_id)
        REFERENCES public.league_phase_teams(phase_id, team_id) ON DELETE RESTRICT,
    CONSTRAINT league_matches_away_phase_team_fkey
        FOREIGN KEY (phase_id, away_team_id)
        REFERENCES public.league_phase_teams(phase_id, team_id) ON DELETE RESTRICT,
    CONSTRAINT league_matches_venue_id_fkey
        FOREIGN KEY (venue_id) REFERENCES public.league_venues(id) ON DELETE RESTRICT,
    CONSTRAINT league_matches_teams_differ_check CHECK (home_team_id <> away_team_id),
    CONSTRAINT league_matches_schedule_shape_check CHECK (
        (venue_id IS NULL AND scheduled_at IS NULL)
        OR (venue_id IS NOT NULL AND scheduled_at IS NOT NULL)
    ),
    CONSTRAINT league_matches_schedule_version_check CHECK (schedule_version > 0),
    CONSTRAINT league_matches_status_check CHECK (match_status = ANY (ARRAY[
        'unscheduled'::text, 'scheduled'::text, 'submitted'::text,
        'contested'::text, 'confirmed'::text, 'postponed'::text,
        'cancelled'::text, 'suspended'::text
    ])),
    CONSTRAINT league_matches_id_round_key UNIQUE (id, round_id)
);

CREATE UNIQUE INDEX league_matches_unordered_pair_key
    ON public.league_matches (
        phase_id,
        least(home_team_id, away_team_id),
        greatest(home_team_id, away_team_id)
    );
CREATE UNIQUE INDEX league_matches_venue_scheduled_key
    ON public.league_matches (venue_id, scheduled_at)
    WHERE venue_id IS NOT NULL AND scheduled_at IS NOT NULL;
CREATE INDEX league_matches_round_idx ON public.league_matches (round_id);
CREATE INDEX league_matches_home_team_idx ON public.league_matches (home_team_id);
CREATE INDEX league_matches_away_team_idx ON public.league_matches (away_team_id);
CREATE INDEX league_matches_scheduled_idx ON public.league_matches (scheduled_at)
    WHERE scheduled_at IS NOT NULL;
CREATE INDEX league_matches_status_idx ON public.league_matches (match_status);

CREATE TABLE public.league_match_team_slots (
    match_id uuid NOT NULL,
    round_id uuid NOT NULL,
    team_id uuid NOT NULL,
    side text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT league_match_team_slots_pkey PRIMARY KEY (match_id, team_id),
    CONSTRAINT league_match_team_slots_match_round_fkey
        FOREIGN KEY (match_id, round_id)
        REFERENCES public.league_matches(id, round_id) ON DELETE CASCADE,
    CONSTRAINT league_match_team_slots_round_team_key UNIQUE (round_id, team_id),
    CONSTRAINT league_match_team_slots_match_side_key UNIQUE (match_id, side),
    CONSTRAINT league_match_team_slots_side_check CHECK (side = ANY (ARRAY['home'::text, 'away'::text]))
);

CREATE TABLE public.league_audit_events (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    season_id uuid,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    event_type text NOT NULL,
    actor_type text NOT NULL,
    actor_user_id uuid,
    actor_staff_id uuid,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    request_id uuid,
    before_data jsonb,
    after_data jsonb,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT league_audit_events_pkey PRIMARY KEY (id),
    CONSTRAINT league_audit_events_season_id_fkey
        FOREIGN KEY (season_id) REFERENCES public.league_seasons(id) ON DELETE SET NULL,
    CONSTRAINT league_audit_events_actor_user_id_fkey
        FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
    CONSTRAINT league_audit_events_actor_staff_id_fkey
        FOREIGN KEY (actor_staff_id) REFERENCES public.staff_users(id) ON DELETE RESTRICT,
    CONSTRAINT league_audit_events_entity_type_check CHECK (btrim(entity_type) <> ''::text),
    CONSTRAINT league_audit_events_event_type_check CHECK (btrim(event_type) <> ''::text),
    CONSTRAINT league_audit_events_actor_type_check CHECK (actor_type = ANY (ARRAY[
        'user'::text, 'staff'::text, 'system'::text
    ])),
    CONSTRAINT league_audit_events_actor_shape_check CHECK (
        (actor_type = 'user'::text AND actor_user_id IS NOT NULL AND actor_staff_id IS NULL)
        OR (actor_type = 'staff'::text AND actor_user_id IS NULL AND actor_staff_id IS NOT NULL)
        OR (actor_type = 'system'::text AND actor_user_id IS NULL AND actor_staff_id IS NULL)
    ),
    CONSTRAINT league_audit_events_before_data_check CHECK (
        before_data IS NULL OR jsonb_typeof(before_data) = 'object'::text
    ),
    CONSTRAINT league_audit_events_after_data_check CHECK (
        after_data IS NULL OR jsonb_typeof(after_data) = 'object'::text
    ),
    CONSTRAINT league_audit_events_metadata_check CHECK (jsonb_typeof(metadata) = 'object'::text)
);

CREATE INDEX league_audit_events_entity_idx
    ON public.league_audit_events (entity_type, entity_id, occurred_at DESC);
CREATE INDEX league_audit_events_season_idx
    ON public.league_audit_events (season_id, occurred_at DESC);
CREATE INDEX league_audit_events_request_idx
    ON public.league_audit_events (request_id)
    WHERE request_id IS NOT NULL;

CREATE TABLE public.league_generation_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phase_id uuid NOT NULL,
    generation_kind text NOT NULL,
    input_team_order jsonb NOT NULL,
    algorithm_version text NOT NULL,
    fingerprint text NOT NULL,
    quality_metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    generated_by_staff_id uuid NOT NULL,
    completed_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT league_generation_runs_pkey PRIMARY KEY (id),
    CONSTRAINT league_generation_runs_phase_id_fkey
        FOREIGN KEY (phase_id) REFERENCES public.league_phases(id) ON DELETE CASCADE,
    CONSTRAINT league_generation_runs_staff_id_fkey
        FOREIGN KEY (generated_by_staff_id) REFERENCES public.staff_users(id) ON DELETE RESTRICT,
    CONSTRAINT league_generation_runs_phase_kind_key UNIQUE (phase_id, generation_kind),
    CONSTRAINT league_generation_runs_kind_check CHECK (generation_kind = ANY (ARRAY[
        'phase_schedule'::text, 'phase2_split'::text
    ])),
    CONSTRAINT league_generation_runs_input_check CHECK (
        jsonb_typeof(input_team_order) = 'array'::text
    ),
    CONSTRAINT league_generation_runs_algorithm_check CHECK (btrim(algorithm_version) <> ''::text),
    CONSTRAINT league_generation_runs_fingerprint_check CHECK (fingerprint ~ '^[0-9a-f]{64}$'::text),
    CONSTRAINT league_generation_runs_quality_check CHECK (
        jsonb_typeof(quality_metrics) = 'object'::text
    ),
    CONSTRAINT league_generation_runs_completion_check CHECK (completed_at >= created_at)
);

CREATE INDEX league_generation_runs_completed_idx
    ON public.league_generation_runs (completed_at DESC);

CREATE FUNCTION public.league_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO pg_catalog, public
AS $function$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$function$;

CREATE FUNCTION public.league_validate_team_roster() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO pg_catalog, public
AS $function$
DECLARE
    v_team_id uuid;
    v_season_id uuid;
    v_active_count integer;
    v_captain_user_id uuid;
    v_duplicate_captain_count integer;
BEGIN
    IF TG_TABLE_NAME = 'league_teams' THEN
        v_team_id := COALESCE(NEW.id, OLD.id);
    ELSE
        v_team_id := COALESCE(NEW.team_id, OLD.team_id);
    END IF;

    SELECT t.season_id,
           count(p.id) FILTER (WHERE p.is_active),
           cp.user_id
      INTO v_season_id, v_active_count, v_captain_user_id
      FROM public.league_teams t
      LEFT JOIN public.league_team_players p ON p.team_id = t.id
      LEFT JOIN public.league_team_players cp
        ON cp.team_id = t.id AND cp.id = t.captain_player_id AND cp.is_active
     WHERE t.id = v_team_id
     GROUP BY t.season_id, cp.user_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF v_active_count < 1 OR v_active_count > 4 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEAGUE_ROSTER_ACTIVE_COUNT_INVALID';
    END IF;

    IF v_captain_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEAGUE_CAPTAIN_MUST_BE_ACTIVE_LINKED_USER';
    END IF;

    SELECT count(*)
      INTO v_duplicate_captain_count
      FROM public.league_teams t
      JOIN public.league_team_players p
        ON p.team_id = t.id AND p.id = t.captain_player_id AND p.is_active
     WHERE t.season_id = v_season_id
       AND t.is_active
       AND p.user_id = v_captain_user_id;

    IF v_duplicate_captain_count > 1 THEN
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'LEAGUE_CAPTAIN_ALREADY_ASSIGNED_IN_SEASON';
    END IF;

    RETURN NULL;
END;
$function$;

CREATE CONSTRAINT TRIGGER league_teams_roster_guard
    AFTER INSERT OR UPDATE ON public.league_teams
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.league_validate_team_roster();

CREATE CONSTRAINT TRIGGER league_team_players_roster_guard
    AFTER INSERT OR UPDATE OR DELETE ON public.league_team_players
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.league_validate_team_roster();

CREATE FUNCTION public.league_validate_phase_source() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO pg_catalog, public
AS $function$
DECLARE
    v_source_code text;
BEGIN
    IF NEW.code = 'phase1'::text THEN
        RETURN NULL;
    END IF;

    SELECT code INTO v_source_code
      FROM public.league_phases
     WHERE id = NEW.source_phase_id
       AND season_id = NEW.season_id;

    IF v_source_code IS DISTINCT FROM 'phase1'::text THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEAGUE_PHASE2_SOURCE_MUST_BE_PHASE1';
    END IF;

    RETURN NULL;
END;
$function$;

CREATE CONSTRAINT TRIGGER league_phases_source_guard
    AFTER INSERT OR UPDATE OF season_id, code, source_phase_id ON public.league_phases
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.league_validate_phase_source();

CREATE FUNCTION public.league_validate_phase_team() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO pg_catalog, public
AS $function$
DECLARE
    v_phase_season_id uuid;
    v_team_season_id uuid;
BEGIN
    SELECT season_id INTO v_phase_season_id FROM public.league_phases WHERE id = NEW.phase_id;
    SELECT season_id INTO v_team_season_id FROM public.league_teams WHERE id = NEW.team_id;

    IF v_phase_season_id IS DISTINCT FROM v_team_season_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEAGUE_PHASE_TEAM_SEASON_MISMATCH';
    END IF;

    RETURN NULL;
END;
$function$;

CREATE CONSTRAINT TRIGGER league_phase_teams_season_guard
    AFTER INSERT OR UPDATE OF phase_id, team_id ON public.league_phase_teams
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.league_validate_phase_team();

CREATE FUNCTION public.league_validate_match_team_slots() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO pg_catalog, public
AS $function$
DECLARE
    v_match_id uuid;
    v_home_team_id uuid;
    v_away_team_id uuid;
    v_round_id uuid;
    v_valid_count integer;
BEGIN
    IF TG_TABLE_NAME = 'league_matches' THEN
        v_match_id := COALESCE(NEW.id, OLD.id);
    ELSE
        v_match_id := COALESCE(NEW.match_id, OLD.match_id);
    END IF;

    SELECT home_team_id, away_team_id, round_id
      INTO v_home_team_id, v_away_team_id, v_round_id
      FROM public.league_matches
     WHERE id = v_match_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT count(*) INTO v_valid_count
      FROM public.league_match_team_slots s
     WHERE s.match_id = v_match_id
       AND s.round_id = v_round_id
       AND (
           (s.side = 'home'::text AND s.team_id = v_home_team_id)
           OR (s.side = 'away'::text AND s.team_id = v_away_team_id)
       );

    IF v_valid_count <> 2
       OR (SELECT count(*) FROM public.league_match_team_slots WHERE match_id = v_match_id) <> 2 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEAGUE_MATCH_TEAM_SLOTS_INVALID';
    END IF;

    RETURN NULL;
END;
$function$;

CREATE CONSTRAINT TRIGGER league_matches_team_slots_guard
    AFTER INSERT OR UPDATE OF round_id, home_team_id, away_team_id ON public.league_matches
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.league_validate_match_team_slots();

CREATE CONSTRAINT TRIGGER league_match_team_slots_guard
    AFTER INSERT OR UPDATE OR DELETE ON public.league_match_team_slots
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.league_validate_match_team_slots();

CREATE TRIGGER league_seasons_set_updated_at BEFORE UPDATE ON public.league_seasons
    FOR EACH ROW EXECUTE FUNCTION public.league_set_updated_at();
CREATE TRIGGER league_teams_set_updated_at BEFORE UPDATE ON public.league_teams
    FOR EACH ROW EXECUTE FUNCTION public.league_set_updated_at();
CREATE TRIGGER league_team_players_set_updated_at BEFORE UPDATE ON public.league_team_players
    FOR EACH ROW EXECUTE FUNCTION public.league_set_updated_at();
CREATE TRIGGER league_phases_set_updated_at BEFORE UPDATE ON public.league_phases
    FOR EACH ROW EXECUTE FUNCTION public.league_set_updated_at();
CREATE TRIGGER league_phase_teams_set_updated_at BEFORE UPDATE ON public.league_phase_teams
    FOR EACH ROW EXECUTE FUNCTION public.league_set_updated_at();
CREATE TRIGGER league_venues_set_updated_at BEFORE UPDATE ON public.league_venues
    FOR EACH ROW EXECUTE FUNCTION public.league_set_updated_at();
CREATE TRIGGER league_venue_slots_set_updated_at BEFORE UPDATE ON public.league_venue_slots
    FOR EACH ROW EXECUTE FUNCTION public.league_set_updated_at();
CREATE TRIGGER league_rounds_set_updated_at BEFORE UPDATE ON public.league_rounds
    FOR EACH ROW EXECUTE FUNCTION public.league_set_updated_at();
CREATE TRIGGER league_matches_set_updated_at BEFORE UPDATE ON public.league_matches
    FOR EACH ROW EXECUTE FUNCTION public.league_set_updated_at();
CREATE TRIGGER league_match_team_slots_set_updated_at BEFORE UPDATE ON public.league_match_team_slots
    FOR EACH ROW EXECUTE FUNCTION public.league_set_updated_at();
CREATE TRIGGER league_generation_runs_set_updated_at BEFORE UPDATE ON public.league_generation_runs
    FOR EACH ROW EXECUTE FUNCTION public.league_set_updated_at();

INSERT INTO public.league_venues (id, code, name, is_active)
VALUES
    ('11000000-0000-4000-8000-000000000001', 'COSTIGLIOLE', 'Costigliole', true),
    ('11000000-0000-4000-8000-000000000002', 'MANTA', 'Manta', true),
    ('11000000-0000-4000-8000-000000000003', 'CENTALLO', 'Centallo', true)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    is_active = EXCLUDED.is_active,
    updated_at = now();

INSERT INTO public.league_venue_slots (id, venue_id, weekday, local_time, is_active)
VALUES
    ('12000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 1, '20:00', true),
    ('12000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001', 1, '21:30', true),
    ('12000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000002', 1, '20:00', true),
    ('12000000-0000-4000-8000-000000000004', '11000000-0000-4000-8000-000000000002', 1, '21:30', true),
    ('12000000-0000-4000-8000-000000000005', '11000000-0000-4000-8000-000000000003', 1, '19:30', true),
    ('12000000-0000-4000-8000-000000000006', '11000000-0000-4000-8000-000000000003', 1, '20:00', true),
    ('12000000-0000-4000-8000-000000000007', '11000000-0000-4000-8000-000000000003', 1, '21:00', true),
    ('12000000-0000-4000-8000-000000000008', '11000000-0000-4000-8000-000000000003', 1, '21:30', true)
ON CONFLICT (venue_id, weekday, local_time) DO UPDATE
SET is_active = EXCLUDED.is_active,
    updated_at = now();

DO $security$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'league_seasons', 'league_teams', 'league_team_players',
        'league_phases', 'league_phase_teams', 'league_venues',
        'league_venue_slots', 'league_rounds', 'league_matches',
        'league_match_team_slots', 'league_audit_events', 'league_generation_runs'
    ]
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', v_table);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', v_table);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', v_table);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM service_role', v_table);
    END LOOP;
END;
$security$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.league_seasons,
    public.league_teams,
    public.league_team_players,
    public.league_phases,
    public.league_phase_teams,
    public.league_venues,
    public.league_venue_slots,
    public.league_rounds,
    public.league_matches,
    public.league_match_team_slots,
    public.league_generation_runs
TO service_role;

GRANT SELECT, INSERT ON TABLE public.league_audit_events TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.league_audit_events FROM service_role;

REVOKE ALL ON SEQUENCE public.league_audit_events_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.league_audit_events_id_seq TO service_role;

REVOKE ALL ON FUNCTION public.league_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.league_validate_team_roster() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.league_validate_phase_source() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.league_validate_phase_team() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.league_validate_match_team_slots() FROM PUBLIC, anon, authenticated;
