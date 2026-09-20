-- Monday League Stage 5: captain profile/roster commands, versioned lineups,
-- independent publication/lifecycle controls, and deletion-cleanup tracking.

ALTER TABLE public.league_seasons
    ADD COLUMN public_visibility text NOT NULL DEFAULT 'hidden',
    ADD CONSTRAINT league_seasons_public_visibility_check
        CHECK (public_visibility IN ('hidden', 'public'));

CREATE INDEX league_seasons_public_visibility_idx
    ON public.league_seasons (public_visibility, published_at DESC);

ALTER TABLE public.league_matches
    ADD COLUMN lineups_locked_at timestamptz;

CREATE TABLE public.league_lineups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id uuid NOT NULL REFERENCES public.league_matches(id) ON DELETE CASCADE,
    team_id uuid NOT NULL REFERENCES public.league_teams(id) ON DELETE RESTRICT,
    revision integer NOT NULL CHECK (revision > 0),
    status text NOT NULL DEFAULT 'current' CHECK (status IN ('current', 'superseded')),
    submitted_by_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
    overridden_by_staff_id uuid REFERENCES public.staff_users(id) ON DELETE RESTRICT,
    submitted_at timestamptz NOT NULL DEFAULT now(),
    superseded_at timestamptz,
    override_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT league_lineups_actor_check CHECK (
        (submitted_by_user_id IS NOT NULL AND overridden_by_staff_id IS NULL)
        OR (submitted_by_user_id IS NULL AND overridden_by_staff_id IS NOT NULL)
    ),
    CONSTRAINT league_lineups_status_time_check CHECK (
        (status = 'current' AND superseded_at IS NULL)
        OR (status = 'superseded' AND superseded_at IS NOT NULL)
    ),
    CONSTRAINT league_lineups_match_team_revision_key UNIQUE (match_id, team_id, revision),
    CONSTRAINT league_lineups_id_team_key UNIQUE (id, team_id)
);

CREATE UNIQUE INDEX league_lineups_one_current_key
    ON public.league_lineups (match_id, team_id) WHERE status = 'current';
CREATE INDEX league_lineups_match_idx ON public.league_lineups (match_id, status);

CREATE TABLE public.league_lineup_players (
    lineup_id uuid NOT NULL,
    team_id uuid NOT NULL,
    player_id uuid NOT NULL,
    slot smallint NOT NULL CHECK (slot IN (1, 2)),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (lineup_id, player_id),
    UNIQUE (lineup_id, slot),
    FOREIGN KEY (lineup_id, team_id)
        REFERENCES public.league_lineups(id, team_id) ON DELETE CASCADE,
    FOREIGN KEY (team_id, player_id)
        REFERENCES public.league_team_players(team_id, id) ON DELETE RESTRICT
);

-- This record deliberately survives deletion of the season. It is the durable
-- hand-off between the transactional database deletion and best-effort storage cleanup.
CREATE TABLE public.league_season_deletion_log (
    request_id uuid PRIMARY KEY,
    season_id uuid NOT NULL,
    season_name text NOT NULL,
    requested_by_staff_id uuid NOT NULL REFERENCES public.staff_users(id) ON DELETE RESTRICT,
    media_paths jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(media_paths) = 'array'),
    database_deleted_at timestamptz NOT NULL,
    storage_cleanup_status text NOT NULL DEFAULT 'pending'
        CHECK (storage_cleanup_status IN ('pending', 'complete', 'partial', 'failed')),
    storage_cleanup_error text,
    storage_cleaned_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.league_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_lineup_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_season_deletion_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.league_lineups, public.league_lineup_players,
    public.league_season_deletion_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_lineups,
    public.league_lineup_players, public.league_season_deletion_log TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'monday-league-media', 'monday-league-media', true, 5242880,
    ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.league_is_captain(p_user_id uuid, p_team_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.league_teams t
        JOIN public.league_team_players p
          ON p.team_id = t.id AND p.id = t.captain_player_id
        WHERE t.id = p_team_id AND p.user_id = p_user_id AND p.is_active
    );
