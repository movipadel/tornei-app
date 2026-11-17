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
const staffId = randomUUID(), rewardId = randomUUID(), categoryId = randomUUID(), lineId = randomUUID(), productId = randomUUID(), colorId = randomUUID();
const email = `catalog-b3-${staffId}@example.invalid`;
const jpeg = readFileSync('public/home/padel-court.jpg');
const logo = readFileSync('public/branding/movi-padelleria.png');
const buckets = ['reward-images', 'store-images'];
const createdBuckets = [];
const objects = new Map(buckets.map(bucket => [bucket, new Set()]));
let checks = 0;
const checked = result => { assert.ifError(result.error); checks++; return result.data; };
const form = (bytes, mime, profile, requestId) => {
  const body = new FormData();
  body.set('file', new Blob([bytes], { type: mime }), `synthetic.${mime.split('/')[1]}`);
  body.set('image_profile', profile);
  body.set('request_id', requestId);
  return body;
};
const post = async (kind, body, cookie) => {
  const path = kind === 'reward' ? '/api/admin/moviback/rewards/image' : '/api/admin/store/products/image';
  const response = await fetch(base + path, { method: 'POST', headers: cookie ? { Cookie: cookie } : {}, body });
  return { status: response.status, json: await response.json() };
};
const track = async (bucket, upload) => {
  objects.get(bucket).add(upload.json.path);
  const row = checked(await db.from('movi_image_variants').select('*').eq('bucket_id', bucket).eq('original_path', upload.json.path).single());
  for (const variant of row.variants) objects.get(bucket).add(variant.path);
  return row;
};
try {
  for (const bucket of buckets) {
    const current = await db.storage.getBucket(bucket);
    if (current.error) {
      checked(await db.storage.createBucket(bucket, { public: true, fileSizeLimit: '5MB', allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] }));
      createdBuckets.push(bucket);
    } else {
      assert.equal(current.data.public, true); checks++;
    }
  }
  checked(await db.from('staff_users').insert({ id: staffId, email, full_name: 'Catalog B3 Local', role: 'admin', is_active: true }));
  checked(await db.rpc('set_staff_password', { p_staff_id: staffId, p_password: 'Catalog-B3-Local-2026!' }));
  const login = await fetch(`${base}/api/admin/login`, { method: 'POST', body: new URLSearchParams({ email, password: 'Catalog-B3-Local-2026!' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.ok(cookie); checks++;
  assert.equal((await post('reward', form(jpeg, 'image/jpeg', 'poster', randomUUID()), '')).status, 401);
  assert.equal((await post('store', form(jpeg, 'image/jpeg', 'photo', randomUUID()), '')).status, 401); checks++;
  assert.ok((await anon.from('movi_image_variants').select('original_path')).error);
  assert.ok((await anon.storage.from('reward-images').upload(`unauthorized-${randomUUID()}.png`, new Uint8Array([1]))).error);
  assert.ok((await anon.storage.from('store-images').upload(`unauthorized-${randomUUID()}.png`, new Uint8Array([1]))).error); checks++;

  const rewardRequest = randomUUID();
  const reward = await post('reward', form(logo, 'image/png', 'logo', rewardRequest), cookie);
  assert.equal(reward.status, 201, JSON.stringify(reward.json));
  const rewardRow = await track('reward-images', reward);
  assert.equal(rewardRow.profile, 'logo');
  assert.equal(rewardRow.source_sha256, createHash('sha256').update(logo).digest('hex'));
  assert.deepEqual(rewardRow.variants.map(v => v.width), [480, 960, 1600]);
  assert.ok(rewardRow.variants.every(v => v.encoding === 'lossless'));
  assert.deepEqual(Buffer.from(await checked(await db.storage.from('reward-images').download(reward.json.path)).arrayBuffer()), logo); checks++;
  for (const variant of rewardRow.variants) {
    const bytes = Buffer.from(await checked(await db.storage.from('reward-images').download(variant.path)).arrayBuffer());
    const meta = await sharp(bytes).metadata();
    assert.equal(bytes.length, variant.bytes);
    assert.equal(meta.width, variant.width);
    assert.equal(meta.format, 'webp');
    assert.equal(meta.exif, undefined);
  }
  checks++;
  const rewardRetry = await post('reward', form(logo, 'image/png', 'logo', rewardRequest), cookie);
  assert.equal(rewardRetry.status, 200);
  assert.equal(rewardRetry.json.path, reward.json.path); checks++;
  assert.equal((await post('reward', form(jpeg, 'image/jpeg', 'poster', rewardRequest), cookie)).status, 409); checks++;

  const storeRequest = randomUUID();
  const [storeA, storeB] = await Promise.all([
    post('store', form(jpeg, 'image/jpeg', 'photo', storeRequest), cookie),
    post('store', form(jpeg, 'image/jpeg', 'photo', storeRequest), cookie),
  ]);
  assert.deepEqual([storeA.status, storeB.status].sort(), [200, 201], JSON.stringify([storeA, storeB]));
  assert.equal(storeA.json.path, storeB.json.path);
  const storeRow = await track('store-images', storeA);
  assert.equal(storeRow.profile, 'photo');
  assert.deepEqual(storeRow.variants.map(v => v.width), [480, 720]);
  assert.deepEqual(Buffer.from(await checked(await db.storage.from('store-images').download(storeA.json.path)).arrayBuffer()), jpeg); checks++;
  const malformed = await post('store', form(Buffer.from([137, 80, 78, 71, 1]), 'image/png', 'photo', randomUUID()), cookie);
  assert.equal(malformed.status, 400); checks++;
  const optimized = await sharp(jpeg).resize(160).webp({ quality: 20 }).toBuffer();
  const zero = await post('store', form(optimized, 'image/webp', 'photo', randomUUID()), cookie);
  assert.equal(zero.status, 201, JSON.stringify(zero.json));
  const zeroRow = await track('store-images', zero);
  assert.deepEqual(zeroRow.variants, []); checks++;
  const poster = await post('store', form(jpeg, 'image/jpeg', 'poster', randomUUID()), cookie);
  assert.equal(poster.status, 201, JSON.stringify(poster.json));
  const posterRow = await track('store-images', poster);
  assert.equal(posterRow.profile, 'poster');
  assert.ok(posterRow.variants.every(v => v.encoding === 'lossy')); checks++;

  checked(await db.from('rewards_catalog').insert({ id: rewardId, name: 'Premio B3 sintetico', points_cost: 100, image_path: reward.json.url, is_active: true }));
  const adminRewards = await fetch(`${base}/api/admin/moviback/rewards`, { headers: { Cookie: cookie } });
  assert.equal(adminRewards.status, 200);
  const rewardRead = (await adminRewards.json()).data.find(item => item.id === rewardId);
  assert.deepEqual(rewardRead.image_srcset.split(', ').map(value => Number(value.match(/ (\d+)w$/)?.[1])), [480, 960, 1600, 5545]); checks++;
  checked(await db.from('store_categories').insert({ id: categoryId, name: 'B3 sintetica', slug: `b3-${categoryId}` }));
  checked(await db.from('store_lines').insert({ id: lineId, name: 'B3 sintetica', slug: `b3-${lineId}` }));
  checked(await db.from('store_products').insert({ id: productId, category_id: categoryId, line_id: lineId, name: 'Prodotto B3 sintetico', base_price_euro: 10, is_active: true }));
  checked(await db.from('store_product_colors').insert({ id: colorId, product_id: productId, color_name: 'Blu', image_path: storeA.json.path, is_active: true }));
  const storeReadResponse = await fetch(`${base}/api/store/products`);
  assert.equal(storeReadResponse.status, 200);
  const product = (await storeReadResponse.json()).data.products.find(item => item.id === productId);
  assert.ok(product);
  assert.equal(product.colors[0].image_path, storeA.json.path);
  assert.deepEqual(product.colors[0].image_srcset.split(', ').map(value => Number(value.match(/ (\d+)w$/)?.[1])), [480, 720]); checks++;
  if (process.env.B3_VISUAL_HOLD === '1') {
    console.log('Synthetic LOCAL Store product ready for viewport inspection; press Enter to finish and clean up.');
    await new Promise(resolve => process.stdin.once('data', resolve));
  }
  checked(await db.from('store_product_colors').update({ image_path: 'legacy-image.jpg' }).eq('id', colorId));
  const legacy = (await (await fetch(`${base}/api/store/products`)).json()).data.products.find(item => item.id === productId);
  assert.equal(legacy.colors[0].image_srcset, null); checks++;

  const variantResponse = await fetch(product.colors[0].image_srcset.split(', ')[0].replace(/ 480w$/, ''));
  const originalResponse = await fetch(reward.json.url);
  assert.equal(variantResponse.status, 200);
  assert.equal(originalResponse.status, 200);
  const variantBytes = (await variantResponse.arrayBuffer()).byteLength;
  assert.ok(variantBytes < jpeg.length);
  assert.equal((await originalResponse.arrayBuffer()).byteLength, logo.length); checks++;
  console.log(`Catalog B3 LOCAL HTTP PASS: ${checks} checks; store_photo_original=${jpeg.length} bytes; store_480=${variantBytes} bytes; reward_logo_original=${logo.length} bytes; reward_variants=${rewardRow.variants.map(v => v.bytes).join('/')}`);
} finally {
  await db.from('rewards_catalog').delete().eq('id', rewardId);
  await db.from('store_product_colors').delete().eq('id', colorId);
  await db.from('store_products').delete().eq('id', productId);
  await db.from('store_lines').delete().eq('id', lineId);
  await db.from('store_categories').delete().eq('id', categoryId);
  for (const bucket of buckets) {
    const paths = [...objects.get(bucket)];
    if (paths.length) {
      await db.from('movi_image_variants').delete().eq('bucket_id', bucket).in('original_path', paths.filter(path => path.startsWith('images/')));
      await db.storage.from(bucket).remove(paths);
    }
  }
  await db.from('staff_users').delete().eq('id', staffId);
  for (const bucket of createdBuckets) await db.storage.deleteBucket(bucket);
}
