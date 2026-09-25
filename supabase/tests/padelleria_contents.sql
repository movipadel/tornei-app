-- LOCAL test transaction. Runner pins host/port and checks supabase status.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
INSERT INTO public.padelleria_contents(id,kind,status,title,featured,sort_order,visible_from,visible_until) VALUES
('eded0000-0000-4000-8000-000000000001','succede','draft','TEST draft',false,0,NULL,NULL),
('eded0000-0000-4000-8000-000000000002','succede','published','TEST no expiry',false,0,NULL,NULL),
('eded0000-0000-4000-8000-000000000003','succede','published','TEST future',false,0,now()+interval '1 day',NULL),
('eded0000-0000-4000-8000-000000000004','succede','published','TEST active',true,-99999,now()-interval '1 day',now()+interval '1 day'),
('eded0000-0000-4000-8000-000000000005','succede','published','TEST expired',false,0,NULL,now()-interval '1 day'),
('eded0000-0000-4000-8000-000000000006','e_successo','published','TEST archive',false,0,NULL,NULL);
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM public.padelleria_contents c WHERE title LIKE 'TEST %' AND public.padelleria_is_visible(c)),'visibility matrix');
SELECT pg_temp.assert_true((SELECT id='eded0000-0000-4000-8000-000000000004' FROM public.padelleria_public_list('succede',1,0)),'featured and order');
DO $$ BEGIN
  BEGIN INSERT INTO public.padelleria_contents(kind,status,title) VALUES('bad','draft','x'); RAISE EXCEPTION 'accepted bad kind'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.padelleria_contents(kind,title,visible_until) VALUES('e_successo','x',now()); RAISE EXCEPTION 'archive expiry accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.padelleria_contents(kind,title,visible_from,visible_until) VALUES('succede','x',now()+interval '1 day',now()); RAISE EXCEPTION 'invalid window accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT pg_temp.assert_true(('2027-01-06 23:59:59'::timestamp AT TIME ZONE 'Europe/Rome')='2027-01-06 22:59:59+00'::timestamptz,'Rome January conversion');
UPDATE public.padelleria_contents SET visible_from=statement_timestamp(),visible_until=statement_timestamp() WHERE id='eded0000-0000-4000-8000-000000000004' RETURNING pg_temp.assert_true(public.padelleria_is_visible(padelleria_contents),'inclusive exact boundary');
SET LOCAL ROLE anon;
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.padelleria_contents WHERE title LIKE 'TEST %'),'anon only currently eligible');
DO $$ BEGIN BEGIN INSERT INTO public.padelleria_contents(kind,title) VALUES('succede','unauthorized'); RAISE EXCEPTION 'anon write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN BEGIN UPDATE public.padelleria_contents SET title='unauthorized'; RAISE EXCEPTION 'user write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
INSERT INTO public.padelleria_content_media(id,content_id,media_type,role,external_url) VALUES
('eded0000-0000-4000-8000-000000000011','eded0000-0000-4000-8000-000000000001','video','video','https://vimeo.com/123'),
('eded0000-0000-4000-8000-000000000012','eded0000-0000-4000-8000-000000000001','video','video','https://vimeo.com/456');
SELECT public.padelleria_reorder_media('eded0000-0000-4000-8000-000000000001',ARRAY['eded0000-0000-4000-8000-000000000012','eded0000-0000-4000-8000-000000000011']::uuid[]);
SELECT pg_temp.assert_true((SELECT sort_order=0 FROM public.padelleria_content_media WHERE id='eded0000-0000-4000-8000-000000000012'),'media order');
DO $$ BEGIN
  BEGIN INSERT INTO public.padelleria_content_media(content_id,media_type,role,storage_path) VALUES('eded0000-0000-4000-8000-000000000001','image','cover','other/file.png'); RAISE EXCEPTION 'bad path accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
UPDATE public.padelleria_contents SET status='published',title='TEST updated' WHERE id='eded0000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT published_at IS NOT NULL AND public.padelleria_is_visible(c) FROM public.padelleria_contents c WHERE id='eded0000-0000-4000-8000-000000000001'),'publish/update');
UPDATE public.padelleria_contents SET status='draft' WHERE id='eded0000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT NOT public.padelleria_is_visible(c) FROM public.padelleria_contents c WHERE id='eded0000-0000-4000-8000-000000000001'),'unpublish');
UPDATE public.padelleria_contents SET deleted_at=now() WHERE id='eded0000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_true((SELECT NOT public.padelleria_is_visible(c) FROM public.padelleria_contents c WHERE id='eded0000-0000-4000-8000-000000000002'),'soft delete');
SELECT pg_temp.assert_true((SELECT public=false FROM storage.buckets WHERE id='padelleria-content-media'),'private bucket');
ROLLBACK;
SELECT 'Padelleria SQL PASS (rolled back)' AS result;
