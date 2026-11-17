import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { CIRCUIT_HOME_BUCKET, circuitHomePathFromUrl, circuitHomeSrcSet } from '../src/lib/circuitHomeImageVariants.ts';

const base = 'http://127.0.0.1:55421';
const id = '12345678-1234-4234-9234-123456789abc';
const path = `home/${id}.png`;
const original = `${base}/storage/v1/object/public/${CIRCUIT_HOME_BUCKET}/${path}`;
const variant = width => ({ width, height: Math.round(width * 9 / 16), bytes: 1000, format: 'webp', encoding: 'lossy', path: `home/variants/${id}/w${width}.webp` });

test('Circuit image URLs are restricted to the exact local public bucket and managed path', () => {
  assert.equal(circuitHomePathFromUrl(original, base), path);
  for (const url of [original + '?token=x', original.replace(base, 'https://other.example'), original.replace('/public/', '/sign/'), original.replace('/home/', '/other/'), original + '/extra']) {
    assert.equal(circuitHomePathFromUrl(url, base), null);
  }
});

test('responsive source set uses only verified manifest paths in ascending order', () => {
  const srcSet = circuitHomeSrcSet(original, { original_path: path, source_width: 2000, variants: [variant(960), variant(480), variant(1600)] }, base);
  assert.deepEqual(srcSet.split(', ').map(value => Number(value.match(/ (\d+)w$/)?.[1])), [480, 960, 1600, 2000]);
  assert.ok(srcSet.endsWith(`${original} 2000w`));
  assert.equal(circuitHomeSrcSet(original, { original_path: path, source_width: 1600, variants: [variant(480)] }, base)?.includes(' 1600w'), true);
  assert.equal(circuitHomeSrcSet(original, { original_path: path, source_width: 480, variants: [variant(480)] }, base)?.includes(`${original} 480w`), false);
});

test('historical, zero-variant and malformed manifests retain the original URL fallback', () => {
  assert.equal(circuitHomeSrcSet(original, null, base), null);
  assert.equal(circuitHomeSrcSet(original, { original_path: path, source_width: 1600, variants: [] }, base), null);
  assert.equal(circuitHomeSrcSet(original, { original_path: path, source_width: 1600, variants: [{ ...variant(480), path: 'other/file.webp' }] }, base), null);
  assert.equal(circuitHomeSrcSet(original, { original_path: `home/${id}.jpg`, source_width: 1600, variants: [variant(480)] }, base), null);
});

test('Home keeps the same circuit card geometry and uses responsive sizes', async () => {
  const page = await readFile(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/app/HomeV2.module.css', import.meta.url), 'utf8');
  assert.match(page, /srcSet=\{circuit\.home_image_srcset \?\? undefined\} sizes="\(min-width: 1024px\) 324px, \(min-width: 768px\) 317px, 84vw"/);
  assert.match(page, /onError=\{circuit\.home_image_srcset/);
  assert.match(css, /\.circuitImage \{[^}]*position: absolute;[^}]*inset: 0;[^}]*object-fit: cover/);
});
