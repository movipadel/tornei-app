-- MoviBack corporate conventions C6: authoritative reporting and merge reconciliation.
-- Metrics are derived at read time; no mutable reporting counters are persisted.

CREATE INDEX moviback_codes_report_lookup
  ON public.moviback_agreement_codes (agreement_id, status, batch_id);

CREATE INDEX moviback_entitlements_report_lookup
  ON public.moviback_agreement_entitlements (agreement_id, status, membership_id);

CREATE INDEX loyalty_transactions_agreement_report_lookup
  ON public.loyalty_transactions (agreement_id, created_at DESC)
  WHERE agreement_id IS NOT NULL;

CREATE INDEX loyalty_transactions_entitlement_report_lookup
  ON public.loyalty_transactions (entitlement_id, created_at DESC)
  WHERE entitlement_id IS NOT NULL;

CREATE INDEX moviback_audit_report_lookup
  ON public.moviback_agreement_audit_events (agreement_id, created_at DESC);

CREATE FUNCTION public.get_moviback_agreement_report(p_agreement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  a public.moviback_agreements%rowtype;
  v_now timestamptz := transaction_timestamp();
BEGIN
  SELECT * INTO a FROM public.moviback_agreements WHERE id=p_agreement_id;
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'MOVIBACK_AGREEMENT_NOT_FOUND' USING ERRCODE='22023';
  END IF;

  RETURN jsonb_build_object(
    'agreement', jsonb_build_object(
      'id',a.id,'name',a.name,'slug',a.slug,'status',a.status,'multiplier',a.multiplier,
      'valid_from',a.valid_from,'valid_until',a.valid_until
    ),
    'generated_at',v_now,
    'codes', jsonb_build_object(
      'total',(SELECT count(*) FROM public.moviback_agreement_codes c WHERE c.agreement_id=a.id),
      'available',(SELECT count(*) FROM public.moviback_agreement_codes c WHERE c.agreement_id=a.id AND c.status='available'),
      'reserved',(SELECT count(*) FROM public.moviback_agreement_codes c WHERE c.agreement_id=a.id AND c.status='reserved'),
      'claimed',(SELECT count(*) FROM public.moviback_agreement_codes c WHERE c.agreement_id=a.id AND c.status='claimed'),
      'used',(SELECT count(*) FROM public.moviback_agreement_codes c WHERE c.agreement_id=a.id AND c.status='used'),
      'closed',(SELECT count(*) FROM public.moviback_agreement_codes c WHERE c.agreement_id=a.id AND c.status='closed'),
      'revoked',(SELECT count(*) FROM public.moviback_agreement_codes c WHERE c.agreement_id=a.id AND c.status='revoked'),
      'expired',(SELECT count(*) FROM public.moviback_agreement_codes c WHERE c.agreement_id=a.id AND c.status='expired')
    ),
    'entitlements', jsonb_build_object(
      'total',(SELECT count(*) FROM public.moviback_agreement_entitlements e WHERE e.agreement_id=a.id),
      'pending',(SELECT count(*) FROM public.moviback_agreement_entitlements e WHERE e.agreement_id=a.id AND e.status='pending'),
      'scheduled',(SELECT count(*) FROM public.moviback_agreement_entitlements e WHERE e.agreement_id=a.id AND e.status='scheduled'),
      'active',(SELECT count(*) FROM public.moviback_agreement_entitlements e WHERE e.agreement_id=a.id AND e.status='active'),
      'current_active',(SELECT count(*) FROM public.moviback_agreement_entitlements e WHERE e.agreement_id=a.id AND e.status='active' AND e.effective_from<=v_now AND (e.effective_until IS NULL OR v_now<e.effective_until) AND (e.revoked_at IS NULL OR v_now<e.revoked_at) AND a.status='active' AND a.valid_from<=v_now AND (a.valid_until IS NULL OR v_now<a.valid_until)),
      'not_activated',(SELECT count(*) FROM public.moviback_agreement_entitlements e WHERE e.agreement_id=a.id AND e.status='not_activated'),
      'revoked',(SELECT count(*) FROM public.moviback_agreement_entitlements e WHERE e.agreement_id=a.id AND e.status='revoked'),
      'expired',(SELECT count(*) FROM public.moviback_agreement_entitlements e WHERE e.agreement_id=a.id AND e.status='expired')
    ),
    'memberships', jsonb_build_object(
      'unique_involved',(SELECT count(DISTINCT e.membership_id) FROM public.moviback_agreement_entitlements e WHERE e.agreement_id=a.id),
      'currently_active',(SELECT count(DISTINCT e.membership_id) FROM public.moviback_agreement_entitlements e WHERE e.agreement_id=a.id AND e.status='active' AND e.effective_from<=v_now AND (e.effective_until IS NULL OR v_now<e.effective_until) AND (e.revoked_at IS NULL OR v_now<e.revoked_at) AND a.status='active' AND a.valid_from<=v_now AND (a.valid_until IS NULL OR v_now<a.valid_until)),
      'activations',(SELECT count(*) FROM public.moviback_agreement_entitlements e WHERE e.agreement_id=a.id AND e.activated_at IS NOT NULL),
      'admin_assignments',(SELECT count(*) FROM public.moviback_agreement_entitlements e WHERE e.agreement_id=a.id AND e.activation_source='admin'),
      'code_activations',(SELECT count(*) FROM public.moviback_agreement_entitlements e WHERE e.agreement_id=a.id AND e.activation_source='code' AND e.activated_at IS NOT NULL)
    ),
    'points', jsonb_build_object(
      'earn_transactions',(SELECT count(*) FROM public.loyalty_transactions t WHERE t.agreement_id=a.id AND t.incentive_source='agreement' AND t.type='earn'),
      'base_points',(SELECT coalesce(sum(t.base_points),0) FROM public.loyalty_transactions t WHERE t.agreement_id=a.id AND t.incentive_source='agreement' AND t.type='earn'),
      'credited_points',(SELECT coalesce(sum(t.credited_points),0) FROM public.loyalty_transactions t WHERE t.agreement_id=a.id AND t.incentive_source='agreement' AND t.type='earn'),
      'bonus_points',(SELECT coalesce(sum(t.credited_points-t.base_points),0) FROM public.loyalty_transactions t WHERE t.agreement_id=a.id AND t.incentive_source='agreement' AND t.type='earn'),
      'legacy_unclassified_rows',(SELECT count(*) FROM public.loyalty_transactions t WHERE t.membership_id IN (SELECT e.membership_id FROM public.moviback_agreement_entitlements e WHERE e.agreement_id=a.id) AND t.type='earn' AND t.earning_rule_version IS NULL)
    ),
    'batches', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',b.id,'generated_at',b.created_at,'generated_by',b.generated_by,'quantity',b.quantity,
        'valid_from',b.valid_from,'valid_until',b.valid_until,
        'total',(SELECT count(*) FROM public.moviback_agreement_codes c WHERE c.batch_id=b.id),
        'available',(SELECT count(*) FROM public.moviback_agreement_codes c WHERE c.batch_id=b.id AND c.status='available'),
        'reserved',(SELECT count(*) FROM public.moviback_agreement_codes c WHERE c.batch_id=b.id AND c.status='reserved'),
        'used',(SELECT count(*) FROM public.moviback_agreement_codes c WHERE c.batch_id=b.id AND c.status='used'),
        'closed',(SELECT count(*) FROM public.moviback_agreement_codes c WHERE c.batch_id=b.id AND c.status='closed'),
        'revoked',(SELECT count(*) FROM public.moviback_agreement_codes c WHERE c.batch_id=b.id AND c.status='revoked'),
        'expired',(SELECT count(*) FROM public.moviback_agreement_codes c WHERE c.batch_id=b.id AND c.status='expired')
      ) ORDER BY b.created_at DESC)
      FROM public.moviback_agreement_code_batches b WHERE b.agreement_id=a.id
    ),'[]'::jsonb),
    'membership_history', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'entitlement_id',e.id,'membership_id',e.membership_id,'member_name',u.full_name,
        'status',e.status,'activation_source',e.activation_source,'code_suffix',c.code_suffix,
        'created_at',e.created_at,'activated_at',e.activated_at,'effective_from',e.effective_from,
        'effective_until',e.effective_until,'revoked_at',e.revoked_at,
        'revocation_reason',e.revocation_reason,'not_activation_reason',e.not_activation_reason,
        'earn_count',(SELECT count(*) FROM public.loyalty_transactions t WHERE t.entitlement_id=e.id AND t.incentive_source='agreement'),
        'base_points',(SELECT coalesce(sum(t.base_points),0) FROM public.loyalty_transactions t WHERE t.entitlement_id=e.id AND t.incentive_source='agreement'),
        'credited_points',(SELECT coalesce(sum(t.credited_points),0) FROM public.loyalty_transactions t WHERE t.entitlement_id=e.id AND t.incentive_source='agreement'),
        'bonus_points',(SELECT coalesce(sum(t.credited_points-t.base_points),0) FROM public.loyalty_transactions t WHERE t.entitlement_id=e.id AND t.incentive_source='agreement')
      ) ORDER BY e.created_at DESC)
      FROM (SELECT * FROM public.moviback_agreement_entitlements WHERE agreement_id=a.id ORDER BY created_at DESC LIMIT 200) e
      JOIN public.loyalty_memberships m ON m.id=e.membership_id
      JOIN public.users u ON u.id=m.user_id
      LEFT JOIN public.moviback_agreement_codes c ON c.id=e.code_id
    ),'[]'::jsonb),
    'point_activity', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'transaction_id',t.id,'membership_id',t.membership_id,'member_name',u.full_name,
        'created_at',t.created_at,'club',t.club,'euro_amount',t.euro_amount,
        'base_points',t.base_points,'applied_multiplier',t.applied_multiplier,
        'credited_points',t.credited_points,'bonus_points',t.credited_points-t.base_points,
        'agreement_id',t.agreement_id,'entitlement_id',t.entitlement_id,
        'earning_rule_version',t.earning_rule_version,'source_event_type',t.source_event_type,
        'source_event_id',t.source_event_id
      ) ORDER BY t.created_at DESC)
      FROM (SELECT * FROM public.loyalty_transactions WHERE agreement_id=a.id AND incentive_source='agreement' AND type='earn' ORDER BY created_at DESC LIMIT 200) t
      JOIN public.loyalty_memberships m ON m.id=t.membership_id
      JOIN public.users u ON u.id=m.user_id
    ),'[]'::jsonb)
  );
