-- MOVI Auth 2.0 Stage 4: operational review, dry-run reporting,
-- reviewed MoviBack reconciliation, and post-merge verification.
-- This migration scans or merges no user by itself.

CREATE TABLE public.user_duplicate_scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  actor_staff_id uuid REFERENCES public.staff_users(id) ON DELETE SET NULL,
  groups_discovered integer NOT NULL DEFAULT 0,
  groups_stale integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(summary)='object'),
  error_metadata jsonb CHECK (error_metadata IS NULL OR jsonb_typeof(error_metadata)='object')
);

ALTER TABLE public.user_duplicate_review_groups
  ADD COLUMN candidate_fingerprint text,
  ADD COLUMN is_stale boolean NOT NULL DEFAULT false,
  ADD COLUMN stale_at timestamptz,
  ADD COLUMN stale_reason text,
  ADD COLUMN recommendation_reasons jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(recommendation_reasons)='array'),
  ADD COLUMN review_config jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(review_config)='object'),
  ADD COLUMN last_scan_run_id uuid REFERENCES public.user_duplicate_scan_runs(id) ON DELETE SET NULL,
  ADD CONSTRAINT user_duplicate_review_groups_stale_shape CHECK (
    (NOT is_stale AND stale_at IS NULL AND stale_reason IS NULL)
    OR (is_stale AND stale_at IS NOT NULL AND btrim(coalesce(stale_reason,''))<>'')
  );

CREATE INDEX user_duplicate_review_groups_queue_idx
  ON public.user_duplicate_review_groups(state,is_stale,confidence,updated_at DESC);

CREATE TABLE public.user_duplicate_review_decisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.user_duplicate_review_groups(id) ON DELETE RESTRICT,
  actor_staff_id uuid REFERENCES public.staff_users(id) ON DELETE SET NULL,
  decision text NOT NULL CHECK (decision IN ('approved','rejected','manual_only','conflict','pending_review')),
  canonical_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  source_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  included_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  field_winners jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(field_winners)='object'),
  note text,
  before_state jsonb NOT NULL CHECK (jsonb_typeof(before_state)='object'),
  after_state jsonb NOT NULL CHECK (jsonb_typeof(after_state)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_duplicate_review_decisions_group_idx
  ON public.user_duplicate_review_decisions(group_id,id DESC);

CREATE TABLE public.user_moviback_reconciliation_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL UNIQUE REFERENCES public.user_merge_operations(id) ON DELETE RESTRICT,
  source_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  canonical_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  source_membership_id uuid NOT NULL,
  canonical_membership_id uuid NOT NULL,
  preview_fingerprint text NOT NULL,
  source_membership_summary jsonb NOT NULL CHECK (jsonb_typeof(source_membership_summary)='object'),
  canonical_membership_summary jsonb NOT NULL CHECK (jsonb_typeof(canonical_membership_summary)='object'),
  ledger_summary jsonb NOT NULL CHECK (jsonb_typeof(ledger_summary)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_moviback_reconciliation_distinct_memberships
    CHECK (source_membership_id<>canonical_membership_id)
);

ALTER TABLE public.user_merge_operations
  DROP CONSTRAINT user_merge_operations_status_check,
  ADD CONSTRAINT user_merge_operations_status_check CHECK (
    status IN ('planned','running','completed','failed','rolled_back','needs_review')
  );

CREATE FUNCTION public.prevent_stage4_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'MOVI_AUTH_STAGE4_AUDIT_IMMUTABLE' USING ERRCODE='55000';
END $$;

CREATE TRIGGER user_duplicate_review_decisions_immutable
BEFORE UPDATE OR DELETE ON public.user_duplicate_review_decisions
FOR EACH ROW EXECUTE FUNCTION public.prevent_stage4_audit_mutation();

CREATE TRIGGER user_moviback_reconciliation_evidence_immutable
BEFORE UPDATE OR DELETE ON public.user_moviback_reconciliation_evidence
FOR EACH ROW EXECUTE FUNCTION public.prevent_stage4_audit_mutation();

CREATE FUNCTION public.user_duplicate_candidate_fingerprint(p_group_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT md5(coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,
    'included',m.included,
    'updated_at',u.updated_at,
    'status',u.identity_status,
    'auth',u.auth_user_id,
    'email',public.normalize_user_email(u.email),
    'phone',public.normalize_user_mobile_e164(u.phone),
    'memberships',(SELECT count(*) FROM public.loyalty_memberships x WHERE x.user_id=u.id),
    'league',(SELECT count(*) FROM public.league_team_players x WHERE x.user_id=u.id),
    'orders',(SELECT count(*) FROM public.store_orders x WHERE x.user_id=u.id),
    'registrations',(SELECT count(*) FROM public.tournament_registrations x WHERE x.user_id=u.id),
    'participants',(SELECT count(*) FROM public.tournament_run_participants x WHERE x.user_id=u.id),
    'medical',(SELECT count(*) FROM public.medical_certificates x WHERE x.user_id=u.id),
    'communications',(SELECT count(*) FROM public.communication_user_states x WHERE x.user_id=u.id)
  ) ORDER BY u.id)::text,'[]'))
  FROM public.user_duplicate_review_members m
  JOIN public.users u ON u.id=m.user_id
  WHERE m.group_id=p_group_id;
$$;

