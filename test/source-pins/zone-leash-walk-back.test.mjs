// SOURCE PINS moved out of test/zone-leash-walk-back.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the page: a leash starts the walk when alone, keeps the instant reset with another boss on him, and every exit clears it
//      wiring pin (src/client/main.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the page: a leash starts the walk when alone, keeps the instant reset with another boss on him, and every exit clears it (source pin)', () => {
  const main = read('../../src/client/main.ts');
  assert.match(main, /leashed\(spawns\[current\]!, practice\.enemy, openerLift\)\) \{ if \(walkBackEnabled && !attackers\.some\(\(a\) => !a\.dead\)\) \{ walkBack = true; engaged = false; \} else leashReset\(current, hero\); \}/);
  assert.match(main, /if \(walkBack\) practice = holdBack\(prior, practice, spawns\[current\]!\);/);
  assert.match(main, /reaggro\(spawns\[current\]!, practice\.enemy, hero\)\) \{ walkBack = false; engaged = true; \}/);
  assert.match(main, /arrived\(spawns\[current\]!, practice\.enemy\)\) leashReset\(current, hero\);/);
  for (const fn of ['function rematch', 'function leashReset', 'function adoptAttacker']) {
    const at = main.indexOf(fn);
    assert.match(main.slice(at, at + 1200), /walkBack = false/, `${fn} clears the walk`);
  }
});