$$;

CREATE OR REPLACE FUNCTION public.league_update_team_profile(
    p_actor_user_id uuid, p_actor_staff_id uuid, p_team_id uuid,
    p_slogan text, p_logo_path text, p_image_path text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, public AS $$
DECLARE v_team public.league_teams%ROWTYPE; v_before jsonb; v_prefix text;
BEGIN
    SELECT * INTO v_team FROM public.league_teams WHERE id = p_team_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ML_TEAM_NOT_FOUND'; END IF;
    IF p_actor_staff_id IS NOT NULL THEN
        PERFORM public.league_assert_admin(p_actor_staff_id);
    ELSIF p_actor_user_id IS NULL OR NOT public.league_is_captain(p_actor_user_id, p_team_id) THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ML_CAPTAIN_REQUIRED';
    END IF;
    v_prefix := 'monday-league/' || v_team.season_id || '/' || p_team_id || '/';
    IF p_logo_path IS NOT NULL AND p_logo_path NOT LIKE v_prefix || 'logo/%' THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ML_MEDIA_PATH_INVALID';
    END IF;
    IF p_image_path IS NOT NULL AND p_image_path NOT LIKE v_prefix || 'hero/%' THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ML_MEDIA_PATH_INVALID';
    END IF;
    v_before := jsonb_build_object('slogan',v_team.slogan,'logo_path',v_team.logo_path,'image_path',v_team.image_path);
    UPDATE public.league_teams SET slogan=nullif(btrim(coalesce(p_slogan,'')),''),
      logo_path=p_logo_path,image_path=p_image_path,updated_at=now() WHERE id=p_team_id;
    INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,
      actor_user_id,actor_staff_id,before_data,after_data)
    VALUES(v_team.season_id,'team',p_team_id,'team_profile_updated',
      CASE WHEN p_actor_staff_id IS NULL THEN 'user' ELSE 'staff' END,
      p_actor_user_id,p_actor_staff_id,v_before,
      jsonb_build_object('slogan',nullif(btrim(coalesce(p_slogan,'')),''),'logo_path',p_logo_path,'image_path',p_image_path));
    RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('team_id',p_team_id));
END; $$;

CREATE OR REPLACE FUNCTION public.league_captain_replace_roster_preseason(
    p_actor_user_id uuid, p_team_id uuid, p_roster jsonb
) RETURNS jsonb LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, public AS $$
DECLARE v_team record; v_item jsonb; v_id uuid; v_name text; v_count integer; v_before jsonb;
BEGIN
    SELECT t.*,s.status season_status INTO v_team FROM public.league_teams t
      JOIN public.league_seasons s ON s.id=t.season_id WHERE t.id=p_team_id FOR UPDATE OF t,s;
    IF NOT FOUND OR NOT public.league_is_captain(p_actor_user_id,p_team_id) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ML_CAPTAIN_REQUIRED'; END IF;
    IF v_team.season_status <> 'draft' OR EXISTS(
      SELECT 1 FROM public.league_phases WHERE season_id=v_team.season_id AND code='phase1' AND status<>'draft'
    ) THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ML_ROSTER_LOCKED'; END IF;
    IF jsonb_typeof(p_roster)<>'array' OR jsonb_array_length(p_roster)<1 OR jsonb_array_length(p_roster)>4 THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ML_ROSTER_SIZE_INVALID'; END IF;
    SELECT count(*) INTO v_count FROM jsonb_array_elements(p_roster) x
      WHERE nullif(x->>'player_id','')::uuid=v_team.captain_player_id;
    IF v_count<>1 THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ML_CAPTAIN_MUST_REMAIN'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'display_name',display_name,'is_active',is_active)),'[]')
      INTO v_before FROM public.league_team_players WHERE team_id=p_team_id;
    UPDATE public.league_team_players SET is_active=false,left_at=coalesce(left_at,now()),updated_at=now()
      WHERE team_id=p_team_id AND is_active;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_roster) LOOP
      v_id:=nullif(v_item->>'player_id','')::uuid; v_name:=btrim(coalesce(v_item->>'display_name',''));
      IF v_name='' THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ML_PLAYER_NAME_REQUIRED'; END IF;
      IF v_id IS NULL THEN
        INSERT INTO public.league_team_players(team_id,display_name) VALUES(p_team_id,v_name);
      ELSE
        UPDATE public.league_team_players SET display_name=v_name,is_active=true,left_at=NULL,updated_at=now()
          WHERE id=v_id AND team_id=p_team_id;
        IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ML_PLAYER_NOT_IN_TEAM'; END IF;
      END IF;
    END LOOP;
    INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_user_id,before_data,after_data)
      VALUES(v_team.season_id,'team',p_team_id,'captain_roster_replaced','user',p_actor_user_id,
        jsonb_build_object('roster',v_before),jsonb_build_object('roster',p_roster));
    RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('team_id',p_team_id));
