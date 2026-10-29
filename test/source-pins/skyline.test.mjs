// SOURCE PINS moved out of test/skyline.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the fetch waits for the first frame and never blocks first paint (source pin)
//      wiring + absence pin (src/fight/skyline.ts, src/fight/scene.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle
//  - the strip reads the row\'s file (source pin: the loader is the browser TextureLoader, which node cannot run)
//      wiring pin (src/fight/skyline.ts): pins what the module's source imports or names (an import boundary, a list of row keys it must read); the module imports under node, but no runtime observes an import edge or an unread key, so the text check stays

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the fetch waits for the first frame and never blocks first paint (source pin) (source pin)', () => {
  const src = read('../../src/fight/skyline.ts');
  assert.match(src, /afterFirstFrame\(\)\s*\n?\s*\.then/);   // the fetch is chained behind the first-frame gate
  assert.ok(src.indexOf('afterFirstFrame()') < src.indexOf('load()'));
  assert.match(src, /loadAfterFirstFrameMs/);
  assert.doesNotMatch(src, /\bawait\b/);   // nothing in the scene build awaits it
  const scene = read('../../src/fight/scene.ts');
  assert.match(scene, /createSkyline\(scene, /);
  assert.match(scene, /skyline\?\.update\(camera\.position, dt\)/);
  assert.doesNotMatch(scene, /await[^\n]*skyline/);
  assert.match(scene, /skyline\?\.update\(camera\.position, dt\);[^\n]*\n(\s*skyfold\?\.update\(camera\.position, dt, skyline\);[^\n]*\n)?\s*syncIdleFoes\(practice, dt\);/);   // after rig.update placed the camera, before the draw, and on its own line: a trailing // comment must never swallow the next statement (the #119 bug class)
  assert.ok(scene.indexOf('rig.update(dt, state') < scene.indexOf('skyline?.update('));
  assert.match(src, /depthWrite: false/); assert.match(src, /fog: false/); assert.match(src, /renderOrder = SKYLINE_ORDER/); assert.match(src, /SKYLINE_ORDER = -1000/);
});

test('the strip reads the row\'s file (source pin: the loader is the browser TextureLoader, which node cannot run) (source pin)', () => {
  assert.match(read('../../src/fight/skyline.ts'), /row\.file/);
});

