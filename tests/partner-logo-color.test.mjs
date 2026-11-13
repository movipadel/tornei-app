import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { analyzePartnerLogoPixels } from '../src/lib/partnerLogoColor.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const pixels = (color, width = 32, height = 32) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([...color, 255], i);
  return data;
};

test('opaque dark and light logos match their outer color without a white frame', () => {
  assert.deepEqual(analyzePartnerLogoPixels(pixels([5, 5, 8]), 32, 32), { kind: 'opaque', color: 'rgb(5, 5, 8)' });
  assert.deepEqual(analyzePartnerLogoPixels(pixels([242, 238, 229]), 32, 32), { kind: 'opaque', color: 'rgb(242, 238, 229)' });
});

test('transparent pixels preserve alpha rather than receiving an opaque background', () => {
  const data = pixels([4, 4, 4]);
  data[(16 * 32 + 16) * 4 + 3] = 120;
  assert.deepEqual(analyzePartnerLogoPixels(data, 32, 32), { kind: 'transparent', color: null });
});

test('one anomalous corner cannot override the dominant edge color', () => {
  const data = pixels([6, 7, 8]);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) data.set([250, 250, 250, 255], (y * 32 + x) * 4);
  assert.deepEqual(analyzePartnerLogoPixels(data, 32, 32), { kind: 'opaque', color: 'rgb(6, 7, 8)' });
});

test('multicolor edges and unreadable pixel input use the transparent fallback', () => {
  const data = pixels([4, 4, 4]);
  for (let y = 0; y < 32; y++) for (let x = 16; x < 32; x++) data.set([245, 235, 225, 255], (y * 32 + x) * 4);
  assert.deepEqual(analyzePartnerLogoPixels(data, 32, 32), { kind: 'fallback', color: null });
  assert.deepEqual(analyzePartnerLogoPixels(new Uint8ClampedArray(0), 32, 32), { kind: 'fallback', color: null });
});

test('public detail, directory and Admin preview share the sampled logo component', async () => {
  const [component, css, detail, directory, admin, editor] = await Promise.all([
    read('src/components/partner/PartnerLogo.tsx'),
    read('src/components/partner/PartnerLogo.module.css'),
    read('src/app/partner/[slug]/page.tsx'),
    read('src/app/partner/page.tsx'),
    read('src/app/admin/partners/PartnerPreview.tsx'),
    read('src/app/admin/partners/PartnerEditor.tsx'),
  ]);
  assert.match(component, /probe\.crossOrigin = "anonymous"/);
  assert.match(component, /probe\.onerror = \(\) => resolve\(null\)/);
  assert.match(component, /catch \{[\s\S]*?resolve\(null\)/);
  assert.match(component, /canvas\.width = 32/);
  assert.match(component, /sampledColors\.set\(src, result\)/);
  assert.match(css, /background: transparent/);
  assert.match(css, /object-fit: contain/);
  assert.doesNotMatch(css, /background:\s*(?:#fff|white)/i);
  for (const source of [detail, directory, admin, editor]) assert.match(source, /<PartnerLogo src=/);
});