END $$;

CREATE FUNCTION public.get_moviback_membership_agreement_history(p_membership_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'entitlement_id',e.id,'agreement_id',a.id,'agreement_name',a.name,'multiplier',a.multiplier,
    'status',e.status,'activation_source',e.activation_source,'code_suffix',c.code_suffix,
    'created_at',e.created_at,'activated_at',e.activated_at,'effective_from',e.effective_from,
    'effective_until',e.effective_until,'revoked_at',e.revoked_at,
    'revocation_reason',e.revocation_reason,'not_activation_reason',e.not_activation_reason,
    'earn_count',(SELECT count(*) FROM public.loyalty_transactions t WHERE t.entitlement_id=e.id AND t.incentive_source='agreement'),
    'base_points',(SELECT coalesce(sum(t.base_points),0) FROM public.loyalty_transactions t WHERE t.entitlement_id=e.id AND t.incentive_source='agreement'),
    'credited_points',(SELECT coalesce(sum(t.credited_points),0) FROM public.loyalty_transactions t WHERE t.entitlement_id=e.id AND t.incentive_source='agreement'),
    'bonus_points',(SELECT coalesce(sum(t.credited_points-t.base_points),0) FROM public.loyalty_transactions t WHERE t.entitlement_id=e.id AND t.incentive_source='agreement')
  ) ORDER BY e.created_at DESC),'[]'::jsonb)
  FROM public.moviback_agreement_entitlements e
  JOIN public.moviback_agreements a ON a.id=e.agreement_id
  LEFT JOIN public.moviback_agreement_codes c ON c.id=e.code_id
  WHERE e.membership_id=p_membership_id;
