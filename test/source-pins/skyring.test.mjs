// SOURCE PINS moved out of test/skyring.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the baked pictures ship: WebP at the sizes the rows say, the first visit fetches none of them, the weights are in the budget table
//      wiring + absence pin (src/fight/scene.ts, index.html): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle [the behaviour half stays in the original test]

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the baked pictures ship: WebP at the sizes the rows say, the first visit fetches none of them, the weights are in the budget table (source pin)', () => {

  const main = readFileSync(new URL('../../src/fight/scene.ts', import.meta.url), 'utf8') + readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.ok(!/ring-(east|south|west)/.test(main), 'no ring file is named in the first-visit code');
});