CREATE FUNCTION public.user_duplicate_recommendation_reasons(p_group_id uuid,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u public.users%rowtype; v jsonb:='[]'; n integer;
BEGIN
  SELECT * INTO u FROM public.users WHERE id=p_user_id;
  IF u.id IS NULL THEN RETURN v; END IF;
  IF u.auth_user_id IS NOT NULL THEN v:=v||jsonb_build_array('già collegato a Auth'); END IF;
  SELECT count(*) INTO n FROM public.loyalty_memberships WHERE user_id=u.id;
  IF n>0 THEN v:=v||jsonb_build_array('possiede una membership MoviBack'); END IF;
  SELECT count(*) INTO n FROM public.tournament_registrations WHERE user_id=u.id;
  IF n>0 THEN v:=v||jsonb_build_array(format('ha %s registrazioni torneo',n)); END IF;
  SELECT count(*) INTO n FROM public.store_orders WHERE user_id=u.id;
  IF n>0 THEN v:=v||jsonb_build_array(format('ha %s ordini Store',n)); END IF;
  SELECT count(*) INTO n FROM public.league_team_players WHERE user_id=u.id;
  IF n>0 THEN v:=v||jsonb_build_array('ha identità sportiva Monday League'); END IF;
  IF u.privacy_accepted_at IS NOT NULL AND u.terms_accepted_at IS NOT NULL AND u.age_confirmed_at IS NOT NULL THEN
    v:=v||jsonb_build_array('ha evidenza completa dei consensi obbligatori');
  END IF;
  IF u.created_at=(SELECT min(x.created_at) FROM public.user_duplicate_review_members m JOIN public.users x ON x.id=m.user_id WHERE m.group_id=p_group_id) THEN
    v:=v||jsonb_build_array('è il profilo più antico del gruppo');
  END IF;
  IF jsonb_array_length(v)=0 THEN v:=jsonb_build_array('ha il miglior ordinamento deterministico disponibile'); END IF;
  RETURN v;
END $$;

CREATE FUNCTION public.run_user_duplicate_scan(p_actor_staff_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_run uuid; v_started timestamptz:=now(); v_refresh jsonb; g record;
  v_old text; v_new text; v_stale integer:=0; v_discovered integer:=0; v_force_manual boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('movi-auth-stage4-scan',0));
  INSERT INTO public.user_duplicate_scan_runs(actor_staff_id) VALUES(p_actor_staff_id) RETURNING id INTO v_run;
  BEGIN
    v_refresh:=public.refresh_user_duplicate_candidates(p_actor_staff_id);
    v_discovered:=coalesce((v_refresh->>'groups_discovered')::integer,0);
    FOR g IN SELECT * FROM public.user_duplicate_review_groups LOOP
      IF g.last_discovered_at<v_started AND g.state<>'merged' THEN
        UPDATE public.user_duplicate_review_groups SET is_stale=true,stale_at=now(),
          stale_reason='Il gruppo non è stato ritrovato dall’ultima scansione',last_scan_run_id=v_run,updated_at=now()
        WHERE id=g.id;
        v_stale:=v_stale+1;
        CONTINUE;
      END IF;
      v_old:=g.candidate_fingerprint;
      v_new:=public.user_duplicate_candidate_fingerprint(g.id);
      SELECT
        (g.signal_type='manual')
        OR (g.signal_type='normalized_email' AND split_part(coalesce(g.signal_value,''),'@',1) IN
          ('info','admin','segreteria','booking','prenotazioni','sport','club','associazione'))
        OR EXISTS(
          SELECT 1 FROM public.user_duplicate_review_members m JOIN public.users u ON u.id=m.user_id
          WHERE m.group_id=g.id AND u.phone IS NOT NULL AND public.normalize_user_mobile_e164(u.phone) IS NULL
        ) INTO v_force_manual;
      UPDATE public.user_duplicate_review_groups SET
        candidate_fingerprint=v_new,
        recommendation_reasons=public.user_duplicate_recommendation_reasons(g.id,g.recommended_user_id),
        is_stale=(v_old IS NOT NULL AND v_old IS DISTINCT FROM v_new),
        stale_at=CASE WHEN v_old IS NOT NULL AND v_old IS DISTINCT FROM v_new THEN now() ELSE NULL END,
        stale_reason=CASE WHEN v_old IS NOT NULL AND v_old IS DISTINCT FROM v_new THEN 'I dati identità o i riferimenti dominio sono cambiati' ELSE NULL END,
        state=CASE WHEN state IN('merged','rejected','conflict','approved') THEN state
                   WHEN v_force_manual THEN 'manual_only' ELSE state END,
        confidence=CASE WHEN v_force_manual THEN 'manual-review' ELSE confidence END,
        warning_flags=CASE WHEN v_force_manual AND NOT warning_flags ? 'manual_identity_review'
          THEN warning_flags||'["manual_identity_review"]'::jsonb ELSE warning_flags END,
        last_scan_run_id=v_run,updated_at=now()
      WHERE id=g.id;
      IF v_old IS NOT NULL AND v_old IS DISTINCT FROM v_new THEN v_stale:=v_stale+1; END IF;
    END LOOP;
    UPDATE public.user_duplicate_scan_runs SET status='completed',completed_at=now(),
      groups_discovered=v_discovered,groups_stale=v_stale,
      summary=jsonb_build_object('groups_discovered',v_discovered,'groups_stale',v_stale)
    WHERE id=v_run;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.user_duplicate_scan_runs SET status='failed',completed_at=now(),
      error_metadata=jsonb_build_object('sqlstate',SQLSTATE,'message',SQLERRM) WHERE id=v_run;
    RETURN jsonb_build_object('state','failed','scan_run_id',v_run);
  END;
  RETURN jsonb_build_object('state','completed','scan_run_id',v_run,'groups_discovered',v_discovered,'groups_stale',v_stale);
END $$;

CREATE FUNCTION public.save_user_duplicate_review_decision(
  p_group_id uuid,p_state text,p_canonical_user_id uuid,p_source_user_id uuid,
  p_included_user_ids uuid[],p_field_winners jsonb,p_note text,p_actor_staff_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE g public.user_duplicate_review_groups%rowtype; v_before jsonb; v_after jsonb;
  v_auth_users uuid[]; v_key text; v_winner uuid;
BEGIN
  IF p_state NOT IN('pending_review','approved','rejected','conflict','manual_only') THEN
    RAISE EXCEPTION 'MOVI_AUTH_REVIEW_STATE_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT * INTO g FROM public.user_duplicate_review_groups WHERE id=p_group_id FOR UPDATE;
  IF g.id IS NULL THEN RAISE EXCEPTION 'MOVI_AUTH_REVIEW_GROUP_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(coalesce(p_included_user_ids,'{}'::uuid[])) x
    WHERE NOT EXISTS(SELECT 1 FROM public.user_duplicate_review_members m WHERE m.group_id=g.id AND m.user_id=x)) THEN
    RAISE EXCEPTION 'MOVI_AUTH_REVIEW_MEMBER_INVALID' USING ERRCODE='22023';
  END IF;
  IF p_state='approved' THEN
    IF g.is_stale THEN RAISE EXCEPTION 'MOVI_AUTH_REVIEW_GROUP_STALE' USING ERRCODE='55000'; END IF;
    IF p_canonical_user_id IS NULL OR p_source_user_id IS NULL OR p_canonical_user_id=p_source_user_id
       OR NOT p_canonical_user_id=ANY(p_included_user_ids) OR NOT p_source_user_id=ANY(p_included_user_ids)
       OR cardinality(p_included_user_ids)<2 THEN
      RAISE EXCEPTION 'MOVI_AUTH_REVIEW_SELECTION_INVALID' USING ERRCODE='22023';
    END IF;
    IF EXISTS(SELECT 1 FROM public.users WHERE id=ANY(p_included_user_ids) AND identity_status<>'active') THEN
      RAISE EXCEPTION 'MOVI_AUTH_REVIEW_INACTIVE_MEMBER' USING ERRCODE='55000';
    END IF;
    SELECT array_agg(id ORDER BY id) INTO v_auth_users FROM public.users
      WHERE id=ANY(p_included_user_ids) AND auth_user_id IS NOT NULL;
    IF cardinality(coalesce(v_auth_users,'{}'::uuid[]))>1 THEN RAISE EXCEPTION 'MOVI_AUTH_MULTIPLE_AUTH_IDENTITIES' USING ERRCODE='55000'; END IF;
    IF cardinality(coalesce(v_auth_users,'{}'::uuid[]))=1 AND v_auth_users[1]<>p_canonical_user_id THEN
      RAISE EXCEPTION 'MOVI_AUTH_LINKED_PROFILE_MUST_BE_CANONICAL' USING ERRCODE='55000';
    END IF;
    FOR v_key IN SELECT unnest(ARRAY['full_name','phone','email','gender']) LOOP
      v_winner:=nullif(p_field_winners->>v_key,'')::uuid;
      IF v_winner IS NOT NULL AND NOT v_winner=ANY(p_included_user_ids) THEN
        RAISE EXCEPTION 'MOVI_AUTH_FIELD_WINNER_INVALID' USING ERRCODE='22023';
      END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM public.users WHERE id=p_canonical_user_id AND auth_user_id IS NOT NULL)
       AND nullif(p_field_winners->>'email','')::uuid IS DISTINCT FROM p_canonical_user_id THEN
      RAISE EXCEPTION 'MOVI_AUTH_EMAIL_WINNER_MUST_BE_AUTH_CANONICAL' USING ERRCODE='55000';
    END IF;
  END IF;
  v_before:=jsonb_build_object('state',g.state,'canonical_user_id',g.canonical_user_id,'review_config',g.review_config);
  UPDATE public.user_duplicate_review_members SET included=(user_id=ANY(coalesce(p_included_user_ids,'{}'::uuid[]))) WHERE group_id=g.id;
  UPDATE public.user_duplicate_review_groups SET state=p_state,canonical_user_id=p_canonical_user_id,
    reviewed_by_staff_id=p_actor_staff_id,review_note=nullif(btrim(coalesce(p_note,'')),''),
    review_config=jsonb_build_object('source_user_id',p_source_user_id,'field_winners',coalesce(p_field_winners,'{}'::jsonb)),
    updated_at=now() WHERE id=g.id;
  SELECT jsonb_build_object('state',state,'canonical_user_id',canonical_user_id,'review_config',review_config)
    INTO v_after FROM public.user_duplicate_review_groups WHERE id=g.id;
  INSERT INTO public.user_duplicate_review_decisions(group_id,actor_staff_id,decision,canonical_user_id,source_user_id,
    included_user_ids,field_winners,note,before_state,after_state)
  VALUES(g.id,p_actor_staff_id,p_state,p_canonical_user_id,p_source_user_id,coalesce(p_included_user_ids,'{}'::uuid[]),
    coalesce(p_field_winners,'{}'::jsonb),nullif(btrim(coalesce(p_note,'')),''),v_before,v_after);
  RETURN jsonb_build_object('state',p_state,'group_id',g.id);