$$;

-- C6 makes convention state part of the reviewed merge preview and fingerprint.
CREATE OR REPLACE FUNCTION public.preview_dual_moviback_reconciliation(p_source_user_id uuid,p_canonical_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.loyalty_memberships%rowtype; c public.loyalty_memberships%rowtype;
  sc integer; cc integer; sb bigint; cb bigint; blockers jsonb:='[]'; fp text;
  st integer; ct integer; sr integer; cr integer; sp integer; cp integer;
  source_current integer; canonical_current integer; source_effective integer; canonical_effective integer;
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
  SELECT count(*) INTO source_current FROM public.moviback_agreement_entitlements WHERE membership_id=s.id AND status IN('pending','scheduled','active') AND revoked_at IS NULL;
  SELECT count(*) INTO canonical_current FROM public.moviback_agreement_entitlements WHERE membership_id=c.id AND status IN('pending','scheduled','active') AND revoked_at IS NULL;
  SELECT count(*) INTO source_effective FROM public.moviback_agreement_entitlements WHERE membership_id=s.id AND status IN('scheduled','active') AND revoked_at IS NULL;
  SELECT count(*) INTO canonical_effective FROM public.moviback_agreement_entitlements WHERE membership_id=c.id AND status IN('scheduled','active') AND revoked_at IS NULL;
  IF s.status<>'approved' OR c.status<>'approved' THEN blockers:=blockers||'"membership_not_approved"'::jsonb; END IF;
  IF nullif(upper(btrim(s.tax_code)),'') IS DISTINCT FROM nullif(upper(btrim(c.tax_code)),'') THEN blockers:=blockers||'"tax_code_mismatch"'::jsonb; END IF;
  IF s.membership_type IS NOT NULL AND c.membership_type IS NOT NULL AND s.membership_type<>c.membership_type THEN blockers:=blockers||'"membership_type_mismatch"'::jsonb; END IF;
  IF source_effective>0 AND canonical_effective>0 THEN blockers:=blockers||'"agreement_active_or_scheduled_conflict"'::jsonb;
  ELSIF source_current>0 AND canonical_current>0 THEN blockers:=blockers||'"agreement_current_entitlement_conflict"'::jsonb; END IF;
  IF EXISTS(SELECT 1 FROM public.loyalty_transactions t WHERE t.membership_id IN(s.id,c.id) AND t.related_redemption_id IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public.reward_redemptions r WHERE r.id=t.related_redemption_id AND r.membership_id=t.membership_id)) THEN blockers:=blockers||'"ledger_redemption_mismatch"'::jsonb; END IF;
  fp:=md5(jsonb_build_object(
    'source',jsonb_build_object('id',s.id,'updated_at',s.updated_at,'status',s.status,'type',s.membership_type,'balance',sb,'transactions',st,'redemptions',sr,'promos',sp),
    'canonical',jsonb_build_object('id',c.id,'updated_at',c.updated_at,'status',c.status,'type',c.membership_type,'balance',cb,'transactions',ct,'redemptions',cr,'promos',cp),
    'transaction_ids',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'agreement_id',agreement_id,'entitlement_id',entitlement_id) ORDER BY id),'[]') FROM public.loyalty_transactions WHERE membership_id IN(s.id,c.id)),
    'redemption_ids',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') FROM public.reward_redemptions WHERE membership_id IN(s.id,c.id)),
    'entitlements',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'membership_id',membership_id,'agreement_id',agreement_id,'code_id',code_id,
      'status',status,'activated_at',activated_at,'effective_from',effective_from,
      'effective_until',effective_until,'revoked_at',revoked_at,
      'revocation_reason',revocation_reason,'not_activation_reason',not_activation_reason,
      'updated_at',updated_at
    ) ORDER BY id),'[]') FROM public.moviback_agreement_entitlements WHERE membership_id IN(s.id,c.id)),
    'claimed_codes',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'membership_id',claimed_by_membership_id,'status',status) ORDER BY id),'[]') FROM public.moviback_agreement_codes WHERE claimed_by_membership_id IN(s.id,c.id))
  )::text);
  RETURN jsonb_build_object('applicable',true,'safe',jsonb_array_length(blockers)=0,'blockers',blockers,'fingerprint',fp,
    'source_membership',jsonb_build_object('id',s.id,'code',s.membership_code,'status',s.status,'type',s.membership_type,'balance',sb,'transactions',st,'redemptions',sr,'promos',sp,'entitlements',(SELECT count(*) FROM public.moviback_agreement_entitlements WHERE membership_id=s.id),'claimed_codes',(SELECT count(*) FROM public.moviback_agreement_codes WHERE claimed_by_membership_id=s.id)),
    'canonical_membership',jsonb_build_object('id',c.id,'code',c.membership_code,'status',c.status,'type',c.membership_type,'balance',cb,'transactions',ct,'redemptions',cr,'promos',cp,'entitlements',(SELECT count(*) FROM public.moviback_agreement_entitlements WHERE membership_id=c.id),'claimed_codes',(SELECT count(*) FROM public.moviback_agreement_codes WHERE claimed_by_membership_id=c.id)),
    'expected_balance',sb+cb,'tax_code_match',nullif(upper(btrim(s.tax_code)),'') IS NOT DISTINCT FROM nullif(upper(btrim(c.tax_code)),''),
    'convention_state',jsonb_build_object('source_current',source_current,'canonical_current',canonical_current,'source_active_or_scheduled',source_effective,'canonical_active_or_scheduled',canonical_effective),
    'policy',jsonb_build_object('balance','sum of immutable ledger deltas','transactions','move','redemptions','move without duplication','agreement_entities','move references without recreating history','source_membership','archive evidence then remove'));
