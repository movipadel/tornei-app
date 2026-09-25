BEGIN;
CREATE FUNCTION pg_temp.assert_true(v boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
INSERT INTO public.movi_partners(name,slug,category,benefit_title,status,valid_from,valid_until,deleted_at,featured,sort_order) VALUES
('TEST draft','test-partner-draft','Altro','10%','draft',null,null,null,false,0),
('TEST inactive','test-partner-inactive','Altro','10%','inactive',null,null,null,false,0),
('TEST permanent','test-partner-permanent','Altro','10%','active',null,null,null,false,0),
('TEST future','test-partner-future','Altro','10%','active',now()+interval '1 day',null,null,false,0),
('TEST temporary','test-partner-temporary','Altro','20%','active',now()-interval '1 day',now()+interval '1 day',null,true,-100000),
('TEST expired','test-partner-expired','Altro','10%','active',null,now()-interval '1 day',null,false,0),
('TEST deleted','test-partner-deleted','Altro','10%','active',null,null,now(),false,0);
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.movi_partners p WHERE slug like 'test-partner-%' AND public.movi_partner_visible(p)),'eligibility matrix');
SELECT pg_temp.assert_true((SELECT slug='test-partner-temporary' FROM public.movi_partners_public_list(1,0,null)),'featured/order');
DO $$ BEGIN
 BEGIN INSERT INTO public.movi_partners(name,slug,category,benefit_title) VALUES('duplicate','test-partner-draft','Altro','x'); RAISE EXCEPTION 'duplicate accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN UPDATE public.movi_partners SET logo_path='other/file.jpg' WHERE slug='test-partner-draft'; RAISE EXCEPTION 'path accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE public.movi_partners SET valid_from=now(),valid_until=now()-interval '1 day' WHERE slug='test-partner-draft'; RAISE EXCEPTION 'window accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SET LOCAL ROLE anon;
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.movi_partners WHERE slug like 'test-partner-%'),'anon eligibility');
DO $$ BEGIN BEGIN INSERT INTO public.movi_partners(name,slug,category,benefit_title) VALUES('bad','bad','Altro','x'); RAISE EXCEPTION 'anon write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN BEGIN UPDATE public.movi_partners SET name='bad'; RAISE EXCEPTION 'user write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
UPDATE public.movi_partners SET valid_from=statement_timestamp(),valid_until=statement_timestamp() WHERE slug='test-partner-temporary' RETURNING pg_temp.assert_true(public.movi_partner_visible(movi_partners),'inclusive boundary');
SELECT pg_temp.assert_true(('2027-01-06 23:59:59'::timestamp AT TIME ZONE 'Europe/Rome')='2027-01-06 22:59:59+00'::timestamptz,'Rome timezone');
SELECT pg_temp.assert_true((SELECT NOT public FROM storage.buckets WHERE id='movi-partners-media'),'private bucket');
ROLLBACK;