END $$;

CREATE FUNCTION public.preview_dual_moviback_reconciliation(p_source_user_id uuid,p_canonical_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.loyalty_memberships%rowtype; c public.loyalty_memberships%rowtype;
  sc integer; cc integer; sb bigint; cb bigint; blockers jsonb:='[]'; fp text;
  st integer; ct integer; sr integer; cr integer; sp integer; cp integer;
BEGIN
  SELECT count(*) INTO sc FROM public.loyalty_memberships WHERE user_id=p_source_user_id;
  SELECT count(*) INTO cc FROM public.loyalty_memberships WHERE user_id=p_canonical_user_id;
  IF sc=0 OR cc=0 THEN RETURN jsonb_build_object('applicable',false,'safe',true,'blockers','[]'::jsonb); END IF;
  IF sc<>1 OR cc<>1 THEN RETURN jsonb_build_object('applicable',true,'safe',false,'blockers','["membership_cardinality_unsupported"]'::jsonb); END IF;
  SELECT * INTO s FROM public.loyalty_memberships WHERE user_id=p_source_user_id;
  SELECT * INTO c FROM public.loyalty_memberships WHERE user_id=p_canonical_user_id;
  SELECT coalesce(sum(points_delta),0),count(*) INTO sb,st FROM public.loyalty_transactions WHERE membership_id=s.id;
  SELECT coalesce(sum(points_delta),0),count(*) INTO cb,ct FROM public.loyalty_transactions WHERE membership_id=c.id;
  SELECT count(*) INTO sr FROM public.reward_redemptions WHERE membership_id=s.id;
  SELECT count(*) INTO cr FROM public.reward_redemptions WHERE membership_id=c.id;
  SELECT count(*) INTO sp FROM public.loyalty_user_promos WHERE membership_id=s.id;
  SELECT count(*) INTO cp FROM public.loyalty_user_promos WHERE membership_id=c.id;
  IF s.status<>'approved' OR c.status<>'approved' THEN blockers:=blockers||'"membership_not_approved"'::jsonb; END IF;
  IF nullif(upper(btrim(s.tax_code)),'') IS DISTINCT FROM nullif(upper(btrim(c.tax_code)),'') THEN blockers:=blockers||'"tax_code_mismatch"'::jsonb; END IF;
  IF s.membership_type IS NOT NULL AND c.membership_type IS NOT NULL AND s.membership_type<>c.membership_type THEN blockers:=blockers||'"membership_type_mismatch"'::jsonb; END IF;
  IF EXISTS(SELECT 1 FROM public.loyalty_transactions t WHERE t.membership_id IN(s.id,c.id)
    AND t.related_redemption_id IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public.reward_redemptions r WHERE r.id=t.related_redemption_id AND r.membership_id=t.membership_id)) THEN
    blockers:=blockers||'"ledger_redemption_mismatch"'::jsonb;
  END IF;
  fp:=md5(jsonb_build_object('source',jsonb_build_object('id',s.id,'updated_at',s.updated_at,'status',s.status,'type',s.membership_type,'balance',sb,'transactions',st,'redemptions',sr,'promos',sp),
    'canonical',jsonb_build_object('id',c.id,'updated_at',c.updated_at,'status',c.status,'type',c.membership_type,'balance',cb,'transactions',ct,'redemptions',cr,'promos',cp),
    'transaction_ids',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') FROM public.loyalty_transactions WHERE membership_id IN(s.id,c.id)),
    'redemption_ids',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') FROM public.reward_redemptions WHERE membership_id IN(s.id,c.id)))::text);
  RETURN jsonb_build_object('applicable',true,'safe',jsonb_array_length(blockers)=0,'blockers',blockers,'fingerprint',fp,
    'source_membership',jsonb_build_object('id',s.id,'code',s.membership_code,'status',s.status,'type',s.membership_type,'balance',sb,'transactions',st,'redemptions',sr,'promos',sp),
    'canonical_membership',jsonb_build_object('id',c.id,'code',c.membership_code,'status',c.status,'type',c.membership_type,'balance',cb,'transactions',ct,'redemptions',cr,'promos',cp),
    'expected_balance',sb+cb,'tax_code_match',nullif(upper(btrim(s.tax_code)),'') IS NOT DISTINCT FROM nullif(upper(btrim(c.tax_code)),''),
    'policy',jsonb_build_object('balance','sum of immutable ledger deltas','transactions','move','redemptions','move without duplication','source_membership','archive evidence then remove'));
END $$;

CREATE FUNCTION public.preview_reviewed_user_merge(p_group_id uuid,p_source_user_id uuid,p_canonical_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE g public.user_duplicate_review_groups%rowtype; base jsonb; movi jsonb; blockers jsonb; consent jsonb;
  pair_counts jsonb; result jsonb; fp text;
BEGIN
  SELECT * INTO g FROM public.user_duplicate_review_groups WHERE id=p_group_id;
  IF g.id IS NULL THEN RAISE EXCEPTION 'MOVI_AUTH_REVIEW_GROUP_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_duplicate_review_members WHERE group_id=g.id AND user_id=p_source_user_id AND included)
     OR NOT EXISTS(SELECT 1 FROM public.user_duplicate_review_members WHERE group_id=g.id AND user_id=p_canonical_user_id AND included) THEN
    RAISE EXCEPTION 'MOVI_AUTH_REVIEW_MEMBER_NOT_INCLUDED' USING ERRCODE='22023';
  END IF;
  base:=public.preview_user_merge(p_source_user_id,p_canonical_user_id);
  movi:=public.preview_dual_moviback_reconciliation(p_source_user_id,p_canonical_user_id);
  SELECT coalesce(jsonb_agg(value),'[]'::jsonb) INTO blockers FROM jsonb_array_elements(base->'conflicts') value
    WHERE NOT (value='"dual_loyalty_membership"'::jsonb AND coalesce((movi->>'safe')::boolean,false));
  IF coalesce((movi->>'applicable')::boolean,false) AND NOT coalesce((movi->>'safe')::boolean,false) THEN
    blockers:=blockers||coalesce(movi->'blockers','[]'::jsonb);
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.league_team_players s
    JOIN public.league_team_players c ON c.user_id=p_canonical_user_id AND c.is_active
    WHERE s.user_id=p_source_user_id AND s.is_active AND s.team_id<>c.team_id
  ) THEN blockers:=blockers||'"distinct_active_league_roles"'::jsonb; END IF;
  IF g.is_stale THEN blockers:=blockers||'"candidate_group_stale"'::jsonb; END IF;
  IF g.state<>'approved' THEN blockers:=blockers||'"admin_approval_required"'::jsonb; END IF;
  SELECT jsonb_build_object(
    'privacy_accepted_at',(SELECT min(v) FROM unnest(ARRAY[c.privacy_accepted_at,s.privacy_accepted_at]) v WHERE v IS NOT NULL),
    'terms_accepted_at',(SELECT min(v) FROM unnest(ARRAY[c.terms_accepted_at,s.terms_accepted_at]) v WHERE v IS NOT NULL),
    'age_confirmed_at',(SELECT min(v) FROM unnest(ARRAY[c.age_confirmed_at,s.age_confirmed_at]) v WHERE v IS NOT NULL),
    'marketing_accepted',(c.marketing_accepted AND s.marketing_accepted),
    'marketing_accepted_at',CASE WHEN c.marketing_accepted AND s.marketing_accepted THEN
      (SELECT min(v) FROM unnest(ARRAY[c.marketing_accepted_at,s.marketing_accepted_at]) v WHERE v IS NOT NULL) ELSE NULL END,
    'explanation','Marketing resta attivo solo se entrambi i profili hanno opt-in valido; non è forzabile dal merge'
  ) INTO consent FROM public.users s CROSS JOIN public.users c WHERE s.id=p_source_user_id AND c.id=p_canonical_user_id;
  pair_counts:=jsonb_build_object(
    'store_orders',(SELECT count(*) FROM public.store_orders WHERE user_id IN(p_source_user_id,p_canonical_user_id)),
    'open_store_orders',(SELECT count(*) FROM public.store_orders WHERE user_id IN(p_source_user_id,p_canonical_user_id) AND status NOT IN('delivered','cancelled')),
    'tournament_registrations',(SELECT count(*) FROM public.tournament_registrations WHERE user_id IN(p_source_user_id,p_canonical_user_id)),
    'tournament_participants',(SELECT count(*) FROM public.tournament_run_participants WHERE user_id IN(p_source_user_id,p_canonical_user_id)),
    'medical_certificates',(SELECT count(*) FROM public.medical_certificates WHERE user_id IN(p_source_user_id,p_canonical_user_id)),
    'communication_states',(SELECT count(*) FROM public.communication_user_states WHERE user_id IN(p_source_user_id,p_canonical_user_id)),
    'communications',(SELECT count(*) FROM public.communications WHERE recipient_user_id IN(p_source_user_id,p_canonical_user_id)),
    'league_rosters',(SELECT count(*) FROM public.league_team_players WHERE user_id IN(p_source_user_id,p_canonical_user_id)),
    'redemption_linked_orders',(SELECT count(*) FROM public.store_orders WHERE user_id IN(p_source_user_id,p_canonical_user_id) AND related_redemption_id IS NOT NULL)
  );
  result:=jsonb_build_object('group_id',g.id,'source_user_id',p_source_user_id,'canonical_user_id',p_canonical_user_id,
    'confidence',g.confidence,'recommendation',jsonb_build_object('user_id',g.recommended_user_id,'reasons',g.recommendation_reasons),
    'blockers',blockers,'warnings',(base->'warnings')||g.warning_flags,'domain_moves',base->'counts','pair_counts',pair_counts,
    'moviback',movi,'fields_to_keep',coalesce(g.review_config->'field_winners','{}'::jsonb),
    'consent_outcome',consent,
    'auth_outcome',CASE WHEN base->'canonical'->>'auth_linked'='true' THEN 'canonical_auth_preserved' ELSE 'remains_unlinked' END,
    'expected_alias',jsonb_build_object('source_user_id',p_source_user_id,'canonical_user_id',p_canonical_user_id,'authorizes',false),
    'expected_soft_merge',jsonb_build_object('source_status','merged','source_immutable',true),
    'reversal',base->'reversal');
  fp:=md5((result||jsonb_build_object('candidate_fingerprint',g.candidate_fingerprint,'base_fingerprint',base->>'fingerprint'))::text);
  RETURN result||jsonb_build_object('fingerprint',fp,'base_preview',base);
END $$;

CREATE FUNCTION public.user_migration_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  WITH totals AS (
    SELECT count(*) total_users,count(*) FILTER(WHERE identity_status='active' AND auth_user_id IS NULL) unlinked,
      count(*) FILTER(WHERE identity_status='active' AND auth_user_id IS NOT NULL) auth_linked,
      count(*) FILTER(WHERE identity_status='merged') merged_users FROM public.users
  ), groups AS (
    SELECT count(*) FILTER(WHERE state='pending_review') pending,
      count(*) FILTER(WHERE state='manual_only') manual_only,
      count(*) FILTER(WHERE state='merged') merged_groups,
      count(*) FILTER(WHERE state='conflict') conflicts,
      count(*) FILTER(WHERE is_stale) stale,
      count(*) FILTER(WHERE state='approved') approved,
      count(*) FILTER(WHERE state='rejected') rejected
    FROM public.user_duplicate_review_groups
  ), resolved AS (
    SELECT count(*) n FROM public.users u WHERE u.identity_status='merged' OR (
      u.identity_status='active' AND u.auth_user_id IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM public.user_duplicate_review_members m JOIN public.user_duplicate_review_groups g ON g.id=m.group_id
        WHERE m.user_id=u.id AND m.included AND (g.state IN('pending_review','manual_only','conflict','approved') OR g.is_stale)
      )
    )
  ) SELECT jsonb_build_object('total_users',t.total_users,'unlinked_users',t.unlinked,'auth_linked_users',t.auth_linked,
    'merged_users',t.merged_users,'pending_groups',g.pending,'manual_only_groups',g.manual_only,'merged_groups',g.merged_groups,
    'conflicts',g.conflicts,'approved_groups',g.approved,'rejected_groups',g.rejected,'stale_groups',g.stale,
    'completion_percent',CASE WHEN t.total_users=0 THEN 100 ELSE round(100.0*r.n/t.total_users,1) END,
    'completion_definition','merged profiles plus active Auth-linked profiles with no unresolved or stale candidate group')
  FROM totals t CROSS JOIN groups g CROSS JOIN resolved r;
$$;

CREATE FUNCTION public.duplicate_migration_dry_run(p_group_id uuid DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE g record; source_id uuid; canonical_id uuid;
BEGIN
  FOR g IN SELECT * FROM public.user_duplicate_review_groups WHERE p_group_id IS NULL OR id=p_group_id ORDER BY updated_at DESC LOOP
    canonical_id:=coalesce(g.canonical_user_id,g.recommended_user_id);
    IF canonical_id IS NULL THEN CONTINUE; END IF;
    FOR source_id IN SELECT m.user_id FROM public.user_duplicate_review_members m JOIN public.users u ON u.id=m.user_id
      WHERE m.group_id=g.id AND m.included AND m.user_id<>canonical_id AND u.identity_status='active' ORDER BY m.user_id LOOP
      RETURN NEXT public.preview_reviewed_user_merge(g.id,source_id,canonical_id);
    END LOOP;
  END LOOP;
END $$;

CREATE FUNCTION public.create_reviewed_user_merge_operation(
  p_group_id uuid,p_source_user_id uuid,p_actor_staff_id uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE g public.user_duplicate_review_groups%rowtype; preview jsonb; op_id uuid;
BEGIN
  SELECT * INTO g FROM public.user_duplicate_review_groups WHERE id=p_group_id FOR UPDATE;
  IF g.id IS NULL OR g.state<>'approved' OR g.canonical_user_id IS NULL THEN RAISE EXCEPTION 'MOVI_AUTH_REVIEW_NOT_APPROVED' USING ERRCODE='55000'; END IF;
  IF g.is_stale THEN RAISE EXCEPTION 'MOVI_AUTH_REVIEW_GROUP_STALE' USING ERRCODE='55000'; END IF;
  IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'MOVI_AUTH_MERGE_REASON_REQUIRED' USING ERRCODE='22023'; END IF;
  IF nullif(g.review_config->>'source_user_id','')::uuid IS DISTINCT FROM p_source_user_id THEN
    RAISE EXCEPTION 'MOVI_AUTH_REVIEW_SOURCE_CHANGED' USING ERRCODE='55000';
  END IF;
  preview:=public.preview_reviewed_user_merge(g.id,p_source_user_id,g.canonical_user_id);
  IF jsonb_array_length(preview->'blockers')>0 THEN RAISE EXCEPTION 'MOVI_AUTH_REVIEW_PREFLIGHT_BLOCKED: %',preview->'blockers' USING ERRCODE='55000'; END IF;
  INSERT INTO public.user_merge_operations(request_id,source_user_id,canonical_user_id,status,reason,created_by_staff_id,
    candidate_group_id,expected_fingerprint,preview,metadata)
  VALUES(gen_random_uuid(),p_source_user_id,g.canonical_user_id,'planned',p_reason,p_actor_staff_id,g.id,preview->>'fingerprint',preview,
    jsonb_build_object('stage',4,'stage4_preview',preview)) RETURNING id INTO op_id;
  INSERT INTO public.user_merge_journal(operation_id,source_user_id,canonical_user_id,event_type,status,actor_staff_id,details)
  VALUES(op_id,p_source_user_id,g.canonical_user_id,'requested','planned',p_actor_staff_id,
    jsonb_build_object('stage',4,'fingerprint',preview->>'fingerprint','preview',preview));
  RETURN jsonb_build_object('operation_id',op_id,'preview',preview);
END $$;

CREATE FUNCTION public.verify_reviewed_user_merge(p_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op public.user_merge_operations%rowtype; expected jsonb; checks jsonb; expected_balance bigint; actual_balance bigint;
BEGIN
  SELECT * INTO op FROM public.user_merge_operations WHERE id=p_operation_id;
  IF op.id IS NULL THEN RAISE EXCEPTION 'MOVI_AUTH_MERGE_OPERATION_NOT_FOUND' USING ERRCODE='22023'; END IF;
  expected:=op.metadata->'stage4_preview';
  expected_balance:=nullif(expected->'moviback'->>'expected_balance','')::bigint;
  IF expected_balance IS NOT NULL THEN
    SELECT coalesce(sum(t.points_delta),0) INTO actual_balance FROM public.loyalty_memberships m
      LEFT JOIN public.loyalty_transactions t ON t.membership_id=m.id WHERE m.user_id=op.canonical_user_id;
  END IF;
  checks:=jsonb_build_object(
    'source_merged',EXISTS(SELECT 1 FROM public.users WHERE id=op.source_user_id AND identity_status='merged' AND merged_into_user_id=op.canonical_user_id),
    'alias_active',EXISTS(SELECT 1 FROM public.user_identity_aliases WHERE source_user_id=op.source_user_id AND canonical_user_id=op.canonical_user_id AND status='active'),
    'canonical_active',EXISTS(SELECT 1 FROM public.users WHERE id=op.canonical_user_id AND identity_status='active'),
    'ownership_moved',NOT EXISTS(SELECT 1 FROM public.store_orders WHERE user_id=op.source_user_id)
      AND NOT EXISTS(SELECT 1 FROM public.medical_certificates WHERE user_id=op.source_user_id)
      AND NOT EXISTS(SELECT 1 FROM public.tournament_registrations WHERE user_id=op.source_user_id)
      AND NOT EXISTS(SELECT 1 FROM public.tournament_run_participants WHERE user_id=op.source_user_id),
    'roster_valid',NOT EXISTS(SELECT team_id FROM public.league_team_players WHERE user_id=op.canonical_user_id GROUP BY team_id HAVING count(*)>1)
      AND NOT EXISTS(SELECT 1 FROM public.league_teams t JOIN public.league_team_players p ON p.team_id=t.id AND p.id=t.captain_player_id WHERE p.user_id=op.source_user_id),
    'moviback_balance_preserved',expected_balance IS NULL OR actual_balance=expected_balance,
    'store_count_preserved',(SELECT count(*) FROM public.store_orders WHERE user_id=op.canonical_user_id)=(expected->'pair_counts'->>'store_orders')::integer,
    'tournament_history_preserved',(SELECT count(*) FROM public.tournament_registrations WHERE user_id=op.canonical_user_id)=(expected->'pair_counts'->>'tournament_registrations')::integer,
    'communications_not_emitted',(SELECT count(*) FROM public.communications WHERE recipient_user_id=op.canonical_user_id)=(expected->'pair_counts'->>'communications')::integer,
    'consent_not_escalated',EXISTS(SELECT 1 FROM public.users u WHERE u.id=op.canonical_user_id
      AND u.marketing_accepted=(expected->'consent_outcome'->>'marketing_accepted')::boolean
      AND u.marketing_accepted_at IS NOT DISTINCT FROM nullif(expected->'consent_outcome'->>'marketing_accepted_at','')::timestamptz),
    'journal_complete',EXISTS(SELECT 1 FROM public.user_merge_journal WHERE operation_id=op.id AND event_type='completed' AND status='completed')
  );
  RETURN jsonb_build_object('operation_id',op.id,'checks',checks,'passed',NOT EXISTS(
    SELECT 1 FROM jsonb_each(checks) x WHERE x.value<>'true'::jsonb
  ),'moviback_expected_balance',expected_balance,'moviback_actual_balance',actual_balance);
END $$;

CREATE FUNCTION public.execute_reviewed_user_merge(p_operation_id uuid,p_expected_fingerprint text,p_actor_staff_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op public.user_merge_operations%rowtype; g public.user_duplicate_review_groups%rowtype;
  v_preview jsonb; movi jsonb; base jsonb; result jsonb; verification jsonb;
  s public.users%rowtype; c public.users%rowtype; sm public.loyalty_memberships%rowtype; cm public.loyalty_memberships%rowtype;
  winners jsonb; before_balance bigint; after_balance bigint; source_tx integer; source_redemptions integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('movi-auth-stage4-scan',0));
  SELECT * INTO op FROM public.user_merge_operations WHERE id=p_operation_id FOR UPDATE;
  IF op.id IS NULL THEN RAISE EXCEPTION 'MOVI_AUTH_MERGE_OPERATION_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF op.status='completed' THEN RETURN jsonb_build_object('state','completed','operation_id',op.id,'idempotent',true,'verification',op.metadata->'verification'); END IF;
  IF op.status<>'planned' THEN RETURN jsonb_build_object('state',op.status,'operation_id',op.id); END IF;
  SELECT * INTO g FROM public.user_duplicate_review_groups WHERE id=op.candidate_group_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('movi-user:'||least(op.source_user_id::text,op.canonical_user_id::text),0));
  PERFORM pg_advisory_xact_lock(hashtextextended('movi-user:'||greatest(op.source_user_id::text,op.canonical_user_id::text),0));
  SELECT * INTO s FROM public.users WHERE id=op.source_user_id FOR UPDATE;
  SELECT * INTO c FROM public.users WHERE id=op.canonical_user_id FOR UPDATE;
  v_preview:=public.preview_reviewed_user_merge(g.id,s.id,c.id);
  IF p_expected_fingerprint IS DISTINCT FROM op.expected_fingerprint OR p_expected_fingerprint IS DISTINCT FROM v_preview->>'fingerprint' THEN
    RETURN jsonb_build_object('state','stale_preview','code','STALE_PREVIEW','current_preview',v_preview);
  END IF;
  IF jsonb_array_length(v_preview->'blockers')>0 THEN RETURN jsonb_build_object('state','conflict','blockers',v_preview->'blockers'); END IF;
  BEGIN
    winners:=coalesce(g.review_config->'field_winners','{}'::jsonb);
    IF winners->>'phone'=s.id::text AND s.phone IS DISTINCT FROM c.phone THEN
      UPDATE public.users SET phone='merged-'||replace(s.id::text,'-',''),updated_at=now() WHERE id=s.id;
    END IF;
    UPDATE public.users SET
      full_name=CASE WHEN winners->>'full_name'=s.id::text THEN s.full_name ELSE c.full_name END,
      phone=CASE WHEN winners->>'phone'=s.id::text THEN s.phone ELSE c.phone END,
      email=CASE WHEN winners->>'email'=s.id::text THEN s.email ELSE c.email END,
      gender=CASE WHEN winners->>'gender'=s.id::text THEN s.gender ELSE c.gender END,
      updated_at=now() WHERE id=c.id;

    movi:=v_preview->'moviback';
    IF coalesce((movi->>'applicable')::boolean,false) THEN
      IF NOT coalesce((movi->>'safe')::boolean,false) THEN RAISE EXCEPTION 'MOVI_AUTH_MOVIBACK_RECONCILIATION_BLOCKED'; END IF;
      SELECT * INTO sm FROM public.loyalty_memberships WHERE id=(movi->'source_membership'->>'id')::uuid FOR UPDATE;
      SELECT * INTO cm FROM public.loyalty_memberships WHERE id=(movi->'canonical_membership'->>'id')::uuid FOR UPDATE;
      before_balance:=(movi->>'expected_balance')::bigint;
      source_tx:=(movi->'source_membership'->>'transactions')::integer;
      source_redemptions:=(movi->'source_membership'->>'redemptions')::integer;
      INSERT INTO public.user_moviback_reconciliation_evidence(operation_id,source_user_id,canonical_user_id,
        source_membership_id,canonical_membership_id,preview_fingerprint,source_membership_summary,canonical_membership_summary,ledger_summary)
      VALUES(op.id,s.id,c.id,sm.id,cm.id,movi->>'fingerprint',movi->'source_membership',movi->'canonical_membership',
        jsonb_build_object('expected_balance',before_balance,'source_transactions',source_tx,'source_redemptions',source_redemptions));
      UPDATE public.loyalty_transactions SET membership_id=cm.id WHERE membership_id=sm.id;
      UPDATE public.reward_redemptions SET membership_id=cm.id WHERE membership_id=sm.id;
      UPDATE public.loyalty_user_promos SET membership_id=cm.id,updated_at=now() WHERE membership_id=sm.id;
      DELETE FROM public.loyalty_memberships WHERE id=sm.id;
      SELECT coalesce(sum(points_delta),0) INTO after_balance FROM public.loyalty_transactions WHERE membership_id=cm.id;
      IF after_balance<>before_balance
         OR (SELECT count(*) FROM public.reward_redemptions WHERE membership_id=cm.id)<source_redemptions THEN
        RAISE EXCEPTION 'MOVI_AUTH_MOVIBACK_RECONCILIATION_MISMATCH';
      END IF;
      INSERT INTO public.user_merge_journal(operation_id,source_user_id,canonical_user_id,event_type,domain,status,actor_staff_id,details)
      VALUES(op.id,s.id,c.id,'domain_step','moviback_reconciliation','completed',p_actor_staff_id,
        jsonb_build_object('ledger_balance_before',before_balance,'ledger_balance_after',after_balance,'source_membership_archived',true,'redemptions_moved',source_redemptions));
    END IF;

    base:=public.preview_user_merge(s.id,c.id);
    IF jsonb_array_length(base->'conflicts')>0 THEN RAISE EXCEPTION 'MOVI_AUTH_POST_RECONCILIATION_CONFLICT: %',base->'conflicts'; END IF;
    UPDATE public.user_merge_operations SET expected_fingerprint=base->>'fingerprint',preview=base,
      metadata=metadata||jsonb_build_object('stage4_preview',v_preview) WHERE id=op.id;
    result:=public.execute_user_merge(op.id,base->>'fingerprint',p_actor_staff_id);
    IF result->>'state'<>'completed' THEN RAISE EXCEPTION 'MOVI_AUTH_STAGE3_EXECUTION_FAILED: %',result; END IF;
    verification:=public.verify_reviewed_user_merge(op.id);
    IF NOT (verification->>'passed')::boolean THEN RAISE EXCEPTION 'MOVI_AUTH_POST_MERGE_VERIFICATION_FAILED: %',verification; END IF;
    UPDATE public.user_merge_operations SET metadata=metadata||jsonb_build_object('verification',verification,'stage4',true) WHERE id=op.id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.user_merge_operations SET status='needs_review',error_metadata=jsonb_build_object('sqlstate',SQLSTATE,'message',SQLERRM,'stage',4) WHERE id=op.id;
    INSERT INTO public.user_merge_journal(operation_id,source_user_id,canonical_user_id,event_type,status,actor_staff_id,details,error_metadata)
    VALUES(op.id,op.source_user_id,op.canonical_user_id,'failed','failed',p_actor_staff_id,jsonb_build_object('needs_review',true,'rolled_back',true),jsonb_build_object('sqlstate',SQLSTATE,'message',SQLERRM));
    RETURN jsonb_build_object('state','needs_review','operation_id',op.id);
  END;
  RETURN jsonb_build_object('state','completed','operation_id',op.id,'idempotent',false,'verification',verification,
    'domain_results',(SELECT coalesce(jsonb_agg(jsonb_build_object('domain',domain,'status',status,'details',details) ORDER BY id),'[]') FROM public.user_merge_journal WHERE operation_id=op.id AND event_type='domain_step'));
END $$;

ALTER TABLE public.user_duplicate_scan_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_duplicate_review_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_moviback_reconciliation_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_duplicate_scan_runs,public.user_duplicate_review_decisions,public.user_moviback_reconciliation_evidence FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.user_duplicate_scan_runs TO service_role;
GRANT SELECT,INSERT ON public.user_duplicate_review_decisions,public.user_moviback_reconciliation_evidence TO service_role;

REVOKE ALL ON FUNCTION public.prevent_stage4_audit_mutation(),public.user_duplicate_candidate_fingerprint(uuid),
  public.user_duplicate_recommendation_reasons(uuid,uuid),public.run_user_duplicate_scan(uuid),
  public.save_user_duplicate_review_decision(uuid,text,uuid,uuid,uuid[],jsonb,text,uuid),
  public.preview_dual_moviback_reconciliation(uuid,uuid),public.preview_reviewed_user_merge(uuid,uuid,uuid),
  public.user_migration_summary(),public.duplicate_migration_dry_run(uuid),
  public.create_reviewed_user_merge_operation(uuid,uuid,uuid,text),public.verify_reviewed_user_merge(uuid),
  public.execute_reviewed_user_merge(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.user_duplicate_candidate_fingerprint(uuid),public.user_duplicate_recommendation_reasons(uuid,uuid),
  public.run_user_duplicate_scan(uuid),public.save_user_duplicate_review_decision(uuid,text,uuid,uuid,uuid[],jsonb,text,uuid),
  public.preview_dual_moviback_reconciliation(uuid,uuid),public.preview_reviewed_user_merge(uuid,uuid,uuid),
  public.user_migration_summary(),public.duplicate_migration_dry_run(uuid),
  public.create_reviewed_user_merge_operation(uuid,uuid,uuid,text),public.verify_reviewed_user_merge(uuid),
  public.execute_reviewed_user_merge(uuid,text,uuid) TO service_role;

COMMENT ON FUNCTION public.duplicate_migration_dry_run(uuid) IS
  'Read-only Stage 4 production-precheck format. It never scans, approves, or executes a merge.';
COMMENT ON FUNCTION public.execute_reviewed_user_merge(uuid,text,uuid) IS
  'Explicitly reviewed Stage 4 merge command with optional ledger-based MoviBack reconciliation and post-verification.';