END $$;

CREATE OR REPLACE FUNCTION public.verify_reviewed_user_merge(p_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op public.user_merge_operations%rowtype; expected jsonb; checks jsonb; expected_balance bigint; actual_balance bigint;
BEGIN
  SELECT * INTO op FROM public.user_merge_operations WHERE id=p_operation_id;
  IF op.id IS NULL THEN RAISE EXCEPTION 'MOVI_AUTH_MERGE_OPERATION_NOT_FOUND' USING ERRCODE='22023'; END IF;
  expected:=op.metadata->'stage4_preview';
  expected_balance:=nullif(expected->'moviback'->>'expected_balance','')::bigint;
  IF expected_balance IS NOT NULL THEN SELECT coalesce(sum(t.points_delta),0) INTO actual_balance FROM public.loyalty_memberships m LEFT JOIN public.loyalty_transactions t ON t.membership_id=m.id WHERE m.user_id=op.canonical_user_id; END IF;
  checks:=jsonb_build_object(
    'source_merged',EXISTS(SELECT 1 FROM public.users WHERE id=op.source_user_id AND identity_status='merged' AND merged_into_user_id=op.canonical_user_id),
    'alias_active',EXISTS(SELECT 1 FROM public.user_identity_aliases WHERE source_user_id=op.source_user_id AND canonical_user_id=op.canonical_user_id AND status='active'),
    'canonical_active',EXISTS(SELECT 1 FROM public.users WHERE id=op.canonical_user_id AND identity_status='active'),
    'ownership_moved',NOT EXISTS(SELECT 1 FROM public.store_orders WHERE user_id=op.source_user_id) AND NOT EXISTS(SELECT 1 FROM public.medical_certificates WHERE user_id=op.source_user_id) AND NOT EXISTS(SELECT 1 FROM public.tournament_registrations WHERE user_id=op.source_user_id) AND NOT EXISTS(SELECT 1 FROM public.tournament_run_participants WHERE user_id=op.source_user_id),
    'roster_valid',NOT EXISTS(SELECT team_id FROM public.league_team_players WHERE user_id=op.canonical_user_id GROUP BY team_id HAVING count(*)>1) AND NOT EXISTS(SELECT 1 FROM public.league_teams t JOIN public.league_team_players p ON p.team_id=t.id AND p.id=t.captain_player_id WHERE p.user_id=op.source_user_id),
    'moviback_balance_preserved',expected_balance IS NULL OR actual_balance=expected_balance,
    'agreement_entitlements_resolved',NOT EXISTS(SELECT 1 FROM public.user_moviback_reconciliation_evidence x JOIN public.moviback_agreement_entitlements e ON e.membership_id=x.source_membership_id WHERE x.operation_id=op.id),
    'claimed_codes_resolved',NOT EXISTS(SELECT 1 FROM public.user_moviback_reconciliation_evidence x JOIN public.moviback_agreement_codes c ON c.claimed_by_membership_id=x.source_membership_id WHERE x.operation_id=op.id),
    'current_entitlement_invariant',NOT EXISTS(SELECT membership_id FROM public.moviback_agreement_entitlements WHERE status IN('pending','scheduled','active') AND revoked_at IS NULL GROUP BY membership_id HAVING count(*)>1),
    'ledger_agreement_refs_valid',NOT EXISTS(SELECT 1 FROM public.loyalty_transactions t WHERE t.agreement_id IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM public.moviback_agreements a WHERE a.id=t.agreement_id) OR t.entitlement_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.moviback_agreement_entitlements e WHERE e.id=t.entitlement_id AND e.agreement_id=t.agreement_id))),
    'store_count_preserved',(SELECT count(*) FROM public.store_orders WHERE user_id=op.canonical_user_id)=(expected->'pair_counts'->>'store_orders')::integer,
    'tournament_history_preserved',(SELECT count(*) FROM public.tournament_registrations WHERE user_id=op.canonical_user_id)=(expected->'pair_counts'->>'tournament_registrations')::integer,
    'communications_not_emitted',(SELECT count(*) FROM public.communications WHERE recipient_user_id=op.canonical_user_id)=(expected->'pair_counts'->>'communications')::integer,
    'consent_not_escalated',EXISTS(SELECT 1 FROM public.users u WHERE u.id=op.canonical_user_id AND u.marketing_accepted=(expected->'consent_outcome'->>'marketing_accepted')::boolean AND u.marketing_accepted_at IS NOT DISTINCT FROM nullif(expected->'consent_outcome'->>'marketing_accepted_at','')::timestamptz),
    'journal_complete',EXISTS(SELECT 1 FROM public.user_merge_journal WHERE operation_id=op.id AND event_type='completed' AND status='completed')
  );
  RETURN jsonb_build_object('operation_id',op.id,'checks',checks,'passed',NOT EXISTS(SELECT 1 FROM jsonb_each(checks) x WHERE x.value<>'true'::jsonb),'moviback_expected_balance',expected_balance,'moviback_actual_balance',actual_balance);
END $$;

REVOKE ALL ON FUNCTION public.get_moviback_agreement_report(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_moviback_membership_agreement_history(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_moviback_agreement_report(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_moviback_membership_agreement_history(uuid) TO service_role;

COMMENT ON FUNCTION public.get_moviback_agreement_report(uuid) IS 'C6 authoritative agreement report. Bonus is credited_points-base_points only for agreement-winning earns.';
COMMENT ON FUNCTION public.get_moviback_membership_agreement_history(uuid) IS 'C6 membership convention history without plaintext codes or hashes.';
