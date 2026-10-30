// SOURCE PINS moved out of test/lock-break.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - no artificial gates: the break does not look at the hero, the foe, the stamina or the fight age
//      wiring + absence pin (src/fight/lock-break.ts): pins what the module's source imports or names (an import boundary, a list of row keys it must read); the module imports under node, but no runtime observes an import edge or an unread key, so the text check stays [the behaviour half stays in the original test]
//  - page wiring: the soft lock feeds the sim lock flag and the camera; no stamina is touched
//      wiring + absence pin (src/client/main.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('no artificial gates: the break does not look at the hero, the foe, the stamina or the fight age (source pin)', () => {

  const src = read('../../src/fight/lock-break.ts');
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ''), /stamina|hurt|windup|minEngage|cooldown/i);
});

test('page wiring: the soft lock feeds the sim lock flag and the camera; no stamina is touched (source pin)', () => {
  const main = read('../../src/client/main.ts');
  assert.match(main, /lockBreakFor\(!!ZONE, search\)/);
  assert.match(main, /lock: lockOn/);
  assert.match(main, /broken: lockState\.broken/);
  assert.doesNotMatch(main, /spendStamina/);
});

