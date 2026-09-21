-- MOVI Auth 2.0 Stage 3: admin-reviewed duplicate discovery and pairwise
-- transactional merge engine. No user is discovered or merged by migration.

ALTER TABLE public.users
  ADD COLUMN identity_status text NOT NULL DEFAULT 'active'
    CHECK (identity_status IN ('active', 'merged')),
  ADD COLUMN merged_into_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  ADD COLUMN merged_at timestamptz,
  ADD CONSTRAINT users_merge_state_check CHECK (
    (identity_status = 'active' AND merged_into_user_id IS NULL AND merged_at IS NULL)
    OR (identity_status = 'merged' AND merged_into_user_id IS NOT NULL AND merged_at IS NOT NULL
        AND merged_into_user_id <> id AND auth_user_id IS NULL)
  );

CREATE INDEX users_identity_status_idx ON public.users(identity_status);
CREATE INDEX users_merged_into_idx ON public.users(merged_into_user_id)
  WHERE merged_into_user_id IS NOT NULL;

CREATE FUNCTION public.prevent_merged_user_reactivation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.identity_status = 'merged' AND NEW.auth_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'MOVI_AUTH_MERGED_USER_CANNOT_LINK_AUTH' USING ERRCODE='23514';
  END IF;
  IF OLD.identity_status = 'merged' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'MOVI_AUTH_MERGED_USER_IMMUTABLE_IDENTITY' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER users_prevent_merged_reactivation
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.prevent_merged_user_reactivation();

CREATE TABLE public.user_duplicate_review_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_key text NOT NULL UNIQUE,
  signal_type text NOT NULL CHECK (signal_type IN ('normalized_email','normalized_phone','manual')),
  signal_value text,
  confidence text NOT NULL CHECK (confidence IN ('high','medium','manual-review')),
  state text NOT NULL DEFAULT 'pending_review' CHECK (
    state IN ('pending_review','approved','rejected','merged','conflict','manual_only')
  ),
  recommended_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  canonical_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  warning_flags jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(warning_flags)='array'),
  reviewed_by_staff_id uuid REFERENCES public.staff_users(id) ON DELETE SET NULL,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_discovered_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_duplicate_review_members (
  group_id uuid NOT NULL REFERENCES public.user_duplicate_review_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  included boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(group_id,user_id)
);

ALTER TABLE public.user_merge_operations
  ADD COLUMN candidate_group_id uuid REFERENCES public.user_duplicate_review_groups(id) ON DELETE SET NULL,
  ADD COLUMN expected_fingerprint text,
  ADD COLUMN preview jsonb CHECK (preview IS NULL OR jsonb_typeof(preview)='object');

