-- Monday League Stage 7: transactional, idempotent notification outbox.
-- Delivery reuses public.communications; external transports remain post-commit concerns.

CREATE TABLE public.league_notification_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type text NOT NULL CHECK (event_type IN (
        'lineup_reminder', 'match_reminder', 'missing_result_reminder',
        'result_submitted', 'contest_opened', 'contest_resolved',
        'match_rescheduled', 'lineups_reopened', 'phase2_ready'
    )),
    season_id uuid NOT NULL REFERENCES public.league_seasons(id) ON DELETE CASCADE,
    match_id uuid REFERENCES public.league_matches(id) ON DELETE CASCADE,
    result_submission_id uuid REFERENCES public.league_result_submissions(id) ON DELETE CASCADE,
    contest_id uuid REFERENCES public.league_result_contests(id) ON DELETE CASCADE,
    phase_id uuid REFERENCES public.league_phases(id) ON DELETE CASCADE,
    team_id uuid REFERENCES public.league_teams(id) ON DELETE CASCADE,
    recipient_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    channel text NOT NULL DEFAULT 'in_app' CHECK (channel = 'in_app'),
    idempotency_key text NOT NULL UNIQUE CHECK (btrim(idempotency_key) <> ''),
    due_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','delivered','skipped','failed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
    locked_at timestamptz,
    locked_by uuid,
    delivered_at timestamptz,
    last_error text,
    title text NOT NULL CHECK (btrim(title) <> ''),
    body text NOT NULL CHECK (btrim(body) <> ''),
    cta_label text,
    cta_url text,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT league_notification_events_delivery_shape CHECK (
      (status = 'delivered' AND delivered_at IS NOT NULL) OR status <> 'delivered'
    )
);

CREATE INDEX league_notification_events_due_idx
  ON public.league_notification_events(status,due_at)
  WHERE status IN ('pending','processing');
CREATE INDEX league_notification_events_match_idx
  ON public.league_notification_events(match_id,event_type,created_at DESC)
  WHERE match_id IS NOT NULL;

ALTER TABLE public.league_notification_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.league_notification_events FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.league_notification_events TO service_role;

CREATE FUNCTION public.league_format_rome_timestamp(p_value timestamptz)
RETURNS text LANGUAGE sql STABLE STRICT SET search_path=pg_catalog,public AS $$
  SELECT to_char(p_value AT TIME ZONE 'Europe/Rome','DD/MM/YYYY "alle" HH24:MI');
$$;

CREATE FUNCTION public.league_result_score_label(p_result_id uuid)
RETURNS text LANGUAGE sql STABLE STRICT SET search_path=pg_catalog,public AS $$
  SELECT r.home_sets_won::text || '-' || r.away_sets_won::text
  FROM public.league_result_submissions r WHERE r.id=p_result_id;
$$;

