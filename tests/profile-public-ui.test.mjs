import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const profileFiles = [
  'src/app/profilo/page.tsx',
  'src/components/PlayerProfileFields.tsx',
  'src/app/api/user/profile/route.ts',
  'src/lib/playerProfile.ts',
];

test('profile copy keeps representative Italian UTF-8 characters at the source', async () => {
  const [page, fields] = await Promise.all([
    read('src/app/profilo/page.tsx'),
    read('src/components/PlayerProfileFields.tsx'),
  ]);
  const source = page + fields;
  for (const value of ['È', 'è', 'Più', 'Attività', 'Profilo', 'Preferenze', 'Disponibilità', 'lunedì', 'perché']) {
    assert.ok(source.includes(value), `missing UTF-8 profile copy: ${value}`);
  }
  for (const path of profileFiles) {
    const contents = await read(path);
    for (const broken of ['Ã', 'Â', 'â€™', '�']) assert.equal(contents.includes(broken), false, `${path} contains ${broken}`);
  }
});

test('profile uses the existing public shell and a scoped dark appearance', async () => {
  const [layout, shell, page, css, fields, fieldCss] = await Promise.all([
    read('src/app/layout.tsx'),
    read('src/components/public/PublicShell.tsx'),
    read('src/app/profilo/page.tsx'),
    read('src/app/profilo/profile.module.css'),
    read('src/components/PlayerProfileFields.tsx'),
    read('src/components/PlayerProfileFields.module.css'),
  ]);
  assert.match(layout, /<PublicShell>/);
  assert.match(shell, /<PublicHeader/);
  assert.match(shell, /<PublicBottomNav/);
  assert.match(page, /<h1>Profilo<\/h1>/);
  assert.doesNotMatch(page, /Area personale|Il mio profilo/);
  assert.match(page, /appearance="public"/);
  for (const token of ['--public-bg', '--public-surface-1', '--public-border', '--public-royal', '--public-cyan', '--public-magenta']) {
    assert.ok((css + fieldCss).includes(token), `missing public token ${token}`);
  }
  assert.match(fields, /appearance\?: 'default' \| 'public'/);
  assert.match(fields, /appearance = 'default'/);
});

test('profile interaction and persistence contracts remain unchanged', async () => {
  const [page, route, , fieldCss] = await Promise.all([
    read('src/app/profilo/page.tsx'),
    read('src/app/api/user/profile/route.ts'),
    read('src/components/PlayerProfileFields.tsx'),
    read('src/components/PlayerProfileFields.module.css'),
  ]);
  assert.match(page, /fetch\('\/api\/user\/profile'/);
  assert.match(page, /method: 'PATCH'/);
  assert.match(page, /expected_version: data\.profile\.version, profile: form/);
  assert.match(page, /response\.status === 401/);
  assert.match(page, /\/accedi\?next=%2Fprofilo/);
  assert.match(route, /getCurrentMoviUser/);
  assert.match(route, /player_profile_write_user/);
  assert.match(route, /parseSharedPlayerProfile/);
  assert.match(fieldCss, /min-height: 44px/);
  assert.match(fieldCss, /focus-visible/);
});
