begin;
create function pg_temp.assert_true(p boolean,label text) returns void language plpgsql as $$begin if p is distinct from true then raise exception 'FAIL: %',label;end if;end$$;
do $$declare actor uuid;p uuid;p2 uuid;before_count integer;before_cases integer;before_rows jsonb;rows jsonb;answer jsonb;preview jsonb;c player_identity_cases%rowtype;op jsonb;uid uuid:=gen_random_uuid();uid2 uuid:=gen_random_uuid();aid uuid:=gen_random_uuid();safe_source uuid:=gen_random_uuid();safe_keep uuid:=gen_random_uuid();safe_player uuid:=gen_random_uuid();begin
 select id into actor from staff_users where email='padelleria-admin@example.invalid';
 perform pg_temp.assert_true(actor is not null,'admin fixture');
 perform pg_temp.assert_true(player_identity_canonical('efee2000-0000-4000-8000-000000000004')='efee2000-0000-4000-8000-000000000005','merged canonical');
 begin update player_identities set status='active',merged_at=null,merged_into_player_id=null where id='efee2000-0000-4000-8000-000000000004';raise exception 'FAIL merged reactivation';exception when check_violation or raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin update player_identities set status='merged',merged_at=now(),merged_into_player_id=id,account_user_id=null where id='efee2000-0000-4000-8000-000000000005';raise exception 'FAIL cycle';exception when check_violation or raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin insert into player_identities(full_name,normalized_phone,account_user_id) values('Duplicate link','+393470009901','efee1000-0000-4000-8000-000000000001');raise exception 'FAIL unique';exception when unique_violation then null;end;
 begin delete from player_identities where id='efee2000-0000-4000-8000-000000000003';raise exception 'FAIL delete';exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 perform pg_temp.assert_true((select status='archived' from player_identities where id='efee2000-0000-4000-8000-000000000003'),'archive retained');
 answer:=player_identity_link_account('efee2000-0000-4000-8000-000000000010','efee1000-0000-4000-8000-000000000005');
 perform pg_temp.assert_true(answer->>'state'='linked','same existing link idempotent');
 answer:=player_identity_link_account('efee2000-0000-4000-8000-000000000005','efee1000-0000-4000-8000-000000000001');
 perform pg_temp.assert_true(answer->>'state'='review','occupied link corrective case');
 insert into users(id,full_name,phone,email,gender) values(uid,'Test Name Only','+393470009902','test-player@example.invalid','M');
 insert into player_identities(full_name,normalized_phone) values('Test Name Only','+393470009903') returning id into p;
 answer:=player_identity_link_account(p,uid);perform pg_temp.assert_true(answer->>'state'='review','name only refused');
 update player_identities set normalized_phone='+393470009902' where id=p;
 answer:=player_identity_link_account(p,uid);perform pg_temp.assert_true(answer->>'state'='linked','name phone accepted');
 -- Independent verified email evidence: it is a source record, not a browser-provided email field.
 insert into auth.users(id,email,email_confirmed_at) values(aid,'certified-player@example.invalid',now());
 insert into users(id,full_name,phone,email,gender) values(uid2,'Different Name','+393470009904','certified-player@example.invalid','F');
 insert into player_identities(full_name,normalized_phone) values('Evidence Name','+393470009904') returning id into p2;
 insert into player_identity_email_evidence(player_identity_id,normalized_email,source_auth_user_id,certified_by_admin_id) values(p2,'certified-player@example.invalid',aid,actor);
 answer:=player_identity_link_account(p2,uid2);perform pg_temp.assert_true(answer->>'state'='linked','phone plus independently certified email');
 update player_identities set account_user_id=null where id=p2;
 update users set email='wrong@example.invalid' where id=uid2;
 answer:=player_identity_link_account(p2,uid2);perform pg_temp.assert_true(answer->>'state'='review','email mismatch refused');
 -- Re-materialize unchanged sporting results; UUID rows can change, identity/keys/points may not.
 select count(*) into before_count from player_identities;select count(*) into before_cases from player_identity_cases;
 select jsonb_agg(to_jsonb(r)-'id'-'created_at' order by player_key) into before_rows from circuit_results r where source_tournament_id='efee4000-0000-4000-8000-000000000001';
 rows:=before_rows;
 perform player_identity_materialize_circuit('efee4000-0000-4000-8000-000000000001','efee4200-0000-4000-8000-000000000001',rows);
 perform pg_temp.assert_true((select jsonb_agg(to_jsonb(r)-'id'-'created_at' order by player_key)=before_rows from circuit_results r where source_tournament_id='efee4000-0000-4000-8000-000000000001'),'reclose all sporting values and identity unchanged');
 perform pg_temp.assert_true((select count(*)=before_count from player_identities),'reclose no extra players');
 perform pg_temp.assert_true((select count(*)=before_cases from player_identity_cases),'reclose no duplicate cases');
 perform pg_temp.assert_true((select account_user_id is null from player_identities where id=(select player_identity_id from circuit_results where source_tournament_id='efee4000-0000-4000-8000-000000000001' and player_key='3470005117')),'new P2 accountless identity');
 perform pg_temp.assert_true((select player_identity_id is null from circuit_results where source_tournament_id='efee4000-0000-4000-8000-000000000001' and player_key='3470005116'),'ambiguous result unlinked');
 select * into c from player_identity_cases where source_kind='circuit' and source_ref='efee4000-0000-4000-8000-000000000001:registration:efee4100-0000-4000-8000-000000000002:p1';
 perform player_identity_command(actor,'resolve_case',jsonb_build_object('case_id',c.id,'version',c.version,'player_id','efee2000-0000-4000-8000-000000000006','reason','Circuit correction test','decision','confirm'));
 perform player_identity_materialize_circuit('efee4000-0000-4000-8000-000000000001','efee4200-0000-4000-8000-000000000001',rows);
 perform pg_temp.assert_true((select player_identity_id='efee2000-0000-4000-8000-000000000006' from circuit_results where source_tournament_id='efee4000-0000-4000-8000-000000000001' and player_key='3470005116'),'circuit Admin decision survives reclose');
 answer:=player_identity_merge_legacy_keys('efee3000-0000-4000-8000-000000000001','efee3100-0000-4000-8000-000000000002','3470005101',array['3470005112'],null,null,actor);
 perform pg_temp.assert_true(answer->>'state'='review','legacy key merge blocks distinct certified identities');
 preview:=player_identity_merge_preview('efee2000-0000-4000-8000-000000000002','efee2000-0000-4000-8000-000000000001');
 perform pg_temp.assert_true(preview->'blockers' ? 'overlapping_circuit_results','sporting merge never collapses overlapping results');
 -- Generic registration does not invoke sporting identity creation.
 insert into tournament_registrations(tournament_id,position,is_reserve,p1_name,p1_phone,p1_gender) values('edee4000-0000-4000-8000-000000000003',100,true,'Generic signup','+393470009905','M');
 perform pg_temp.assert_true((select count(*)=before_count from player_identities),'generic signup creates no identity');
 select * into c from player_identity_cases where source_kind='league' and source_ref='efee5000-0000-4000-8000-000000000001';
 perform pg_temp.assert_true(not exists(select 1 from league_player_identity_links where league_team_player_id=c.source_ref::uuid),'no name only auto League link');
 perform player_identity_command(actor,'resolve_case',jsonb_build_object('case_id',c.id,'version',c.version,'player_id','efee2000-0000-4000-8000-000000000002','reason','SQL test confirmation','decision','confirm'));
 perform player_identity_command(actor,'scan_league','{}');
 perform pg_temp.assert_true((select player_identity_id='efee2000-0000-4000-8000-000000000002' from league_player_identity_links where league_team_player_id=c.source_ref::uuid),'League confirmed mapping persists');
 begin perform player_identity_command(actor,'resolve_case',jsonb_build_object('case_id',c.id,'version',c.version,'player_id','efee2000-0000-4000-8000-000000000002','reason','stale','decision','confirm'));raise exception 'FAIL stale case';exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 preview:=player_identity_merge_preview(p,p2);
 answer:=player_identity_merge(p,p2,preview->>'fingerprint',actor); -- only source has a current account link
 perform pg_temp.assert_true(answer->>'state'='merged','sporting merge safe');
 perform pg_temp.assert_true((select account_user_id=uid from player_identities where id=p2),'sporting merge transfers account');
 preview:=player_identity_merge_preview('efee2000-0000-4000-8000-000000000001','efee2000-0000-4000-8000-000000000008');
 perform pg_temp.assert_true(preview->'blockers' ? 'different_accounts','sporting merge blocks different accounts');
 preview:=preview_user_merge('efee1000-0000-4000-8000-000000000001','efee1000-0000-4000-8000-000000000002');
 perform pg_temp.assert_true(preview->'conflicts' ? 'different_player_identities','account merge blocks sporting conflict');
 op:=create_user_merge_operation('efee1000-0000-4000-8000-000000000001','efee1000-0000-4000-8000-000000000002',actor,'Test block');
 answer:=execute_user_merge((op->>'operation_id')::uuid,op->'preview'->>'fingerprint',actor);
 perform pg_temp.assert_true(answer->>'state'='conflict','SQL account merge cannot bypass conflict');
 -- Disposable transaction-local accounts: visual acceptance may already have consumed the demo pair.
 insert into users(id,full_name,phone,email,gender) values
 (safe_source,'SQL safe identity merge','+393470009988','sql-safe-identity@example.invalid','M'),
 (safe_keep,'SQL safe identity merge','3470009988','sql-safe-identity@example.invalid','M');
 insert into player_identities(id,full_name,normalized_phone,account_user_id) values(safe_player,'SQL safe identity merge','+393470009988',safe_source);
 op:=create_user_merge_operation(safe_source,safe_keep,actor,'Test safe');
 answer:=execute_user_merge((op->>'operation_id')::uuid,op->'preview'->>'fingerprint',actor);
 perform pg_temp.assert_true(answer->>'state'='completed','safe account merge');
 perform pg_temp.assert_true((select account_user_id=safe_keep from player_identities where id=safe_player),'safe sporting link follows canonical account');
end $$;
set local role anon;
do $$begin begin perform * from public.player_identities;raise exception 'FAIL anon';exception when insufficient_privilege then null;end;end$$;
reset role;
set local role authenticated;
do $$begin begin perform public.player_identity_command(null,'create','{}');raise exception 'FAIL authenticated write';exception when insufficient_privilege then null;end;begin perform * from public.player_identity_cases;raise exception 'FAIL authenticated evidence';exception when insufficient_privilege then null;end;end$$;
reset role;
rollback;
select 'Player identity SQL PASS (rolled back)' result;
