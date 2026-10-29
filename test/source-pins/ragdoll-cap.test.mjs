// SOURCE PINS moved out of test/ragdoll-cap.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the row is the package\'s (3 today) and V3 reads it, not a copy
//      wiring + absence pin (src/fight/ragdoll.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle [the behaviour half stays in the original test]

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the row is the package\'s (3 today) and V3 reads it, not a copy (source pin)', () => {

  const src = readFileSync(new URL('../../src/fight/ragdoll.ts', import.meta.url), 'utf8');
  assert.match(src, /admitRagdoll\(chunk!, worldRagdolls\)/);
  assert.match(src, /const worldRagdolls = new Set/);
  assert.doesNotMatch(src, /^const worldRagdolls/m);   // per foe (per Jolt world), never module-global
  assert.doesNotMatch(src, /max_simultaneous_ragdolls\s*[:=]\s*\d/);
});

