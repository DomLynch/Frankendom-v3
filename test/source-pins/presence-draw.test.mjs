// SOURCE PINS moved out of test/presence/draw.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the default page is untouched: main.ts names the seam only inside the ?presence= branch, scene.ts spawnRemote sits in one marked block and is called f
//      wiring + absence pin (src/client/main.ts, src/fight/scene.ts, src/presence/draw.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the default page is untouched: main.ts names the seam only inside the ?presence= branch, scene.ts spawnRemote sits in one marked block and is called from nowhere else, draw.ts imports no THREE (source pin)', () => {
  const main = readFileSync(new URL('../../src/client/main.ts', import.meta.url), 'utf8'), scene = readFileSync(new URL('../../src/fight/scene.ts', import.meta.url), 'utf8');
  const draw = readFileSync(new URL('../../src/presence/draw.ts', import.meta.url), 'utf8');
  assert.equal(main.split('\n').filter((l) => /spawnRemote|startZonePresence|__v3HeroPose/.test(l)).length, 1, 'one line in main.ts, the one behind /[?&]presence=/');
  assert.match(main.split('\n').find((l) => /spawnRemote/.test(l)), /^if \(\/\[\?&\]presence=\/\.test\(search\)\)/);
  assert.equal((scene.match(/spawnRemote/g) ?? []).length, 1);
  assert.doesNotMatch(draw, /from\s+['"]three['"]/);
  assert.doesNotMatch(draw, /fetch\(|new WebSocket|XMLHttpRequest/, 'draw.ts fetches nothing');
});