END; $$;

CREATE OR REPLACE FUNCTION public.league_admin_replace_roster(
    p_actor_id uuid, p_team_id uuid, p_name text, p_slug text,
    p_captain_user_id uuid, p_roster jsonb
) RETURNS jsonb LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, public AS $$
DECLARE v_team record; v_item jsonb; v_id uuid; v_uid uuid; v_name text; v_captain_id uuid; v_before jsonb;
BEGIN
    PERFORM public.league_assert_admin(p_actor_id);
    SELECT * INTO v_team FROM public.league_teams WHERE id=p_team_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ML_TEAM_NOT_FOUND'; END IF;
    IF jsonb_typeof(p_roster)<>'array' OR jsonb_array_length(p_roster)<1 OR jsonb_array_length(p_roster)>4 THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ML_ROSTER_SIZE_INVALID'; END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(p_roster) x WHERE nullif(x->>'user_id','')::uuid=p_captain_user_id)<>1 THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ML_CAPTAIN_MUST_BE_LINKED_ROSTER_USER'; END IF;
    SELECT to_jsonb(t) INTO v_before FROM public.league_teams t WHERE id=p_team_id;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_roster) LOOP
      IF nullif(v_item->>'user_id','')::uuid=p_captain_user_id THEN
        v_captain_id:=nullif(v_item->>'player_id','')::uuid;
        IF v_captain_id IS NULL THEN SELECT id INTO v_captain_id FROM public.league_team_players WHERE team_id=p_team_id AND user_id=p_captain_user_id; END IF;
        v_captain_id:=coalesce(v_captain_id,gen_random_uuid());
      END IF;
    END LOOP;
    UPDATE public.league_team_players SET is_active=false,left_at=coalesce(left_at,now()),updated_at=now()
      WHERE team_id=p_team_id AND is_active;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_roster) LOOP
      v_id:=nullif(v_item->>'player_id','')::uuid; v_uid:=nullif(v_item->>'user_id','')::uuid;
      v_name:=btrim(coalesce(v_item->>'display_name',''));
      IF v_name='' OR (v_uid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=v_uid)) THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ML_INVALID_PLAYER'; END IF;
      IF v_uid=p_captain_user_id THEN v_id:=v_captain_id; END IF;
      IF v_id IS NULL THEN v_id:=gen_random_uuid(); END IF;
      INSERT INTO public.league_team_players(id,team_id,display_name,user_id,is_active)
        VALUES(v_id,p_team_id,v_name,v_uid,true)
      ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,
        user_id=coalesce(public.league_team_players.user_id,excluded.user_id),is_active=true,left_at=NULL,updated_at=now()
      WHERE public.league_team_players.team_id=p_team_id;
    END LOOP;
    UPDATE public.league_teams SET name=btrim(p_name),slug=lower(btrim(p_slug)),captain_player_id=v_captain_id,updated_at=now()
      WHERE id=p_team_id;
    INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,before_data,after_data)
      VALUES(v_team.season_id,'team',p_team_id,'admin_roster_override','staff',p_actor_id,v_before,
        jsonb_build_object('name',btrim(p_name),'slug',lower(btrim(p_slug)),'roster',p_roster));
    RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('team_id',p_team_id));