CREATE FUNCTION public.user_merge_history_score(p_user_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT
    (CASE WHEN u.auth_user_id IS NOT NULL THEN 1000 ELSE 0 END) +
    (CASE WHEN u.privacy_accepted_at IS NOT NULL THEN 100 ELSE 0 END) +
    (CASE WHEN u.terms_accepted_at IS NOT NULL THEN 100 ELSE 0 END) +
    (CASE WHEN u.age_confirmed_at IS NOT NULL THEN 100 ELSE 0 END) +
    (SELECT count(*)::int * 10 FROM public.loyalty_memberships x WHERE x.user_id=u.id) +
    (SELECT count(*)::int FROM public.store_orders x WHERE x.user_id=u.id) +
    (SELECT count(*)::int FROM public.tournament_registrations x WHERE x.user_id=u.id) +
    (SELECT count(*)::int FROM public.league_team_players x WHERE x.user_id=u.id)
  FROM public.users u WHERE u.id=p_user_id AND u.identity_status='active';
$$;

CREATE FUNCTION public.refresh_user_duplicate_candidates(p_actor_staff_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_group record; v_group_id uuid; v_recommended uuid; v_dual_auth boolean; v_count integer:=0;
BEGIN
  FOR v_group IN
    WITH normalized AS (
      SELECT id,
        public.normalize_user_email(email) normalized_email,
        public.normalize_user_mobile_e164(phone) normalized_phone,
        lower(regexp_replace(btrim(full_name),'\s+',' ','g')) normalized_name
      FROM public.users WHERE identity_status='active'
    ), phone_masks AS (
      SELECT n.id,n.normalized_phone,i,
             overlay(n.normalized_phone placing '#' from i for 1) masked_phone
      FROM normalized n CROSS JOIN LATERAL generate_series(1,length(n.normalized_phone)) i
      WHERE n.normalized_phone IS NOT NULL
    ), signals AS (
      SELECT 'normalized_email'::text signal_type, normalized_email signal_value,
             array_agg(id ORDER BY id) user_ids
      FROM normalized WHERE normalized_email IS NOT NULL
      GROUP BY normalized_email HAVING count(*)>1
      UNION ALL
      SELECT 'normalized_phone', normalized_phone, array_agg(id ORDER BY id)
      FROM normalized WHERE normalized_phone IS NOT NULL
      GROUP BY normalized_phone HAVING count(*)>1
      UNION ALL
      SELECT 'manual', 'name:'||normalized_name, array_agg(id ORDER BY id)
      FROM normalized WHERE char_length(normalized_name)>=5
      GROUP BY normalized_name HAVING count(*)>1
      UNION ALL
      SELECT 'manual', 'phone-near:'||a.normalized_phone||'~'||b.normalized_phone,
             ARRAY[a.id,b.id]::uuid[]
      FROM phone_masks a JOIN phone_masks b
        ON a.i=b.i AND a.masked_phone=b.masked_phone AND a.id<b.id
      WHERE a.normalized_phone<>b.normalized_phone
    ) SELECT *, md5(signal_type||':'||signal_value||':'||array_to_string(user_ids,',')) group_key FROM signals
  LOOP
    SELECT u.id INTO v_recommended FROM unnest(v_group.user_ids) x(id)
      JOIN public.users u ON u.id=x.id
      ORDER BY public.user_merge_history_score(u.id) DESC, u.created_at, u.id LIMIT 1;
    SELECT count(DISTINCT auth_user_id)>1 INTO v_dual_auth FROM public.users
      WHERE id=ANY(v_group.user_ids) AND auth_user_id IS NOT NULL;
    INSERT INTO public.user_duplicate_review_groups(
      group_key,signal_type,signal_value,confidence,state,recommended_user_id,warning_flags,last_discovered_at
    ) VALUES (
      v_group.group_key,v_group.signal_type,v_group.signal_value,
      CASE WHEN v_group.signal_type='normalized_email' THEN 'high'
           WHEN v_group.signal_type='normalized_phone' THEN 'medium' ELSE 'manual-review' END,
      CASE WHEN v_dual_auth THEN 'conflict'
           WHEN v_group.signal_type='manual' THEN 'manual_only' ELSE 'pending_review' END,v_recommended,
      (CASE WHEN v_dual_auth THEN '["multiple_auth_identities"]'::jsonb ELSE '[]'::jsonb END) ||
      (CASE WHEN v_group.signal_type='manual' THEN '["weak_identity_signal"]'::jsonb ELSE '[]'::jsonb END),now()
    ) ON CONFLICT(group_key) DO UPDATE SET
      recommended_user_id=EXCLUDED.recommended_user_id,
      warning_flags=EXCLUDED.warning_flags,last_discovered_at=now(),updated_at=now(),
      state=CASE WHEN user_duplicate_review_groups.state IN ('merged','rejected') THEN user_duplicate_review_groups.state
                 WHEN EXCLUDED.state='conflict' THEN 'conflict'
                 WHEN user_duplicate_review_groups.state='approved' THEN 'approved'
                 ELSE EXCLUDED.state END
    RETURNING id INTO v_group_id;
    INSERT INTO public.user_duplicate_review_members(group_id,user_id)
      SELECT v_group_id,x FROM unnest(v_group.user_ids) x
      ON CONFLICT(group_id,user_id) DO NOTHING;
    v_count:=v_count+1;
  END LOOP;
  RETURN jsonb_build_object('groups_discovered',v_count,'actor_staff_id',p_actor_staff_id);
END $$;

CREATE FUNCTION public.user_merge_fingerprint(p_source_user_id uuid,p_canonical_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT md5(jsonb_build_object(
    'source',jsonb_build_object('id',s.id,'updated_at',s.updated_at,'auth',s.auth_user_id,'status',s.identity_status),
    'canonical',jsonb_build_object('id',c.id,'updated_at',c.updated_at,'auth',c.auth_user_id,'status',c.identity_status),
    'counts',jsonb_build_object(
      'idem',(SELECT count(*) FROM public.business_operation_idempotency x WHERE x.user_id IN(s.id,c.id)),
      'comm_state',(SELECT count(*) FROM public.communication_user_states x WHERE x.user_id IN(s.id,c.id)),
      'communications',(SELECT count(*) FROM public.communications x WHERE x.recipient_user_id IN(s.id,c.id)),
      'roster',(SELECT count(*) FROM public.league_team_players x WHERE x.user_id IN(s.id,c.id)),
      'league_notifications',(SELECT count(*) FROM public.league_notification_events x WHERE x.recipient_user_id IN(s.id,c.id)),
      'memberships',(SELECT count(*) FROM public.loyalty_memberships x WHERE x.user_id IN(s.id,c.id)),
      'medical',(SELECT count(*) FROM public.medical_certificates x WHERE x.user_id IN(s.id,c.id)),
      'orders',(SELECT count(*) FROM public.store_orders x WHERE x.user_id IN(s.id,c.id)),
      'registrations',(SELECT count(*) FROM public.tournament_registrations x WHERE x.user_id IN(s.id,c.id)),
      'participants',(SELECT count(*) FROM public.tournament_run_participants x WHERE x.user_id IN(s.id,c.id))
    ),
    'conflict_keys',jsonb_build_object(
      'same_team',(SELECT count(*) FROM public.league_team_players a JOIN public.league_team_players b ON b.team_id=a.team_id WHERE a.user_id=s.id AND b.user_id=c.id),
      'same_tournament',(SELECT count(*) FROM public.tournament_registrations a JOIN public.tournament_registrations b ON b.tournament_id=a.tournament_id WHERE a.user_id=s.id AND b.user_id=c.id),
      'same_run',(SELECT count(*) FROM public.tournament_run_participants a JOIN public.tournament_run_participants b ON b.run_id=a.run_id WHERE a.user_id=s.id AND b.user_id=c.id),
      'idempotency_divergence',(SELECT count(*) FROM public.business_operation_idempotency a JOIN public.business_operation_idempotency b
        ON b.operation=a.operation AND b.idempotency_key=a.idempotency_key
        WHERE a.user_id=s.id AND b.user_id=c.id
          AND (a.request_hash,a.status,coalesce(a.result,'{}'::jsonb)) IS DISTINCT FROM (b.request_hash,b.status,coalesce(b.result,'{}'::jsonb))),
      'alias_relationships',(SELECT count(*) FROM public.user_identity_aliases
        WHERE source_user_id IN(s.id,c.id) OR canonical_user_id=s.id)
    )
  )::text)
  FROM public.users s CROSS JOIN public.users c
  WHERE s.id=p_source_user_id AND c.id=p_canonical_user_id;
$$;

CREATE FUNCTION public.preview_user_merge(p_source_user_id uuid,p_canonical_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.users%rowtype; c public.users%rowtype; v_conflicts jsonb:='[]'; v_warnings jsonb:='[]'; v_counts jsonb; v_fp text;
BEGIN
  IF p_source_user_id=p_canonical_user_id THEN RAISE EXCEPTION 'MOVI_AUTH_MERGE_SAME_USER' USING ERRCODE='22023'; END IF;
  SELECT * INTO s FROM public.users WHERE id=p_source_user_id;
  SELECT * INTO c FROM public.users WHERE id=p_canonical_user_id;
  IF s.id IS NULL OR c.id IS NULL THEN RAISE EXCEPTION 'MOVI_AUTH_MERGE_USER_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF s.identity_status<>'active' OR c.identity_status<>'active' THEN v_conflicts:=v_conflicts||'"inactive_or_merged_profile"'::jsonb; END IF;
  IF s.auth_user_id IS NOT NULL THEN v_conflicts:=v_conflicts||'"source_has_auth_identity"'::jsonb; END IF;
  IF s.auth_user_id IS NOT NULL AND c.auth_user_id IS NOT NULL AND s.auth_user_id<>c.auth_user_id THEN v_conflicts:=v_conflicts||'"multiple_auth_identities"'::jsonb; END IF;
  IF (SELECT count(*) FROM public.loyalty_memberships WHERE user_id IN(s.id,c.id))>1 THEN v_conflicts:=v_conflicts||'"dual_loyalty_membership"'::jsonb; END IF;
  IF EXISTS(SELECT 1 FROM public.league_team_players a JOIN public.league_team_players b ON b.team_id=a.team_id WHERE a.user_id=s.id AND b.user_id=c.id) THEN v_conflicts:=v_conflicts||'"same_league_roster"'::jsonb; END IF;
  IF EXISTS(SELECT 1 FROM public.tournament_registrations a JOIN public.tournament_registrations b ON b.tournament_id=a.tournament_id WHERE a.user_id=s.id AND b.user_id=c.id) THEN v_conflicts:=v_conflicts||'"same_tournament"'::jsonb; END IF;
  IF EXISTS(SELECT 1 FROM public.tournament_run_participants a JOIN public.tournament_run_participants b ON b.run_id=a.run_id WHERE a.user_id=s.id AND b.user_id=c.id) THEN v_conflicts:=v_conflicts||'"same_tournament_run"'::jsonb; END IF;
  IF EXISTS(
    SELECT 1 FROM public.business_operation_idempotency a JOIN public.business_operation_idempotency b
      ON b.operation=a.operation AND b.idempotency_key=a.idempotency_key
    WHERE a.user_id=s.id AND b.user_id=c.id
      AND (a.request_hash,a.status,coalesce(a.result,'{}'::jsonb)) IS DISTINCT FROM (b.request_hash,b.status,coalesce(b.result,'{}'::jsonb))
  ) THEN v_conflicts:=v_conflicts||'"idempotency_key_divergence"'::jsonb; END IF;
  IF EXISTS(SELECT 1 FROM public.user_identity_aliases WHERE source_user_id IN(s.id,c.id) OR canonical_user_id=s.id) THEN v_conflicts:=v_conflicts||'"existing_alias_relationship"'::jsonb; END IF;
  IF EXISTS(SELECT 1 FROM public.league_teams t JOIN public.league_team_players p
    ON p.team_id=t.id AND p.id=t.captain_player_id WHERE p.user_id=s.id) THEN
    v_warnings:=v_warnings||'"source_is_league_captain"'::jsonb;
  END IF;
  IF EXISTS(SELECT 1 FROM public.league_teams t JOIN public.league_team_players p
    ON p.team_id=t.id AND p.id=t.captain_player_id WHERE p.user_id=c.id) THEN
    v_warnings:=v_warnings||'"canonical_is_league_captain"'::jsonb;
  END IF;

  v_counts:=jsonb_build_object(
    'business_idempotency',(SELECT count(*) FROM public.business_operation_idempotency WHERE user_id=s.id),
    'communication_states',(SELECT count(*) FROM public.communication_user_states WHERE user_id=s.id),
    'communications',(SELECT count(*) FROM public.communications WHERE recipient_user_id=s.id),
    'league_rosters',(SELECT count(*) FROM public.league_team_players WHERE user_id=s.id),
    'league_historical_actors',(SELECT
       (SELECT count(*) FROM public.league_lineups WHERE submitted_by_user_id=s.id)+
       (SELECT count(*) FROM public.league_result_submissions WHERE submitted_by_user_id=s.id)+
       (SELECT count(*) FROM public.league_result_contests WHERE opened_by_user_id=s.id)+
       (SELECT count(*) FROM public.league_audit_events WHERE actor_user_id=s.id)),
    'league_notifications',(SELECT count(*) FROM public.league_notification_events WHERE recipient_user_id=s.id),
    'loyalty_memberships',(SELECT count(*) FROM public.loyalty_memberships WHERE user_id=s.id),
    'medical_certificates',(SELECT count(*) FROM public.medical_certificates WHERE user_id=s.id),
    'store_orders',(SELECT count(*) FROM public.store_orders WHERE user_id=s.id),
    'tournament_registrations',(SELECT count(*) FROM public.tournament_registrations WHERE user_id=s.id),
    'tournament_participants',(SELECT count(*) FROM public.tournament_run_participants WHERE user_id=s.id)
  );
  v_fp:=public.user_merge_fingerprint(s.id,c.id);
  RETURN jsonb_build_object(
    'source_user_id',s.id,'canonical_user_id',c.id,'fingerprint',v_fp,'conflicts',v_conflicts,'warnings',v_warnings,'counts',v_counts,
    'source',jsonb_build_object('full_name',s.full_name,'email',s.email,'phone',s.phone,'auth_linked',s.auth_user_id IS NOT NULL,'created_at',s.created_at,'updated_at',s.updated_at),
    'canonical',jsonb_build_object('full_name',c.full_name,'email',c.email,'phone',c.phone,'auth_linked',c.auth_user_id IS NOT NULL,'created_at',c.created_at,'updated_at',c.updated_at),
    'profile_policy',jsonb_build_object('full_name','canonical','email','canonical','phone','canonical','gender','canonical'),
    'league_notification_policy',jsonb_build_object('undelivered','reassign','delivered','preserve','new_delivery_side_effects',false),
    'consent_policy',jsonb_build_object('privacy','earliest evidence','terms','earliest evidence','age','earliest evidence','marketing','false wins'),
    'reversal',jsonb_build_object('profile','conditionally_reversible','ownership','conditionally_reversible','historical_actors','preserved')
  );
END $$;

CREATE FUNCTION public.create_user_merge_operation(
  p_source_user_id uuid,p_canonical_user_id uuid,p_actor_staff_id uuid,p_reason text,p_candidate_group_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_preview jsonb; v_operation uuid; v_request uuid:=gen_random_uuid();
BEGIN
  IF NULLIF(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'MOVI_AUTH_MERGE_REASON_REQUIRED' USING ERRCODE='22023'; END IF;
  v_preview:=public.preview_user_merge(p_source_user_id,p_canonical_user_id);
  INSERT INTO public.user_merge_operations(request_id,source_user_id,canonical_user_id,status,reason,created_by_staff_id,candidate_group_id,expected_fingerprint,preview,metadata)
  VALUES(v_request,p_source_user_id,p_canonical_user_id,'planned',p_reason,p_actor_staff_id,p_candidate_group_id,v_preview->>'fingerprint',v_preview,jsonb_build_object('stage',3))
  RETURNING id INTO v_operation;
  INSERT INTO public.user_merge_journal(operation_id,source_user_id,canonical_user_id,event_type,status,actor_staff_id,details)
  VALUES(v_operation,p_source_user_id,p_canonical_user_id,'requested','planned',p_actor_staff_id,jsonb_build_object('fingerprint',v_preview->>'fingerprint','preview',v_preview));
  RETURN jsonb_build_object('operation_id',v_operation,'preview',v_preview);
END $$;

CREATE FUNCTION public.execute_user_merge(p_operation_id uuid,p_expected_fingerprint text,p_actor_staff_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op public.user_merge_operations%rowtype; s public.users%rowtype; c public.users%rowtype; v_preview jsonb; v_before jsonb;
BEGIN
  SELECT * INTO op FROM public.user_merge_operations WHERE id=p_operation_id FOR UPDATE;
  IF op.id IS NULL THEN RAISE EXCEPTION 'MOVI_AUTH_MERGE_OPERATION_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF op.status='completed' THEN RETURN jsonb_build_object('state','completed','operation_id',op.id,'idempotent',true); END IF;
  IF op.status<>'planned' THEN RETURN jsonb_build_object('state',op.status,'operation_id',op.id); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('movi-user:'||least(op.source_user_id::text,op.canonical_user_id::text),0));
  PERFORM pg_advisory_xact_lock(hashtextextended('movi-user:'||greatest(op.source_user_id::text,op.canonical_user_id::text),0));
  SELECT * INTO s FROM public.users WHERE id=op.source_user_id FOR UPDATE;
  SELECT * INTO c FROM public.users WHERE id=op.canonical_user_id FOR UPDATE;
  v_preview:=public.preview_user_merge(s.id,c.id);
  IF p_expected_fingerprint IS DISTINCT FROM op.expected_fingerprint OR p_expected_fingerprint IS DISTINCT FROM v_preview->>'fingerprint' THEN
    RETURN jsonb_build_object('state','stale_preview','code','STALE_PREVIEW','current_preview',v_preview);
  END IF;
  IF jsonb_array_length(v_preview->'conflicts')>0 THEN
    UPDATE public.user_merge_operations SET status='failed',error_metadata=jsonb_build_object('conflicts',v_preview->'conflicts') WHERE id=op.id;
    INSERT INTO public.user_merge_journal(operation_id,source_user_id,canonical_user_id,event_type,status,actor_staff_id,details)
    VALUES(op.id,s.id,c.id,'failed','failed',p_actor_staff_id,jsonb_build_object('conflicts',v_preview->'conflicts'));
    RETURN jsonb_build_object('state','conflict','conflicts',v_preview->'conflicts');
  END IF;
  UPDATE public.user_merge_operations SET status='running',started_at=now() WHERE id=op.id;
  INSERT INTO public.user_merge_journal(operation_id,source_user_id,canonical_user_id,event_type,status,actor_staff_id,details)
  VALUES(op.id,s.id,c.id,'started','running',p_actor_staff_id,jsonb_build_object('fingerprint',p_expected_fingerprint));

  BEGIN
    v_before:=jsonb_build_object('source',to_jsonb(s)-'auth_user_id','canonical',to_jsonb(c)-'auth_user_id','counts',v_preview->'counts');

    DELETE FROM public.business_operation_idempotency a USING public.business_operation_idempotency b
      WHERE a.user_id=s.id AND b.user_id=c.id AND a.operation=b.operation AND a.idempotency_key=b.idempotency_key
        AND (a.request_hash,a.status,coalesce(a.result,'{}'::jsonb)) IS NOT DISTINCT FROM (b.request_hash,b.status,coalesce(b.result,'{}'::jsonb));
    UPDATE public.business_operation_idempotency SET user_id=c.id WHERE user_id=s.id;
    INSERT INTO public.user_merge_journal(operation_id,source_user_id,canonical_user_id,event_type,domain,status,actor_staff_id,details)
    VALUES(op.id,s.id,c.id,'domain_step','business_idempotency','completed',p_actor_staff_id,jsonb_build_object('reversal','conditionally_reversible'));

    UPDATE public.communication_user_states target SET
      read_at=(SELECT min(v) FROM unnest(ARRAY[target.read_at,source.read_at]) v WHERE v IS NOT NULL),
      dismissed_at=(SELECT min(v) FROM unnest(ARRAY[target.dismissed_at,source.dismissed_at]) v WHERE v IS NOT NULL)
    FROM public.communication_user_states source
    WHERE source.user_id=s.id AND target.user_id=c.id AND target.communication_id=source.communication_id;
    DELETE FROM public.communication_user_states source USING public.communication_user_states target
      WHERE source.user_id=s.id AND target.user_id=c.id AND target.communication_id=source.communication_id;
    UPDATE public.communication_user_states SET user_id=c.id WHERE user_id=s.id;
    UPDATE public.communications SET recipient_user_id=c.id WHERE recipient_user_id=s.id;
    INSERT INTO public.user_merge_journal(operation_id,source_user_id,canonical_user_id,event_type,domain,status,actor_staff_id,details)
    VALUES(op.id,s.id,c.id,'domain_step','communications','completed',p_actor_staff_id,jsonb_build_object('collision_policy','earliest read/dismiss evidence','delivery_side_effects',false));

    UPDATE public.league_team_players SET user_id=c.id,updated_at=now() WHERE user_id=s.id;
    UPDATE public.league_notification_events SET recipient_user_id=c.id,updated_at=now()
      WHERE recipient_user_id=s.id AND status<>'delivered';
    INSERT INTO public.user_merge_journal(operation_id,source_user_id,canonical_user_id,event_type,domain,status,actor_staff_id,details)
    VALUES(op.id,s.id,c.id,'domain_step','monday_league','completed',p_actor_staff_id,jsonb_build_object('captain_player_preserved',true,'historical_actor_ids','preserved','delivered_notifications','preserved'));

    UPDATE public.loyalty_memberships SET user_id=c.id,updated_at=now() WHERE user_id=s.id;
    INSERT INTO public.user_merge_journal(operation_id,source_user_id,canonical_user_id,event_type,domain,status,actor_staff_id,details)
    VALUES(op.id,s.id,c.id,'domain_step','moviback','completed',p_actor_staff_id,jsonb_build_object('dual_membership','blocked in preview','ledger','preserved'));

    UPDATE public.medical_certificates SET user_id=c.id WHERE user_id=s.id;
    UPDATE public.store_orders SET user_id=c.id WHERE user_id=s.id;
    UPDATE public.tournament_registrations SET user_id=c.id WHERE user_id=s.id;
    UPDATE public.tournament_run_participants SET user_id=c.id WHERE user_id=s.id;
    INSERT INTO public.user_merge_journal(operation_id,source_user_id,canonical_user_id,event_type,domain,status,actor_staff_id,details)
    VALUES
      (op.id,s.id,c.id,'domain_step','medical_certificates','completed',p_actor_staff_id,jsonb_build_object('evidence','preserved')),
      (op.id,s.id,c.id,'domain_step','store','completed',p_actor_staff_id,jsonb_build_object('snapshots','unchanged')),
      (op.id,s.id,c.id,'domain_step','tournaments','completed',p_actor_staff_id,jsonb_build_object('phones_names_player_keys','unchanged'));

    UPDATE public.users SET
      privacy_accepted_at=(SELECT min(v) FROM unnest(ARRAY[c.privacy_accepted_at,s.privacy_accepted_at]) v WHERE v IS NOT NULL),
      terms_accepted_at=(SELECT min(v) FROM unnest(ARRAY[c.terms_accepted_at,s.terms_accepted_at]) v WHERE v IS NOT NULL),
      age_confirmed_at=(SELECT min(v) FROM unnest(ARRAY[c.age_confirmed_at,s.age_confirmed_at]) v WHERE v IS NOT NULL),
      marketing_accepted=(c.marketing_accepted AND s.marketing_accepted),
      marketing_accepted_at=CASE WHEN c.marketing_accepted AND s.marketing_accepted THEN
        (SELECT min(v) FROM unnest(ARRAY[c.marketing_accepted_at,s.marketing_accepted_at]) v WHERE v IS NOT NULL) ELSE NULL END,
      updated_at=now() WHERE id=c.id;
    UPDATE public.users SET identity_status='merged',merged_into_user_id=c.id,merged_at=now(),updated_at=now() WHERE id=s.id;
    INSERT INTO public.user_identity_aliases(source_user_id,canonical_user_id,status,reason,merged_at,created_by_staff_id,merge_operation_id,metadata)
    VALUES(s.id,c.id,'active',op.reason,now(),p_actor_staff_id,op.id,jsonb_build_object('authorization',false,'stage',3));
    INSERT INTO public.user_merge_journal(operation_id,source_user_id,canonical_user_id,event_type,domain,status,actor_staff_id,details)
    VALUES(op.id,s.id,c.id,'domain_step','profile_and_consent','completed',p_actor_staff_id,jsonb_build_object('before',v_before,'marketing_policy','false wins','alias_authorizes',false,'reversal','conditionally_reversible'));

    UPDATE public.user_merge_operations SET status='completed',completed_at=now(),metadata=metadata||jsonb_build_object('executed_by',p_actor_staff_id) WHERE id=op.id;
    UPDATE public.user_duplicate_review_groups g SET
      state=CASE WHEN EXISTS(
        SELECT 1 FROM public.user_duplicate_review_members m JOIN public.users u ON u.id=m.user_id
        WHERE m.group_id=g.id AND m.included AND m.user_id<>c.id AND u.identity_status='active'
      ) THEN 'approved' ELSE 'merged' END,
      canonical_user_id=c.id,reviewed_by_staff_id=p_actor_staff_id,updated_at=now()
      WHERE g.id=op.candidate_group_id;
    INSERT INTO public.user_merge_journal(operation_id,source_user_id,canonical_user_id,event_type,status,actor_staff_id,details)
    VALUES(op.id,s.id,c.id,'completed','completed',p_actor_staff_id,jsonb_build_object('fingerprint',p_expected_fingerprint));
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.user_merge_operations SET status='failed',error_metadata=jsonb_build_object('sqlstate',SQLSTATE,'message',SQLERRM) WHERE id=op.id;
    INSERT INTO public.user_merge_journal(operation_id,source_user_id,canonical_user_id,event_type,status,actor_staff_id,details,error_metadata)
    VALUES(op.id,s.id,c.id,'failed','failed',p_actor_staff_id,jsonb_build_object('rolled_back',true),jsonb_build_object('sqlstate',SQLSTATE,'message',SQLERRM));
    RETURN jsonb_build_object('state','failed','operation_id',op.id);
  END;
  RETURN jsonb_build_object('state','completed','operation_id',op.id,'canonical_user_id',c.id,'idempotent',false);
END $$;

ALTER TABLE public.user_duplicate_review_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_duplicate_review_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_duplicate_review_groups,public.user_duplicate_review_members FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.user_duplicate_review_groups TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.user_duplicate_review_members TO service_role;

REVOKE ALL ON FUNCTION public.prevent_merged_user_reactivation() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.user_merge_history_score(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.refresh_user_duplicate_candidates(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.user_merge_fingerprint(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.preview_user_merge(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_user_merge_operation(uuid,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.execute_user_merge(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.user_merge_history_score(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_user_duplicate_candidates(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_merge_fingerprint(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.preview_user_merge(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_user_merge_operation(uuid,uuid,uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.execute_user_merge(uuid,text,uuid) TO service_role;

COMMENT ON FUNCTION public.execute_user_merge(uuid,text,uuid) IS
  'Service-only, admin-authorized pairwise merge. Alias rows never authorize legacy sessions.';
