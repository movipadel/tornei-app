-- LOCAL archive visibility verification. Entire test rolls back.
BEGIN;

CREATE FUNCTION pg_temp.assert_true(value boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END $$;

INSERT INTO public.padelleria_contents(id,kind,status,title,delete_on_expiry,featured,sort_order,visible_from,visible_until,occurred_at,deleted_at) VALUES
('eded4000-0000-4000-8000-000000000001','succede','published','ARCHIVE current',false,false,0,now()-interval '1 day',now()+interval '1 day',NULL,NULL),
('eded4000-0000-4000-8000-000000000002','succede','published','ARCHIVE future',false,false,0,now()+interval '1 day',now()+interval '2 days',NULL,NULL),
('eded4000-0000-4000-8000-000000000003','succede','published','ARCHIVE retained expired',false,true,-100,now()-interval '3 days',now()-interval '2 days',NULL,NULL),
('eded4000-0000-4000-8000-000000000004','succede','published','ARCHIVE ephemeral expired',true,true,-100,now()-interval '3 days',now()-interval '1 day',NULL,NULL),
('eded4000-0000-4000-8000-000000000005','e_successo','published','ARCHIVE explicit recap',false,false,0,NULL,NULL,now()-interval '1 day',NULL),
('eded4000-0000-4000-8000-000000000006','succede','draft','ARCHIVE draft',false,false,0,now()-interval '3 days',now()-interval '1 day',NULL,NULL),
('eded4000-0000-4000-8000-000000000007','succede','published','ARCHIVE deleted',false,false,0,now()-interval '3 days',now()-interval '1 day',NULL,now());

SELECT pg_temp.assert_true(public.padelleria_is_visible(c),'current Succede remains current') FROM public.padelleria_contents c WHERE id='eded4000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(NOT public.padelleria_is_public(c),'future Succede is private') FROM public.padelleria_contents c WHERE id='eded4000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_true(public.padelleria_is_public(c),'retained expired Succede is public') FROM public.padelleria_contents c WHERE id='eded4000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_true(NOT public.padelleria_is_public(c),'ephemeral expired Succede is private before cleanup') FROM public.padelleria_contents c WHERE id='eded4000-0000-4000-8000-000000000004';
SELECT pg_temp.assert_true(public.padelleria_is_public(c),'published e_successo is public') FROM public.padelleria_contents c WHERE id='eded4000-0000-4000-8000-000000000005';
SELECT pg_temp.assert_true(NOT public.padelleria_is_public(c),'draft is private') FROM public.padelleria_contents c WHERE id='eded4000-0000-4000-8000-000000000006';
SELECT pg_temp.assert_true(NOT public.padelleria_is_public(c),'deleted is private') FROM public.padelleria_contents c WHERE id='eded4000-0000-4000-8000-000000000007';

SELECT pg_temp.assert_true(
  (SELECT array_agg(id ORDER BY coalesce(occurred_at,visible_until,published_at) DESC NULLS LAST,id DESC)
   FROM public.padelleria_public_archive_list(50,0)
   WHERE id IN ('eded4000-0000-4000-8000-000000000003','eded4000-0000-4000-8000-000000000005')) =
  ARRAY['eded4000-0000-4000-8000-000000000005','eded4000-0000-4000-8000-000000000003']::uuid[],
  'archive combines recap and retained expired Succede chronologically'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.padelleria_public_archive_list(2,0))=2
  AND (SELECT count(*) FROM public.padelleria_public_archive_list(2,2))=2
  AND NOT EXISTS(
    SELECT 1 FROM public.padelleria_public_archive_list(2,0) first_page
    JOIN public.padelleria_public_archive_list(2,2) second_page USING(id)
  ),
  'archive pagination produces stable non-overlapping pages'
);

ROLLBACK;
SELECT 'Padelleria public archive SQL PASS (rolled back)' AS result;