END; $$;

CREATE OR REPLACE FUNCTION public.league_write_lineup(
    p_actor_user_id uuid, p_actor_staff_id uuid, p_match_id uuid,
    p_team_id uuid, p_player_ids uuid[], p_override_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, public AS $$
DECLARE v_match record; v_old uuid; v_revision integer; v_new uuid:=gen_random_uuid(); v_season uuid;
BEGIN
    SELECT m.*,p.season_id INTO v_match FROM public.league_matches m
      JOIN public.league_phases p ON p.id=m.phase_id WHERE m.id=p_match_id FOR UPDATE OF m;
    IF NOT FOUND OR p_team_id NOT IN (v_match.home_team_id,v_match.away_team_id) THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ML_MATCH_TEAM_INVALID'; END IF;
    v_season:=v_match.season_id;
    IF p_actor_staff_id IS NOT NULL THEN
      PERFORM public.league_assert_admin(p_actor_staff_id);
      IF now() >= v_match.scheduled_at - interval '1 hour' AND btrim(coalesce(p_override_reason,''))='' THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ML_OVERRIDE_REASON_REQUIRED'; END IF;
    ELSE
      IF NOT public.league_is_captain(p_actor_user_id,p_team_id) THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ML_CAPTAIN_REQUIRED'; END IF;
      IF v_match.scheduled_at IS NULL OR v_match.lineups_locked_at IS NOT NULL
         OR now() >= v_match.scheduled_at - interval '1 hour' THEN
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ML_LINEUP_LOCKED'; END IF;
    END IF;
    IF coalesce(array_length(p_player_ids,1),0)<>2 OR p_player_ids[1]=p_player_ids[2] THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ML_LINEUP_EXACTLY_TWO'; END IF;
    IF (SELECT count(*) FROM public.league_team_players
        WHERE team_id=p_team_id AND id=ANY(p_player_ids) AND is_active)<>2 THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='ML_LINEUP_ACTIVE_ROSTER_ONLY'; END IF;
    SELECT id INTO v_old FROM public.league_lineups WHERE match_id=p_match_id AND team_id=p_team_id AND status='current' FOR UPDATE;
    SELECT coalesce(max(revision),0)+1 INTO v_revision FROM public.league_lineups WHERE match_id=p_match_id AND team_id=p_team_id;
    IF v_old IS NOT NULL THEN
      UPDATE public.league_lineups SET status='superseded',superseded_at=now() WHERE id=v_old;
    END IF;
    INSERT INTO public.league_lineups(id,match_id,team_id,revision,submitted_by_user_id,overridden_by_staff_id,override_reason)
      VALUES(v_new,p_match_id,p_team_id,v_revision,p_actor_user_id,p_actor_staff_id,nullif(btrim(coalesce(p_override_reason,'')),''));
    INSERT INTO public.league_lineup_players(lineup_id,team_id,player_id,slot)
      VALUES(v_new,p_team_id,p_player_ids[1],1),(v_new,p_team_id,p_player_ids[2],2);
    INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_user_id,actor_staff_id,after_data,reason)
      VALUES(v_season,'lineup',v_new,CASE WHEN p_actor_staff_id IS NULL THEN 'lineup_submitted' ELSE 'lineup_admin_override' END,
       CASE WHEN p_actor_staff_id IS NULL THEN 'user' ELSE 'staff' END,p_actor_user_id,p_actor_staff_id,
       jsonb_build_object('match_id',p_match_id,'team_id',p_team_id,'revision',v_revision),nullif(btrim(coalesce(p_override_reason,'')),''));
    RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('lineup_id',v_new,'revision',v_revision));
