-- Local-only synthetic transaction. No existing rows are changed after rollback.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id='padelleria-media-variants' AND public) THEN
    RAISE EXCEPTION 'Variant bucket must be private';
  END IF;
  IF has_function_privilege('anon','public.padelleria_register_processed_image(uuid,uuid,uuid,text,text,text,integer,text,integer,integer,integer,jsonb,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.padelleria_register_processed_image(uuid,uuid,uuid,text,text,text,integer,text,integer,integer,integer,jsonb,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Image registration must be service-only';
  END IF;
END $$;

INSERT INTO public.padelleria_contents(id,kind,status,title)
VALUES ('b7a20000-0000-4000-8000-000000000001','succede','draft','A2 synthetic variants');
INSERT INTO public.padelleria_content_media(id,content_id,media_type,role,storage_path,sort_order)
VALUES ('b7a20000-0000-4000-8000-000000000002','b7a20000-0000-4000-8000-000000000001','image','cover',
        'b7a20000-0000-4000-8000-000000000001/b7a20000-0000-4000-8000-000000000002.jpg',0);

SELECT public.padelleria_register_processed_image(
  'b7a20000-0000-4000-8000-000000000001',
  'b7a20000-0000-4000-8000-000000000003',
  'b7a20000-0000-4000-8000-000000000004',
  'cover',
  'b7a20000-0000-4000-8000-000000000001/b7a20000-0000-4000-8000-000000000003.png',
  '',0,repeat('a',64),960,540,100000,
  '[{"width":480,"height":270,"bytes":9000,"format":"webp","encoding":"lossless","path":"b7a20000-0000-4000-8000-000000000001/b7a20000-0000-4000-8000-000000000003/w480.webp"}]'::jsonb,
  'b7a20000-0000-4000-8000-000000000002'
);

DO $$ BEGIN
  IF (SELECT count(*) FROM public.padelleria_content_media WHERE content_id='b7a20000-0000-4000-8000-000000000001' AND role='cover' AND deleted_at IS NULL) <> 1
    OR (SELECT deleted_at IS NULL FROM public.padelleria_content_media WHERE id='b7a20000-0000-4000-8000-000000000002')
    OR NOT (SELECT deleted_at IS NULL AND jsonb_array_length(variants)=1 FROM public.padelleria_content_media WHERE id='b7a20000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'Atomic cover swap failed';
  END IF;
  IF public.padelleria_register_processed_image(
    'b7a20000-0000-4000-8000-000000000001',
    'b7a20000-0000-4000-8000-000000000005',
    'b7a20000-0000-4000-8000-000000000004',
    'cover',
    'b7a20000-0000-4000-8000-000000000001/b7a20000-0000-4000-8000-000000000005.png',
    '',0,repeat('a',64),960,540,100000,
    '[{"width":480,"height":270,"bytes":9000,"format":"webp","encoding":"lossless","path":"b7a20000-0000-4000-8000-000000000001/b7a20000-0000-4000-8000-000000000005/w480.webp"}]'::jsonb,
    'b7a20000-0000-4000-8000-000000000002'
  ) <> 'b7a20000-0000-4000-8000-000000000003' THEN
    RAISE EXCEPTION 'Retry created a duplicate';
  END IF;
  IF (SELECT count(*) FROM public.padelleria_content_media WHERE content_id='b7a20000-0000-4000-8000-000000000001') <> 2 THEN
    RAISE EXCEPTION 'Retry inserted another row';
  END IF;
END $$;

DO $$ BEGIN
  BEGIN
    PERFORM public.padelleria_register_processed_image(
      'b7a20000-0000-4000-8000-000000000001',
      'b7a20000-0000-4000-8000-000000000006',
      'b7a20000-0000-4000-8000-000000000007',
      'gallery',
      'b7a20000-0000-4000-8000-000000000001/b7a20000-0000-4000-8000-000000000006.jpg',
      '',1,repeat('b',64),960,540,100000,
      '[{"width":480,"height":270,"bytes":9000,"format":"webp","encoding":"lossy","path":"other/path.webp"}]'::jsonb,
      NULL
    );
    RAISE EXCEPTION 'Invalid variant path accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Invalid variant path accepted' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.padelleria_content_media WHERE content_id='b7a20000-0000-4000-8000-000000000001') <> 2 THEN
    RAISE EXCEPTION 'Failed registration changed media rows';
  END IF;
END $$;

-- A second atomic cover swap with no useful variants still retains the original.
SELECT public.padelleria_register_processed_image(
  'b7a20000-0000-4000-8000-000000000001',
  'b7a20000-0000-4000-8000-000000000008',
  'b7a20000-0000-4000-8000-000000000009',
  'cover',
  'b7a20000-0000-4000-8000-000000000001/b7a20000-0000-4000-8000-000000000008.jpg',
  '',0,repeat('c',64),720,400,100000,'[]'::jsonb,
  'b7a20000-0000-4000-8000-000000000003'
);

DO $$ BEGIN
  IF (SELECT count(*) FROM public.padelleria_content_media WHERE content_id='b7a20000-0000-4000-8000-000000000001' AND role='cover' AND deleted_at IS NULL) <> 1
    OR NOT (SELECT deleted_at IS NULL AND variants='[]'::jsonb FROM public.padelleria_content_media WHERE id='b7a20000-0000-4000-8000-000000000008')
    OR (SELECT deleted_at IS NULL FROM public.padelleria_content_media WHERE id='b7a20000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'Zero-variant cover replacement failed';
  END IF;
  IF public.padelleria_register_processed_image(
    'b7a20000-0000-4000-8000-000000000001',
    'b7a20000-0000-4000-8000-000000000010',
    'b7a20000-0000-4000-8000-000000000009',
    'cover',
    'b7a20000-0000-4000-8000-000000000001/b7a20000-0000-4000-8000-000000000010.jpg',
    '',0,repeat('c',64),720,400,100000,'[]'::jsonb,
    'b7a20000-0000-4000-8000-000000000003'
  ) <> 'b7a20000-0000-4000-8000-000000000008' THEN
    RAISE EXCEPTION 'Zero-variant retry inserted duplicate';
  END IF;
  IF (SELECT count(*) FROM public.padelleria_content_media WHERE content_id='b7a20000-0000-4000-8000-000000000001') <> 3 THEN
    RAISE EXCEPTION 'Zero-variant retry changed row count';
  END IF;
END $$;
ROLLBACK;
