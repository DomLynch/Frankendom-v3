// SOURCE PINS moved out of test/lock-switch.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the page wiring is pinned: gated by the soft lock and the attackers, its own press listener, only a locked live fight, no look/cut listener touched
//      wiring pin (src/client/main.ts, src/fight/lock-break.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the page wiring is pinned: gated by the soft lock and the attackers, its own press listener, only a locked live fight, no look/cut listener touched (source pin)', () => {
  const main = read('../../src/client/main.ts');
  assert.match(main, /const SWITCH = LOCK_ROWS && multi \? lockSwitchFor\(true, search\) : null/);
  assert.match(main, /if \(paused\(\) \|\| !engaged \|\| lockState\.broken \|\| practice\.finish \|\| !isTap\(SWITCH,/);
  assert.match(main, /swapHeld\(practice, attackers, current, pick, kindAt\(current\)\.ai\)/);
  assert.match(main, /useKind\(kindAt\(current\)\)/);
  assert.equal(/switchTarget/.test(read('../../src/fight/lock-break.ts')), false, 'the hook is replaced');
});