CREATE FUNCTION public.league_enqueue_user_notification(
  p_event_type text,p_season_id uuid,p_recipient_user_id uuid,p_idempotency_key text,
  p_title text,p_body text,p_cta_url text,p_due_at timestamptz DEFAULT now(),
  p_match_id uuid DEFAULT NULL,p_result_submission_id uuid DEFAULT NULL,
  p_contest_id uuid DEFAULT NULL,p_phase_id uuid DEFAULT NULL,p_team_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_recipient_user_id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.league_notification_events(
    event_type,season_id,match_id,result_submission_id,contest_id,phase_id,team_id,
    recipient_user_id,idempotency_key,due_at,title,body,cta_label,cta_url,payload
  ) VALUES (
    p_event_type,p_season_id,p_match_id,p_result_submission_id,p_contest_id,p_phase_id,p_team_id,
    p_recipient_user_id,p_idempotency_key,p_due_at,p_title,p_body,'Apri',p_cta_url,coalesce(p_payload,'{}'::jsonb)
  ) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.league_notification_events WHERE idempotency_key=p_idempotency_key;
  END IF;
  RETURN v_id;
END; $$;

CREATE FUNCTION public.league_enqueue_audit_notification()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE
  v_match record; v_home_user uuid; v_away_user uuid; v_result_id uuid;
  v_contest uuid; v_score text; v_deadline timestamptz; v_key text;
BEGIN
  IF NEW.event_type NOT IN ('captain_result_submitted','result_contested','contest_rejected','contest_corrected','lineups_reopened') THEN
    RETURN NEW;
  END IF;

  IF NEW.event_type IN ('captain_result_submitted','lineups_reopened') THEN
    SELECT NEW.entity_id INTO v_contest;
  ELSE
    v_contest:=NEW.entity_id;
  END IF;

  IF NEW.event_type='result_contested' THEN
    SELECT c.match_id INTO v_contest FROM public.league_result_contests c WHERE c.id=NEW.entity_id;
  ELSIF NEW.event_type IN ('contest_rejected','contest_corrected') THEN
    SELECT c.match_id INTO v_contest FROM public.league_result_contests c WHERE c.id=NEW.entity_id;
  ELSE
    v_contest:=NEW.entity_id;
  END IF;

  SELECT m.*,ph.season_id,ht.name AS home_name,ht.slug AS home_slug,
         at.name AS away_name,at.slug AS away_slug
    INTO v_match
  FROM public.league_matches m
  JOIN public.league_phases ph ON ph.id=m.phase_id
  JOIN public.league_teams ht ON ht.id=m.home_team_id
  JOIN public.league_teams at ON at.id=m.away_team_id
  WHERE m.id=v_contest;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT hp.user_id,ap.user_id INTO v_home_user,v_away_user
  FROM public.league_teams ht
  JOIN public.league_team_players hp ON hp.id=ht.captain_player_id AND hp.team_id=ht.id AND hp.is_active
  JOIN public.league_teams at ON at.id=v_match.away_team_id
  JOIN public.league_team_players ap ON ap.id=at.captain_player_id AND ap.team_id=at.id AND ap.is_active
  WHERE ht.id=v_match.home_team_id;

  IF NEW.event_type='captain_result_submitted' THEN
    v_result_id:=nullif(NEW.after_data->>'result_id','')::uuid;
    SELECT submitted_at+interval '48 hours' INTO v_deadline FROM public.league_result_submissions WHERE id=v_result_id;
    v_score:=public.league_result_score_label(v_result_id);
    v_key:='league:'||v_match.season_id||':match:'||v_match.id||':result-submitted:'||v_result_id||':user:'||v_away_user||':in_app';
    PERFORM public.league_enqueue_user_notification('result_submitted',v_match.season_id,v_away_user,v_key,
      'Risultato da verificare',
      'Monday League: risultato provvisorio '||v_match.home_name||'–'||v_match.away_name||' '||v_score||'. Puoi contestarlo fino al '||public.league_format_rome_timestamp(v_deadline)||'.',
      '/monday-league/team/'||v_match.away_slug,now(),v_match.id,v_result_id,NULL,v_match.phase_id,v_match.away_team_id,
      jsonb_build_object('contest_deadline',v_deadline,'score',v_score));
  ELSIF NEW.event_type='result_contested' THEN
    v_result_id:=nullif(NEW.after_data->>'result_id','')::uuid;
    v_key:='league:'||v_match.season_id||':match:'||v_match.id||':contest-opened:'||NEW.entity_id||':user:'||v_home_user||':in_app';
    PERFORM public.league_enqueue_user_notification('contest_opened',v_match.season_id,v_home_user,v_key,
      'Risultato contestato','Monday League: il risultato di '||v_match.home_name||'–'||v_match.away_name||' è stato contestato ed è in verifica.',
      '/monday-league/team/'||v_match.home_slug,now(),v_match.id,v_result_id,NEW.entity_id,v_match.phase_id,v_match.home_team_id,'{}');
  ELSIF NEW.event_type IN ('contest_rejected','contest_corrected') THEN
    v_result_id:=v_match.current_result_id;
    v_score:=public.league_result_score_label(v_result_id);
    FOR v_key IN SELECT * FROM unnest(ARRAY[
      'league:'||v_match.season_id||':match:'||v_match.id||':contest-resolved:'||NEW.entity_id||':user:'||v_home_user||':in_app',
      'league:'||v_match.season_id||':match:'||v_match.id||':contest-resolved:'||NEW.entity_id||':user:'||v_away_user||':in_app'
    ]) LOOP
      PERFORM public.league_enqueue_user_notification('contest_resolved',v_match.season_id,
        CASE WHEN v_key LIKE '%:user:'||v_home_user||':in_app' THEN v_home_user ELSE v_away_user END,v_key,
        'Contestazione risolta',
        CASE WHEN NEW.event_type='contest_corrected'
          THEN 'Monday League: contestazione risolta. Risultato corretto e definitivo: '||v_match.home_name||'–'||v_match.away_name||' '||v_score||'.'
          ELSE 'Monday League: contestazione respinta. Risultato confermato: '||v_match.home_name||'–'||v_match.away_name||' '||v_score||'.' END,
        CASE WHEN v_key LIKE '%:user:'||v_home_user||':in_app' THEN '/monday-league/team/'||v_match.home_slug ELSE '/monday-league/team/'||v_match.away_slug END,
        now(),v_match.id,v_result_id,NEW.entity_id,v_match.phase_id,
        CASE WHEN v_key LIKE '%:user:'||v_home_user||':in_app' THEN v_match.home_team_id ELSE v_match.away_team_id END,
        jsonb_build_object('resolution',CASE WHEN NEW.event_type='contest_corrected' THEN 'corrected' ELSE 'rejected' END,'score',v_score));
    END LOOP;
  ELSIF NEW.event_type='lineups_reopened' THEN
    v_deadline:=v_match.scheduled_at-interval '1 hour';
    PERFORM public.league_enqueue_user_notification('lineups_reopened',v_match.season_id,v_home_user,
      'league:'||v_match.season_id||':match:'||v_match.id||':lineups-reopened:'||NEW.id||':user:'||v_home_user||':in_app',
      'Formazioni riaperte','Monday League: le formazioni di '||v_match.home_name||'–'||v_match.away_name||' sono state riaperte. Nuova scadenza: '||public.league_format_rome_timestamp(v_deadline)||'.',
      '/monday-league/team/'||v_match.home_slug,now(),v_match.id,NULL,NULL,v_match.phase_id,v_match.home_team_id,jsonb_build_object('lineup_deadline',v_deadline));
    PERFORM public.league_enqueue_user_notification('lineups_reopened',v_match.season_id,v_away_user,
      'league:'||v_match.season_id||':match:'||v_match.id||':lineups-reopened:'||NEW.id||':user:'||v_away_user||':in_app',
      'Formazioni riaperte','Monday League: le formazioni di '||v_match.home_name||'–'||v_match.away_name||' sono state riaperte. Nuova scadenza: '||public.league_format_rome_timestamp(v_deadline)||'.',
      '/monday-league/team/'||v_match.away_slug,now(),v_match.id,NULL,NULL,v_match.phase_id,v_match.away_team_id,jsonb_build_object('lineup_deadline',v_deadline));
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER league_audit_notification_outbox
AFTER INSERT ON public.league_audit_events
FOR EACH ROW EXECUTE FUNCTION public.league_enqueue_audit_notification();

CREATE FUNCTION public.league_enqueue_reschedule_notification()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE v record; v_user uuid; v_team uuid; v_slug text; v_side text;
BEGIN
  IF OLD.scheduled_at IS NULL OR NEW.scheduled_at IS NULL OR NEW.match_status<>'scheduled'
     OR (OLD.scheduled_at IS NOT DISTINCT FROM NEW.scheduled_at AND OLD.venue_id IS NOT DISTINCT FROM NEW.venue_id) THEN
    RETURN NEW;
  END IF;
  SELECT ph.season_id,ht.name home_name,at.name away_name,ov.name old_venue,nv.name new_venue
    INTO v FROM public.league_phases ph
    JOIN public.league_teams ht ON ht.id=NEW.home_team_id JOIN public.league_teams at ON at.id=NEW.away_team_id
    LEFT JOIN public.league_venues ov ON ov.id=OLD.venue_id LEFT JOIN public.league_venues nv ON nv.id=NEW.venue_id
    WHERE ph.id=NEW.phase_id;
  FOR v_user,v_team,v_slug,v_side IN
    SELECT p.user_id,t.id,t.slug,x.side FROM (VALUES(NEW.home_team_id,'home'),(NEW.away_team_id,'away')) x(team_id,side)
    JOIN public.league_teams t ON t.id=x.team_id JOIN public.league_team_players p ON p.id=t.captain_player_id AND p.is_active
  LOOP
    PERFORM public.league_enqueue_user_notification('match_rescheduled',v.season_id,v_user,
      'league:'||v.season_id||':match:'||NEW.id||':rescheduled:'||NEW.schedule_version||':user:'||v_user||':in_app',
      'Partita riprogrammata','Monday League: '||v.home_name||'–'||v.away_name||' riprogrammata dal '||public.league_format_rome_timestamp(OLD.scheduled_at)||' al '||public.league_format_rome_timestamp(NEW.scheduled_at)||'. Circolo: '||coalesce(v.new_venue,'da definire')||'.',
      '/monday-league/team/'||v_slug,now(),NEW.id,NULL,NULL,NEW.phase_id,v_team,
      jsonb_build_object('schedule_version',NEW.schedule_version,'old_scheduled_at',OLD.scheduled_at,'new_scheduled_at',NEW.scheduled_at,'old_venue',v.old_venue,'new_venue',v.new_venue,'side',v_side));
  END LOOP;
  RETURN NEW;
END; $$;

CREATE TRIGGER league_match_reschedule_notification_outbox
AFTER UPDATE OF scheduled_at,venue_id ON public.league_matches
FOR EACH ROW EXECUTE FUNCTION public.league_enqueue_reschedule_notification();

CREATE FUNCTION public.league_scan_due_notifications(p_now timestamptz DEFAULT now(),p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_lineup integer:=0; v_match integer:=0; v_result integer:=0;
BEGIN
  IF p_limit<1 OR p_limit>500 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_NOTIFICATION_LIMIT_INVALID'; END IF;

  WITH candidates AS (
    SELECT m.*,ph.season_id,t.id team_id,t.name team_name,t.slug team_slug,o.name opponent_name,
      cp.user_id recipient_user_id
    FROM public.league_matches m JOIN public.league_phases ph ON ph.id=m.phase_id
    JOIN public.league_seasons s ON s.id=ph.season_id AND s.status IN ('phase1','phase2')
    CROSS JOIN LATERAL (VALUES(m.home_team_id,m.away_team_id),(m.away_team_id,m.home_team_id)) x(team_id,opponent_id)
    JOIN public.league_teams t ON t.id=x.team_id AND t.is_active JOIN public.league_teams o ON o.id=x.opponent_id
    JOIN public.league_team_players cp ON cp.id=t.captain_player_id AND cp.is_active AND cp.user_id IS NOT NULL
    WHERE m.match_status='scheduled' AND m.scheduled_at IS NOT NULL
      AND p_now>=m.scheduled_at-interval '3 hours' AND p_now<m.scheduled_at-interval '1 hour'
      AND NOT EXISTS(SELECT 1 FROM public.league_lineups l WHERE l.match_id=m.id AND l.team_id=t.id AND l.status='current')
    ORDER BY m.scheduled_at LIMIT p_limit
  )
  INSERT INTO public.league_notification_events(event_type,season_id,match_id,phase_id,team_id,recipient_user_id,idempotency_key,due_at,title,body,cta_label,cta_url,payload)
  SELECT 'lineup_reminder',season_id,id,phase_id,team_id,recipient_user_id,
    'league:'||season_id||':match:'||id||':lineup-reminder:'||team_id||':schedule:'||schedule_version||':user:'||recipient_user_id||':in_app',
    scheduled_at-interval '3 hours','Formazione da inserire',
    'Monday League: inserisci la formazione per '||team_name||' – '||opponent_name||'. Hai tempo fino al '||public.league_format_rome_timestamp(scheduled_at-interval '1 hour')||'.',
    'Apri','/monday-league/team/'||team_slug,jsonb_build_object('schedule_version',schedule_version,'lineup_deadline',scheduled_at-interval '1 hour')
  FROM candidates ON CONFLICT(idempotency_key) DO NOTHING;
  GET DIAGNOSTICS v_lineup=ROW_COUNT;

  WITH candidates AS (
    SELECT m.*,ph.season_id,t.id team_id,t.name team_name,t.slug team_slug,o.name opponent_name,v.name venue_name,
      cp.user_id recipient_user_id,CASE WHEN t.id=m.home_team_id THEN 'casa' ELSE 'trasferta' END side
    FROM public.league_matches m JOIN public.league_phases ph ON ph.id=m.phase_id
    JOIN public.league_seasons s ON s.id=ph.season_id AND s.status IN ('phase1','phase2')
    JOIN public.league_venues v ON v.id=m.venue_id
    CROSS JOIN LATERAL (VALUES(m.home_team_id,m.away_team_id),(m.away_team_id,m.home_team_id)) x(team_id,opponent_id)
    JOIN public.league_teams t ON t.id=x.team_id AND t.is_active JOIN public.league_teams o ON o.id=x.opponent_id
    JOIN public.league_team_players cp ON cp.id=t.captain_player_id AND cp.is_active AND cp.user_id IS NOT NULL
    WHERE m.match_status='scheduled' AND p_now>=m.scheduled_at-interval '3 hours' AND p_now<m.scheduled_at
    ORDER BY m.scheduled_at LIMIT p_limit
  )
  INSERT INTO public.league_notification_events(event_type,season_id,match_id,phase_id,team_id,recipient_user_id,idempotency_key,due_at,title,body,cta_label,cta_url,payload)
  SELECT 'match_reminder',season_id,id,phase_id,team_id,recipient_user_id,
    'league:'||season_id||':match:'||id||':match-reminder:'||team_id||':schedule:'||schedule_version||':user:'||recipient_user_id||':in_app',
    scheduled_at-interval '3 hours','Partita questa sera',
    'Monday League: '||team_name||' gioca '||side||' contro '||opponent_name||' al '||venue_name||', '||public.league_format_rome_timestamp(scheduled_at)||'.',
    'Apri','/monday-league/team/'||team_slug,jsonb_build_object('schedule_version',schedule_version,'scheduled_at',scheduled_at,'venue',venue_name,'side',side)
  FROM candidates ON CONFLICT(idempotency_key) DO NOTHING;
  GET DIAGNOSTICS v_match=ROW_COUNT;

  WITH candidates AS (
    SELECT m.*,ph.season_id,ht.name home_name,ht.slug home_slug,at.name away_name,cp.user_id recipient_user_id
    FROM public.league_matches m JOIN public.league_phases ph ON ph.id=m.phase_id
    JOIN public.league_seasons s ON s.id=ph.season_id AND s.status IN ('phase1','phase2')
    JOIN public.league_teams ht ON ht.id=m.home_team_id AND ht.is_active JOIN public.league_teams at ON at.id=m.away_team_id
    JOIN public.league_team_players cp ON cp.id=ht.captain_player_id AND cp.is_active AND cp.user_id IS NOT NULL
    WHERE m.match_status='scheduled' AND m.current_result_id IS NULL AND m.current_special_outcome_id IS NULL
      AND p_now>=m.scheduled_at+interval '2 hours' AND m.scheduled_at>=p_now-interval '14 days'
    ORDER BY m.scheduled_at LIMIT p_limit
  )
  INSERT INTO public.league_notification_events(event_type,season_id,match_id,phase_id,team_id,recipient_user_id,idempotency_key,due_at,title,body,cta_label,cta_url,payload)
  SELECT 'missing_result_reminder',season_id,id,phase_id,home_team_id,recipient_user_id,
    'league:'||season_id||':match:'||id||':missing-result:'||home_team_id||':schedule:'||schedule_version||':user:'||recipient_user_id||':in_app',
    scheduled_at+interval '2 hours','Inserisci il risultato','Monday League: inserisci il risultato di '||home_name||'–'||away_name||'.',
    'Apri','/monday-league/team/'||home_slug,jsonb_build_object('schedule_version',schedule_version)
  FROM candidates ON CONFLICT(idempotency_key) DO NOTHING;
  GET DIAGNOSTICS v_result=ROW_COUNT;
  RETURN jsonb_build_object('ok',true,'lineup_created',v_lineup,'match_created',v_match,'result_created',v_result);
END; $$;

CREATE FUNCTION public.league_claim_notification_events(p_worker_id uuid,p_limit integer DEFAULT 50)
RETURNS SETOF public.league_notification_events LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
  WITH claimed AS (
    SELECT id FROM public.league_notification_events
    WHERE attempts<5 AND due_at<=now() AND (status='pending' OR (status='processing' AND locked_at<now()-interval '5 minutes'))
    ORDER BY due_at,id LIMIT greatest(1,least(p_limit,100)) FOR UPDATE SKIP LOCKED
  )
  UPDATE public.league_notification_events e SET status='processing',attempts=e.attempts+1,
    locked_at=now(),locked_by=p_worker_id,updated_at=now(),last_error=NULL
  FROM claimed WHERE e.id=claimed.id RETURNING e.*;
$$;

CREATE FUNCTION public.league_deliver_notification_event(p_event_id uuid,p_worker_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_event public.league_notification_events%ROWTYPE; v_valid boolean:=true; v_created integer:=0;
BEGIN
  SELECT * INTO v_event FROM public.league_notification_events WHERE id=p_event_id FOR UPDATE;
  IF NOT FOUND OR v_event.status='delivered' THEN RETURN jsonb_build_object('ok',true,'replayed',true,'created',false); END IF;
  IF v_event.status<>'processing' OR v_event.locked_by IS DISTINCT FROM p_worker_id THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_NOTIFICATION_CLAIM_REQUIRED';
  END IF;
  IF v_event.event_type IN ('lineup_reminder','match_reminder','missing_result_reminder') THEN
    SELECT EXISTS(
      SELECT 1 FROM public.league_matches m JOIN public.league_phases ph ON ph.id=m.phase_id
      JOIN public.league_seasons s ON s.id=ph.season_id
      JOIN public.league_teams t ON t.id=v_event.team_id
      JOIN public.league_team_players cp ON cp.id=t.captain_player_id AND cp.is_active
      WHERE m.id=v_event.match_id AND s.status IN ('phase1','phase2') AND m.match_status='scheduled'
        AND m.schedule_version=(v_event.payload->>'schedule_version')::integer
        AND cp.user_id=v_event.recipient_user_id
        AND CASE v_event.event_type
          WHEN 'lineup_reminder' THEN now()<m.scheduled_at-interval '1 hour' AND NOT EXISTS(
            SELECT 1 FROM public.league_lineups l WHERE l.match_id=m.id AND l.team_id=v_event.team_id AND l.status='current')
          WHEN 'match_reminder' THEN now()<m.scheduled_at
          ELSE m.current_result_id IS NULL AND m.current_special_outcome_id IS NULL END
    ) INTO v_valid;
  END IF;
  IF NOT v_valid THEN
    UPDATE public.league_notification_events SET status='skipped',locked_at=NULL,locked_by=NULL,updated_at=now(),last_error='invalidated' WHERE id=v_event.id;
    RETURN jsonb_build_object('ok',true,'skipped',true,'created',false);
  END IF;
  INSERT INTO public.communications(target,recipient_user_id,event_type,event_key,title,body,cta_label,cta_url,is_active,starts_at)
  VALUES('user',v_event.recipient_user_id,v_event.event_type,v_event.idempotency_key,v_event.title,v_event.body,v_event.cta_label,v_event.cta_url,true,now())
  ON CONFLICT(event_key) WHERE event_key IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_created=ROW_COUNT;
  UPDATE public.league_notification_events SET status='delivered',delivered_at=now(),locked_at=NULL,locked_by=NULL,updated_at=now() WHERE id=v_event.id;
  RETURN jsonb_build_object('ok',true,'created',v_created=1,'replayed',v_created=0);
END; $$;

CREATE FUNCTION public.league_fail_notification_event(p_event_id uuid,p_worker_id uuid,p_error text)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  UPDATE public.league_notification_events SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,
    locked_at=NULL,locked_by=NULL,last_error=left(coalesce(p_error,'unknown'),500),updated_at=now()
  WHERE id=p_event_id AND status='processing' AND locked_by=p_worker_id;
$$;

CREATE FUNCTION public.league_enqueue_phase2_ready(p_season_id uuid,p_phase_id uuid)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_count integer:=0; v_row record;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.league_phases WHERE id=p_phase_id AND season_id=p_season_id AND code IN ('serie_a','serie_b')) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='ML_PHASE2_NOTIFICATION_PHASE_INVALID';
  END IF;
  FOR v_row IN SELECT t.id,t.slug,p.user_id FROM public.league_teams t
    JOIN public.league_team_players p ON p.id=t.captain_player_id AND p.is_active AND p.user_id IS NOT NULL
    WHERE t.season_id=p_season_id AND t.is_active
  LOOP
    PERFORM public.league_enqueue_user_notification('phase2_ready',p_season_id,v_row.user_id,
      'league:'||p_season_id||':phase:'||p_phase_id||':phase2-ready:user:'||v_row.user_id||':in_app',
      'Fase 2 disponibile','Monday League: Serie A e Serie B sono disponibili.',
      '/monday-league/team/'||v_row.slug,now(),NULL,NULL,NULL,p_phase_id,v_row.id,'{}');
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END; $$;

REVOKE ALL ON FUNCTION public.league_format_rome_timestamp(timestamptz),
  public.league_result_score_label(uuid),
  public.league_enqueue_user_notification(text,uuid,uuid,text,text,text,text,timestamptz,uuid,uuid,uuid,uuid,uuid,jsonb),
  public.league_scan_due_notifications(timestamptz,integer),
  public.league_claim_notification_events(uuid,integer),
  public.league_deliver_notification_event(uuid,uuid),
  public.league_fail_notification_event(uuid,uuid,text),
  public.league_enqueue_phase2_ready(uuid,uuid)
FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.league_scan_due_notifications(timestamptz,integer),
  public.league_claim_notification_events(uuid,integer),
  public.league_deliver_notification_event(uuid,uuid),
  public.league_fail_notification_event(uuid,uuid,text),
  public.league_enqueue_phase2_ready(uuid,uuid)
TO service_role;
