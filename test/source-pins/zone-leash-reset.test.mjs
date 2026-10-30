// SOURCE PINS moved out of test/zone-leash-reset.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the page: a leash calls leashReset (only that boss), never hand / rematch / fresh
//      wiring + absence pin (src/client/main.ts, test/zone-leash-walk-back.test.mjs): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the page: a leash calls leashReset (only that boss), never hand / rematch / fresh (source pin)', () => {
  const main = read('../../src/client/main.ts');
  assert.match(main, /leashed\(spawns\[current\]!, practice\.enemy, openerLift\)\) \{ if \(walkBackEnabled && !attackers\.some\(\(a\) => !a\.dead\)\) \{ walkBack = true; engaged = false; \} else leashReset\(current, hero\); \}/);   // alone it walks home first (test/zone-leash-walk-back.test.mjs); the reset itself is unchanged
  const fn = main.slice(main.indexOf('function leashReset'), main.indexOf('/** The opening pose of attacker'));
  assert.doesNotMatch(fn, /fresh\(|rematch\(|\bhand\(/);
  assert.match(fn, /resetHeld\(practice, attackers, index,/);
});

