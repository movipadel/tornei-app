import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { catalogImagePath, catalogImageSrcSet, catalogImageUrl } from '../src/lib/publicCatalogImageVariants.ts';

const base = 'http://127.0.0.1:55421';
const id = '12345678-1234-4234-9234-123456789abc';
const path = `images/${id}.png`;
const variant = width => ({ width, height: width, bytes: 1000, format: 'webp', encoding: 'lossy', path: `variants/${id}/w${width}.webp` });

for (const bucket of ['reward-images', 'store-images']) {
  test(`${bucket}: manifest maps only its own public URLs and safe paths`, () => {
    const url = catalogImageUrl(path, bucket, base);
    assert.equal(catalogImagePath(url, bucket, base), path);
    assert.equal(catalogImagePath(path, bucket, base), path);
    assert.equal(catalogImagePath(url.replace(bucket, bucket === 'reward-images' ? 'store-images' : 'reward-images'), bucket, base), null);
    assert.equal(catalogImagePath(url.replace(base, 'https://other.example'), bucket, base), null);
    assert.equal(catalogImagePath(url + '?token=x', bucket, base), null);
    assert.equal(catalogImagePath('legacy-file.png', bucket, base), null);
  });

  test(`${bucket}: 0, 1 and 3 variants retain original fallback`, () => {
    const url = catalogImageUrl(path, bucket, base);
    assert.equal(catalogImageSrcSet(url, null, bucket, base), null);
    assert.equal(catalogImageSrcSet(path, { original_path: path, source_width: 1600, variants: [] }, bucket, base), null);
    const one = catalogImageSrcSet(url, { original_path: path, source_width: 1600, variants: [variant(480)] }, bucket, base);
    assert.deepEqual(one.split(', ').map(value => Number(value.match(/ (\d+)w$/)?.[1])), [480, 1600]);
    assert.ok(one.endsWith(`${url} 1600w`));
    const three = catalogImageSrcSet(path, { original_path: path, source_width: 1600, variants: [variant(1600), variant(480), variant(960)] }, bucket, base);
    assert.deepEqual(three.split(', ').map(value => Number(value.match(/ (\d+)w$/)?.[1])), [480, 960, 1600]);
    assert.ok(!three.includes(`${url} 1600w`));
    assert.equal(catalogImageSrcSet(url, { original_path: path, source_width: 1600, variants: [{ ...variant(480), path: 'other.webp' }] }, bucket, base), null);
  });
}

test('reward and Store rendering adds responsive hints without changing buying or redemption calls', async () => {
  const reward = await readFile(new URL('../src/app/moviback/premi/page.tsx', import.meta.url), 'utf8');
  const store = await readFile(new URL('../src/app/store/page.tsx', import.meta.url), 'utf8');
  assert.match(reward, /srcSet=\{reward\.image_srcset \?\? undefined\}/);
  assert.match(reward, /sizes="104px"/);
  assert.match(reward, /\/api\/moviback\/rewards\/redeem/);
  assert.match(store, /srcSet=\{firstColor\?\.image_srcset \?\? undefined\}/);
  assert.match(store, /sizes="\(min-width: 1100px\) 490px, \(min-width: 768px\) 46vw, 44vw"/);
  assert.match(store, /srcSet=\{color\?\.image_srcset \?\? undefined\}/);
  assert.match(store, /sizes="\(min-width: 640px\) 520px, 90vw"/);
  assert.match(store, /\/api\/store\/orders/);
});
