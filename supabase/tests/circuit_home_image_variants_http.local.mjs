import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

if (process.env.PADELLERIA_LOCAL_VERIFIED !== '1') throw new Error('Verified local runner required');
const status = JSON.parse(execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'], { encoding: 'utf8' }));
if (status.API_URL !== 'http://127.0.0.1:55421' || status.DB_URL !== 'postgresql://postgres:postgres@127.0.0.1:55422/postgres' || status.linked_project)
  throw new Error('STOP: Supabase target is not exclusively local');
const base = 'http://127.0.0.1:3101';
const db = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
const bucket = 'circuit-home-images';
const staffId = randomUUID(), circuitId = randomUUID(), slug = `circuit-b2-local-${circuitId}`;
const email = `circuit-b2-${staffId}@example.invalid`;
const jpeg = readFileSync('public/home/padel-court.jpg');
const objects = new Set();
let checks = 0;
const checked = result => { assert.ifError(result.error); checks++; return result.data; };
const upload = (bytes, mime, requestId) => {
  const body = new FormData();
  body.set('file', new Blob([bytes], { type: mime }), `synthetic.${mime.split('/')[1]}`);
  body.set('request_id', requestId);
  return body;
};
const post = async (body, cookie) => {
  const response = await fetch(`${base}/api/admin/circuits/home-image`, { method: 'POST', headers: cookie ? { Cookie: cookie } : {}, body });
  return { status: response.status, json: await response.json() };
};
try {
  checked(await db.from('staff_users').insert({ id: staffId, email, full_name: 'Circuit B2 Local', role: 'admin', is_active: true }));
  checked(await db.rpc('set_staff_password', { p_staff_id: staffId, p_password: 'Circuit-B2-Local-2026!' }));
  checked(await db.from('circuits').insert({ id: circuitId, slug, name: 'Circuit B2 Local', tournament_type: 'Baraonda', status: 'active' }));
  const login = await fetch(`${base}/api/admin/login`, { method: 'POST', body: new URLSearchParams({ email, password: 'Circuit-B2-Local-2026!' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.ok(cookie); checks++;
  assert.equal((await post(upload(jpeg, 'image/jpeg', randomUUID()), '')).status, 401); checks++;

  const firstRequest = randomUUID();
  const first = await post(upload(jpeg, 'image/jpeg', firstRequest), cookie);
  assert.equal(first.status, 201, JSON.stringify(first.json));
  objects.add(first.json.path);
  const row = checked(await db.from('movi_image_variants').select('*').eq('bucket_id', bucket).eq('request_id', firstRequest).single());
  assert.equal(row.original_path, first.json.path);
  assert.equal(row.source_sha256, createHash('sha256').update(jpeg).digest('hex'));
  assert.equal(row.source_bytes, jpeg.length);
  assert.deepEqual(row.variants.map(v => v.width), [480, 720]); checks++;
  assert.ok((await anon.from('movi_image_variants').select('original_path').eq('bucket_id', bucket)).error);
  assert.ok((await anon.storage.from(bucket).upload(`home/unauthorized-${randomUUID()}.webp`, new Uint8Array([1]))).error); checks++;
  for (const variant of row.variants) objects.add(variant.path);
  const original = checked(await db.storage.from(bucket).download(row.original_path));
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), jpeg); checks++;
  for (const variant of row.variants) {
    const file = checked(await db.storage.from(bucket).download(variant.path));
    const bytes = Buffer.from(await file.arrayBuffer());
    const meta = await sharp(bytes).metadata();
    assert.equal(bytes.length, variant.bytes);
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, variant.width);
    assert.equal(meta.exif, undefined);
  }
  checks++;
  const retry = await post(upload(jpeg, 'image/jpeg', firstRequest), cookie);
  assert.equal(retry.status, 200);
  assert.equal(retry.json.path, first.json.path); checks++;
  const collision = await post(upload(await sharp(jpeg).resize(160).webp().toBuffer(), 'image/webp', firstRequest), cookie);
  assert.equal(collision.status, 409); checks++;
  const rotated = await sharp({ create: { width: 120, height: 60, channels: 3, background: '#2776bb' } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const oriented = await post(upload(rotated, 'image/jpeg', randomUUID()), cookie);
  assert.equal(oriented.status, 201, JSON.stringify(oriented.json));
  objects.add(oriented.json.path);
  const orientedRow = checked(await db.from('movi_image_variants').select('source_width,source_height,variants').eq('bucket_id', bucket).eq('original_path', oriented.json.path).single());
  assert.equal(orientedRow.source_width, 60);
  assert.equal(orientedRow.source_height, 120);
  for (const variant of orientedRow.variants) objects.add(variant.path);
  checks++;

  const concurrentId = randomUUID();
  const concurrent = await Promise.all([post(upload(jpeg, 'image/jpeg', concurrentId), cookie), post(upload(jpeg, 'image/jpeg', concurrentId), cookie)]);
  assert.deepEqual(concurrent.map(value => value.status).sort(), [200, 201], JSON.stringify(concurrent));
  assert.equal(concurrent[0].json.path, concurrent[1].json.path);
  const concurrentRow = checked(await db.from('movi_image_variants').select('original_path,variants').eq('bucket_id', bucket).eq('request_id', concurrentId).single());
  objects.add(concurrentRow.original_path);
  for (const variant of concurrentRow.variants) objects.add(variant.path);
  checks++;

  checked(await db.from('circuits').update({ home_image_url: first.json.url }).eq('id', circuitId));
  const listingResponse = await fetch(`${base}/api/circuits`);
  assert.equal(listingResponse.status, 200);
  const listing = (await listingResponse.json()).data.find(circuit => circuit.id === circuitId);
  assert.equal(listing.home_image_url, first.json.url);
  assert.deepEqual(listing.home_image_srcset.split(', ').map(value => Number(value.match(/ (\d+)w$/)?.[1])), [480, 720]); checks++;
  const variantResponse = await fetch(listing.home_image_srcset.split(', ')[0].replace(/ 480w$/, ''));
  const originalResponse = await fetch(listing.home_image_url);
  assert.equal(variantResponse.status, 200);
  assert.equal(originalResponse.status, 200);
  const variantBytes = (await variantResponse.arrayBuffer()).byteLength;
  assert.equal((await originalResponse.arrayBuffer()).byteLength, jpeg.length);
  assert.ok(variantBytes < jpeg.length); checks++;
  if (process.env.CIRCUIT_VISUAL_PAUSE_MS) {
    console.log('Synthetic Circuit B2 visual fixture is ready on the local Home.');
    await new Promise(resolve => setTimeout(resolve, Math.min(Number(process.env.CIRCUIT_VISUAL_PAUSE_MS) || 0, 240000)));
  }

  const corrupt = await post(upload(Buffer.from([137, 80, 78, 71, 1]), 'image/png', randomUUID()), cookie);
  assert.equal(corrupt.status, 400);
  const afterFailed = checked(await db.from('circuits').select('home_image_url').eq('id', circuitId).single());
  assert.equal(afterFailed.home_image_url, first.json.url); checks++;
  const zeroBytes = await sharp(jpeg).resize(160).webp({ quality: 20 }).toBuffer();
  const zero = await post(upload(zeroBytes, 'image/webp', randomUUID()), cookie);
  assert.equal(zero.status, 201, JSON.stringify(zero.json));
  objects.add(zero.json.path);
  const zeroRow = checked(await db.from('movi_image_variants').select('variants').eq('bucket_id', bucket).eq('original_path', zero.json.path).single());
  assert.deepEqual(zeroRow.variants, []); checks++;
  checked(await db.from('circuits').update({ home_image_url: zero.json.url }).eq('id', circuitId));
  const zeroListing = (await (await fetch(`${base}/api/circuits`)).json()).data.find(circuit => circuit.id === circuitId);
  assert.equal(zeroListing.home_image_srcset, null); checks++;
  const deletePrevious = await fetch(`${base}/api/admin/circuits/home-image`, {
    method: 'DELETE', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: first.json.url }),
  });
  assert.equal(deletePrevious.status, 200);
  assert.equal((await deletePrevious.json()).retained, true); checks++;
  const retained = checked(await db.storage.from(bucket).download(first.json.path));
  assert.deepEqual(Buffer.from(await retained.arrayBuffer()), jpeg); checks++;

  console.log(`Circuit B2 LOCAL HTTP PASS: ${checks} checks; original=${jpeg.length} bytes; 480px=${variantBytes} bytes; cache_control=${variantResponse.headers.get('cache-control') ?? 'absent'}`);
} finally {
  await db.from('circuits').delete().eq('id', circuitId);
  const manifests = await db.from('movi_image_variants').select('original_path,variants').eq('bucket_id', bucket).in('original_path', [...objects].filter(value => /^home\/[^/]+\.(?:jpg|png|webp)$/.test(value)));
  if (!manifests.error) await db.from('movi_image_variants').delete().eq('bucket_id', bucket).in('original_path', manifests.data.map(value => value.original_path));
  if (objects.size) await db.storage.from(bucket).remove([...objects]);
  await db.from('staff_users').delete().eq('id', staffId);
}
