// SOURCE PINS moved out of test/presence/rows.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - main.ts keeps the guard: on the presence path, zoneFrameOk(origin) returns early BEFORE startZonePresence is called (deleting it must fail here)
//      wiring + absence pin (src/client/main.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle
//  - src/presence (the page side) imports nothing from server/, and nothing in it touches node: it can only ever be bundled for the browser
//      absence pin (source text): a grep gate, dead or forbidden code must not come back; no runtime can observe an absence
//  - nothing in the game bundle statically imports the presence chunk: main.ts reaches it only through a dynamic import behind ?presence=
//      wiring + absence pin (src/client/main.ts, client/main.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

test('main.ts keeps the guard: on the presence path, zoneFrameOk(origin) returns early BEFORE startZonePresence is called (deleting it must fail here) (source pin)', () => {
  const main = readFileSync(new URL('../../src/client/main.ts', import.meta.url), 'utf8').replace(/\s\/\/.*$/gm, '');
  const line = main.split('\n').find((l) => /import\('\.\.\/presence\/chunk\.ts'\)/.test(l));
  assert.ok(line, 'the presence import line exists');
  assert.match(line, /zoneFrameOk\(origin\)\)\s*return[^;]*;[^]*startZonePresence\(/, 'the guard returns before startZonePresence');
  assert.ok(line.indexOf('zoneFrameOk(origin)') < line.indexOf('startZonePresence('), 'guard first');
  const without = line.replace(/if \(!m\.zoneFrameOk\(origin\)\) return[^;]*;/, '');
  assert.doesNotMatch(without, /zoneFrameOk\(origin\)\)\s*return/, 'the same check bites when the guard is removed');
});

test('src/presence (the page side) imports nothing from server/, and nothing in it touches node: it can only ever be bundled for the browser (source pin)', () => {
  const dir = new URL('../../src/presence/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(src, /from\s+['"][^'"]*server\//, `${f} does not import the service`);
    assert.doesNotMatch(src, /from\s+['"]node:/, `${f} does not import a node module`);
  }
});

test('nothing in the game bundle statically imports the presence chunk: main.ts reaches it only through a dynamic import behind ?presence= (source pin)', () => {
  const main = readFileSync(new URL('../../src/client/main.ts', import.meta.url), 'utf8');
  const hits = main.split('\n').filter((l) => /import\(.*presence\/chunk\.ts/.test(l) || /^import .*presence\/chunk/.test(l));
  assert.equal(hits.length, 1);
  assert.match(hits[0], /\/\[\?&\]presence=\/\.test\(search\)\) void import\('\.\.\/presence\/chunk\.ts'\)/, 'one dynamic import, behind the flag');
  assert.doesNotMatch(main, /^import .*presence/m, 'no static import');
  for (const f of readdirSync(new URL('../../src/', import.meta.url), { recursive: true }).filter((n) => /\.(ts|js)$/.test(n) && !n.startsWith('presence/') && n !== 'client/main.ts')) {
    assert.doesNotMatch(readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8'), /(from\s+|import\()['"][^'"]*presence\/(chunk|client|track|rows)/, `${f} does not reach the presence code`);
  }
});

