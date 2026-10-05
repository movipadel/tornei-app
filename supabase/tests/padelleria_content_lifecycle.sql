-- LOCAL lifecycle verification. Entire test rolls back.
BEGIN;

CREATE FUNCTION pg_temp.assert_true(value boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END $$;

INSERT INTO public.padelleria_contents(id,kind,status,title,featured,sort_order,visible_from,visible_until) VALUES
('edee0000-0000-4000-8000-000000000001','succede','published','LIFECYCLE existing default',false,-90000,now()-interval '1 day',now()+interval '1 day');

SELECT pg_temp.assert_true(
  (SELECT delete_on_expiry=false FROM public.padelleria_contents WHERE id='edee0000-0000-4000-8000-000000000001'),
  'existing rows default to delete_on_expiry false'
);

INSERT INTO public.padelleria_contents(id,kind,status,title,featured,delete_on_expiry,sort_order,visible_from,visible_until) VALUES
('edee0000-0000-4000-8000-000000000002','succede','published','LIFECYCLE normal visible',false,false,-89998,now()-interval '1 day',now()+interval '1 day'),
('edee0000-0000-4000-8000-000000000003','succede','published','LIFECYCLE featured visible',true,false,-89999,now()-interval '1 day',now()+interval '1 day'),
('edee0000-0000-4000-8000-000000000004','succede','published','LIFECYCLE featured expired',true,false,-100000,now()-interval '2 days',now()-interval '1 day'),
('edee0000-0000-4000-8000-000000000005','succede','published','LIFECYCLE ephemeral future',false,true,-89997,now()-interval '1 day',now()+interval '1 day'),
('edee0000-0000-4000-8000-000000000006','succede','published','LIFECYCLE ephemeral expired',true,true,-100000,now()-interval '2 days',now()-interval '1 day'),
('edee0000-0000-4000-8000-000000000007','e_successo','published','LIFECYCLE archive',false,false,-89996,NULL,NULL);

SELECT pg_temp.assert_true(
  (SELECT array_agg(id) FILTER (WHERE title IN ('LIFECYCLE featured visible','LIFECYCLE normal visible'))
   FROM public.padelleria_public_list('succede',50,0)) =
  ARRAY['edee0000-0000-4000-8000-000000000003','edee0000-0000-4000-8000-000000000002']::uuid[],
  'featured visible content precedes normal visible content'
);
SELECT pg_temp.assert_true(
  NOT EXISTS(SELECT 1 FROM public.padelleria_public_list('succede',50,0) WHERE id IN ('edee0000-0000-4000-8000-000000000004','edee0000-0000-4000-8000-000000000006')),
  'featured does not bypass expiry'
);

DO $$ BEGIN
  BEGIN
    INSERT INTO public.padelleria_contents(kind,status,title,delete_on_expiry) VALUES('succede','draft','LIFECYCLE invalid missing end',true);
    RAISE EXCEPTION 'accepted delete_on_expiry without visible_until';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.padelleria_contents(kind,status,title,delete_on_expiry,visible_until) VALUES('e_successo','draft','LIFECYCLE invalid archive',true,now()+interval '1 day');
    RAISE EXCEPTION 'accepted delete_on_expiry for e_successo';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

CREATE TEMP TABLE lifecycle_claimed AS SELECT * FROM public.padelleria_claim_expired_contents(100);
SELECT pg_temp.assert_true(
  EXISTS(SELECT 1 FROM lifecycle_claimed WHERE content_id='edee0000-0000-4000-8000-000000000006'),
  'expired ephemeral content is claimed'
);
SELECT pg_temp.assert_true(
  (SELECT deleted_at IS NOT NULL AND status='draft' FROM public.padelleria_contents WHERE id='edee0000-0000-4000-8000-000000000006'),
  'claim performs traceable soft delete first'
);
SELECT pg_temp.assert_true(
  (SELECT deleted_at IS NULL FROM public.padelleria_contents WHERE id='edee0000-0000-4000-8000-000000000005'),
  'non-expired ephemeral content is preserved'
);
SELECT pg_temp.assert_true(
  (SELECT deleted_at IS NULL FROM public.padelleria_contents WHERE id='edee0000-0000-4000-8000-000000000004'),
  'normal expired content is retained'
);
SELECT pg_temp.assert_true(
  public.padelleria_purge_expired_content('edee0000-0000-4000-8000-000000000006'),
  'claimed content purges'
);
SELECT pg_temp.assert_true(
  NOT public.padelleria_purge_expired_content('edee0000-0000-4000-8000-000000000006'),
  'repeat purge is idempotent'
);
SELECT pg_temp.assert_true(
  EXISTS(SELECT 1 FROM public.padelleria_contents WHERE id='edee0000-0000-4000-8000-000000000007' AND status='published'),
  'e_successo behavior is preserved'
);

ROLLBACK;
SELECT 'Padelleria lifecycle SQL PASS (rolled back)' AS result;
