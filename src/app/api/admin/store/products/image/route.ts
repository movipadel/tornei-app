import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { guardOperatorPermission } from '@/lib/operatorAuthorization';
import { isUuid } from '@/lib/padelleria';
import { uploadPublicCatalogImage } from '@/lib/publicCatalogImageUpload';
import type { ImageProfile } from '@/lib/padelleriaImageVariants';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const denied = await guardOperatorPermission('store.manage');
  if (denied) return denied;
  if (Number(req.headers.get('content-length') ?? 0) > 6 * 1024 * 1024)
    return NextResponse.json({ error: 'Richiesta troppo grande' }, { status: 413 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Dati non validi' }, { status: 400 });
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Immagine obbligatoria' }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Immagine troppo grande. Massimo 5 MiB.' }, { status: 413 });
  const requestId = form.has('request_id') ? String(form.get('request_id')) : randomUUID();
  if (!isUuid(requestId)) return NextResponse.json({ error: 'ID upload non valido' }, { status: 400 });
  const profile = String(form.get('image_profile') ?? 'photo') as ImageProfile;
  if (!['photo', 'poster', 'logo'].includes(profile)) return NextResponse.json({ error: 'Profilo immagine non valido' }, { status: 400 });
  try {
    const image = await uploadPublicCatalogImage({ file, requestId, bucket: 'store-images', profile, signal: req.signal });
    return NextResponse.json({ ok: true, path: image.path, url: image.url }, { status: image.created ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore upload immagine';
    return NextResponse.json({ error: message }, { status: message.includes('ID upload già utilizzato') ? 409 : 400 });
  }
}