END; $$;

CREATE OR REPLACE FUNCTION public.league_preserve_revealed_lineups_on_reschedule()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at
     AND OLD.scheduled_at IS NOT NULL
     AND (OLD.lineups_locked_at IS NOT NULL OR now() >= OLD.scheduled_at-interval '1 hour') THEN
    NEW.lineups_locked_at:=coalesce(OLD.lineups_locked_at,now());
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER league_matches_preserve_lineup_lock
  BEFORE UPDATE OF scheduled_at ON public.league_matches
  FOR EACH ROW EXECUTE FUNCTION public.league_preserve_revealed_lineups_on_reschedule();

CREATE OR REPLACE FUNCTION public.league_reopen_lineups(
    p_actor_id uuid,p_match_id uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE v_match record;
BEGIN
  PERFORM public.league_assert_admin(p_actor_id);
  IF btrim(coalesce(p_reason,''))='' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_REOPEN_REASON_REQUIRED'; END IF;
  SELECT m.*,p.season_id INTO v_match FROM public.league_matches m JOIN public.league_phases p ON p.id=m.phase_id
    WHERE m.id=p_match_id FOR UPDATE OF m;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_MATCH_NOT_FOUND'; END IF;
  IF v_match.scheduled_at IS NULL OR now()>=v_match.scheduled_at-interval '1 hour' THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_NEW_DEADLINE_NOT_FUTURE'; END IF;
  UPDATE public.league_matches SET lineups_locked_at=NULL,lineups_reopened_at=now(),updated_at=now() WHERE id=p_match_id;
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,reason,after_data)
    VALUES(v_match.season_id,'match',p_match_id,'lineups_reopened','staff',p_actor_id,btrim(p_reason),jsonb_build_object('both_teams',true));
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('match_id',p_match_id,'both_teams',true));
END; $$;

CREATE OR REPLACE FUNCTION public.league_set_season_visibility(p_actor_id uuid,p_season_id uuid,p_visibility text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE v_before text;
BEGIN
  PERFORM public.league_assert_admin(p_actor_id);
  IF p_visibility NOT IN ('hidden','public') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_VISIBILITY_INVALID'; END IF;
  SELECT public_visibility INTO v_before FROM public.league_seasons WHERE id=p_season_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_SEASON_NOT_FOUND'; END IF;
  UPDATE public.league_seasons SET public_visibility=p_visibility,
    published_at=CASE WHEN p_visibility='public' THEN coalesce(published_at,now()) ELSE published_at END,updated_at=now()
    WHERE id=p_season_id;
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,before_data,after_data)
    VALUES(p_season_id,'season',p_season_id,'season_visibility_changed','staff',p_actor_id,
      jsonb_build_object('public_visibility',v_before),jsonb_build_object('public_visibility',p_visibility));
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('season_id',p_season_id,'public_visibility',p_visibility));
END; $$;

CREATE OR REPLACE FUNCTION public.league_archive_season(p_actor_id uuid,p_season_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM public.league_assert_admin(p_actor_id);
  PERFORM 1 FROM public.league_seasons WHERE id=p_season_id AND status='completed' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_ONLY_COMPLETED_ARCHIVABLE'; END IF;
  UPDATE public.league_seasons SET status='archived',updated_at=now() WHERE id=p_season_id;
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,after_data)
    VALUES(p_season_id,'season',p_season_id,'season_archived','staff',p_actor_id,jsonb_build_object('status','archived'));
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('season_id',p_season_id,'status','archived'));
END; $$;

