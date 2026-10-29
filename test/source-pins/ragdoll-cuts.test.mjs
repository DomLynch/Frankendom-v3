// SOURCE PINS moved out of test/ragdoll-cuts.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the cut rows name the package\'s units, parts and gear slots, and the validator accepts them
//      wiring pin (src/fight/ragdoll.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle [the behaviour half stays in the original test]

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the cut rows name the package\'s units, parts and gear slots, and the validator accepts them (source pin)', async () => {

  assert.match(readFileSync(new URL('../../src/fight/ragdoll.ts', import.meta.url), 'utf8'), /!cueShown\(cue\) \|\| !cueCamera[\s\S]*!cueShown\(cue\) \|\| !canvas\.parentElement/, 'both cue builders go through cueShown');
});