CREATE OR REPLACE FUNCTION public.league_delete_season(
  p_actor_id uuid,p_season_id uuid,p_confirmation text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_season record; v_paths jsonb;
BEGIN
  PERFORM public.league_assert_admin(p_actor_id);
  SELECT * INTO v_season FROM public.league_season_deletion_log WHERE request_id=p_request_id;
  IF FOUND THEN RETURN jsonb_build_object('ok',true,'duplicate',true,'data',jsonb_build_object(
    'season_id',v_season.season_id,'media_paths',v_season.media_paths)); END IF;
  SELECT * INTO v_season FROM public.league_seasons WHERE id=p_season_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_SEASON_NOT_FOUND'; END IF;
  IF v_season.status NOT IN ('completed','archived') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_ACTIVE_SEASON_DELETE_FORBIDDEN'; END IF;
  IF p_confirmation IS DISTINCT FROM v_season.name THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_DELETE_CONFIRMATION_MISMATCH'; END IF;
  SELECT coalesce(jsonb_agg(path),'[]') INTO v_paths FROM (
    SELECT logo_path path FROM public.league_teams WHERE season_id=p_season_id AND logo_path IS NOT NULL
    UNION SELECT image_path FROM public.league_teams WHERE season_id=p_season_id AND image_path IS NOT NULL
  ) q WHERE path LIKE 'monday-league/'||p_season_id||'/%';
  INSERT INTO public.league_season_deletion_log(request_id,season_id,season_name,requested_by_staff_id,media_paths,database_deleted_at)
    VALUES(p_request_id,p_season_id,v_season.name,p_actor_id,v_paths,now());
  UPDATE public.league_matches m SET current_result_id=NULL,current_special_outcome_id=NULL
    WHERE EXISTS(SELECT 1 FROM public.league_phases p WHERE p.id=m.phase_id AND p.season_id=p_season_id);
  DELETE FROM public.league_matches m
    WHERE EXISTS(SELECT 1 FROM public.league_phases p WHERE p.id=m.phase_id AND p.season_id=p_season_id);
  DELETE FROM public.league_phase_teams pt
    WHERE EXISTS(SELECT 1 FROM public.league_phases p WHERE p.id=pt.phase_id AND p.season_id=p_season_id);
  DELETE FROM public.league_teams WHERE season_id=p_season_id;
  DELETE FROM public.league_audit_events WHERE season_id=p_season_id;
  DELETE FROM public.league_seasons WHERE id=p_season_id;
  RETURN jsonb_build_object('ok',true,'duplicate',false,'data',jsonb_build_object('season_id',p_season_id,'media_paths',v_paths));
END; $$;

CREATE OR REPLACE FUNCTION public.league_mark_storage_cleanup(
  p_actor_id uuid,p_request_id uuid,p_status text,p_error text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM public.league_assert_admin(p_actor_id);
  IF p_status NOT IN ('complete','partial','failed') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_CLEANUP_STATUS_INVALID'; END IF;
  UPDATE public.league_season_deletion_log SET storage_cleanup_status=p_status,
    storage_cleanup_error=nullif(p_error,''),storage_cleaned_at=CASE WHEN p_status='complete' THEN now() ELSE NULL END
    WHERE request_id=p_request_id;
END; $$;

CREATE OR REPLACE FUNCTION public.league_get_public_lineups(p_match_ids uuid[])
RETURNS TABLE(match_id uuid, home_lineup jsonb, away_lineup jsonb)
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
  SELECT m.id,
    CASE WHEN m.scheduled_at IS NOT NULL AND
      (m.lineups_locked_at IS NOT NULL OR now()>=m.scheduled_at-interval '1 hour')
    THEN coalesce((
      SELECT jsonb_build_object('state','submitted','players',jsonb_agg(p.display_name ORDER BY lp.slot))
      FROM public.league_lineups l JOIN public.league_lineup_players lp ON lp.lineup_id=l.id
      JOIN public.league_team_players p ON p.id=lp.player_id
      WHERE l.match_id=m.id AND l.team_id=m.home_team_id AND l.status='current'
      HAVING count(*)=2
    ),jsonb_build_object('state','missing','label','Formazione non comunicata')) ELSE NULL END,
    CASE WHEN m.scheduled_at IS NOT NULL AND
      (m.lineups_locked_at IS NOT NULL OR now()>=m.scheduled_at-interval '1 hour')
    THEN coalesce((
      SELECT jsonb_build_object('state','submitted','players',jsonb_agg(p.display_name ORDER BY lp.slot))
      FROM public.league_lineups l JOIN public.league_lineup_players lp ON lp.lineup_id=l.id
      JOIN public.league_team_players p ON p.id=lp.player_id
      WHERE l.match_id=m.id AND l.team_id=m.away_team_id AND l.status='current'
      HAVING count(*)=2
    ),jsonb_build_object('state','missing','label','Formazione non comunicata')) ELSE NULL END
  FROM public.league_matches m WHERE m.id=ANY(p_match_ids);
$$;

CREATE OR REPLACE FUNCTION public.league_get_captain_context(p_user_id uuid,p_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE v_team record; v_match record; v_own jsonb; v_opponent jsonb; v_revealed boolean;
BEGIN
  SELECT t.*,s.status season_status INTO v_team FROM public.league_teams t
    JOIN public.league_seasons s ON s.id=t.season_id WHERE t.id=p_team_id;
  IF NOT FOUND OR NOT public.league_is_captain(p_user_id,p_team_id) THEN RETURN NULL; END IF;
  SELECT m.* INTO v_match FROM public.league_matches m JOIN public.league_phases ph ON ph.id=m.phase_id
    WHERE ph.season_id=v_team.season_id AND p_team_id IN(m.home_team_id,m.away_team_id)
      AND m.match_status NOT IN('confirmed','cancelled')
    ORDER BY m.scheduled_at NULLS LAST,m.created_at LIMIT 1;
  IF FOUND THEN
    SELECT jsonb_build_object('lineupId',l.id,'revision',l.revision,'players',jsonb_agg(
      jsonb_build_object('id',p.id,'displayName',p.display_name) ORDER BY lp.slot)) INTO v_own
    FROM public.league_lineups l JOIN public.league_lineup_players lp ON lp.lineup_id=l.id
      JOIN public.league_team_players p ON p.id=lp.player_id
    WHERE l.match_id=v_match.id AND l.team_id=p_team_id AND l.status='current' GROUP BY l.id,l.revision;
    v_revealed:=v_match.scheduled_at IS NOT NULL AND
      (v_match.lineups_locked_at IS NOT NULL OR now()>=v_match.scheduled_at-interval '1 hour');
    IF v_revealed THEN
      SELECT CASE WHEN x.home_lineup IS NULL THEN x.away_lineup
                  WHEN p_team_id=v_match.home_team_id THEN x.away_lineup ELSE x.home_lineup END
        INTO v_opponent FROM public.league_get_public_lineups(ARRAY[v_match.id]) x;
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'is_captain',true,'can_edit_profile',true,
    'can_edit_roster',v_team.season_status='draft' AND EXISTS(SELECT 1 FROM public.league_phases
      WHERE season_id=v_team.season_id AND code='phase1' AND status='draft'),
    'can_submit_lineup',v_match.id IS NOT NULL AND v_match.scheduled_at IS NOT NULL
      AND v_match.lineups_locked_at IS NULL AND now()<v_match.scheduled_at-interval '1 hour',
    'lineup_locked',v_match.id IS NOT NULL AND (v_match.lineups_locked_at IS NOT NULL
      OR v_match.scheduled_at IS NULL OR now()>=v_match.scheduled_at-interval '1 hour'),
    'match_id',v_match.id,'lineup_deadline',v_match.scheduled_at-interval '1 hour',
    'own_lineup',v_own,'opponent_lineup',v_opponent
  );
END; $$;

CREATE OR REPLACE FUNCTION public.league_admin_set_team_active(
  p_actor_id uuid,p_team_id uuid,p_is_active boolean,p_reason text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE v_team record;
BEGIN
  PERFORM public.league_assert_admin(p_actor_id);
  SELECT * INTO v_team FROM public.league_teams WHERE id=p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_TEAM_NOT_FOUND'; END IF;
  IF v_team.is_active IS DISTINCT FROM p_is_active AND btrim(coalesce(p_reason,''))='' THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_REASON_REQUIRED'; END IF;
  UPDATE public.league_teams SET is_active=p_is_active,updated_at=now() WHERE id=p_team_id;
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,before_data,after_data,reason)
    VALUES(v_team.season_id,'team',p_team_id,'admin_team_active_override','staff',p_actor_id,
      jsonb_build_object('is_active',v_team.is_active),jsonb_build_object('is_active',p_is_active),nullif(btrim(coalesce(p_reason,'')),''));
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('team_id',p_team_id,'is_active',p_is_active));
END; $$;

CREATE OR REPLACE FUNCTION public.league_admin_delete_team(p_actor_id uuid,p_team_id uuid,p_confirmation text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE v_team record;
BEGIN
  PERFORM public.league_assert_admin(p_actor_id);
  SELECT * INTO v_team FROM public.league_teams WHERE id=p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_TEAM_NOT_FOUND'; END IF;
  IF p_confirmation IS DISTINCT FROM v_team.name THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_DELETE_CONFIRMATION_MISMATCH'; END IF;
  IF EXISTS(SELECT 1 FROM public.league_phase_teams WHERE team_id=p_team_id)
     OR EXISTS(SELECT 1 FROM public.league_matches WHERE home_team_id=p_team_id OR away_team_id=p_team_id) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_TEAM_HAS_HISTORY_DEACTIVATE_INSTEAD'; END IF;
  DELETE FROM public.league_teams WHERE id=p_team_id;
  INSERT INTO public.league_audit_events(season_id,entity_type,entity_id,event_type,actor_type,actor_staff_id,before_data)
    VALUES(v_team.season_id,'team',p_team_id,'team_deleted_preseason','staff',p_actor_id,to_jsonb(v_team));
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('team_id',p_team_id,'deleted',true));
END; $$;

REVOKE ALL ON FUNCTION public.league_is_captain(uuid,uuid),
  public.league_update_team_profile(uuid,uuid,uuid,text,text,text),
  public.league_captain_replace_roster_preseason(uuid,uuid,jsonb),
  public.league_admin_replace_roster(uuid,uuid,text,text,uuid,jsonb),
  public.league_write_lineup(uuid,uuid,uuid,uuid,uuid[],text),
  public.league_reopen_lineups(uuid,uuid,text),
  public.league_set_season_visibility(uuid,uuid,text),
  public.league_archive_season(uuid,uuid),
  public.league_delete_season(uuid,uuid,text,uuid),
  public.league_mark_storage_cleanup(uuid,uuid,text,text)
  ,public.league_get_public_lineups(uuid[])
  ,public.league_get_captain_context(uuid,uuid)
  ,public.league_admin_set_team_active(uuid,uuid,boolean,text)
  ,public.league_admin_delete_team(uuid,uuid,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.league_is_captain(uuid,uuid),
  public.league_update_team_profile(uuid,uuid,uuid,text,text,text),
  public.league_captain_replace_roster_preseason(uuid,uuid,jsonb),
  public.league_admin_replace_roster(uuid,uuid,text,text,uuid,jsonb),
  public.league_write_lineup(uuid,uuid,uuid,uuid,uuid[],text),
  public.league_reopen_lineups(uuid,uuid,text),
  public.league_set_season_visibility(uuid,uuid,text),
  public.league_archive_season(uuid,uuid),
  public.league_delete_season(uuid,uuid,text,uuid),
  public.league_mark_storage_cleanup(uuid,uuid,text,text)
  ,public.league_get_public_lineups(uuid[])
  ,public.league_get_captain_context(uuid,uuid)
  ,public.league_admin_set_team_active(uuid,uuid,boolean,text)
  ,public.league_admin_delete_team(uuid,uuid,text)
TO service_role;
