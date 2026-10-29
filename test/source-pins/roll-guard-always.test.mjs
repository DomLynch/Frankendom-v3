// SOURCE PINS moved out of test/roll-guard-always.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the page wires it: the kill ceremony ends on a roll or guard press, the walk steps the free hero, the HUD and the pose follow him
//      wiring pin (src/client/main.ts, src/fight/hud.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the page wires it: the kill ceremony ends on a roll or guard press, the walk steps the free hero, the HUD and the pose follow him (source pin)', () => {
  const main = read('../../src/client/main.ts'), hud = read('../../src/fight/hud.ts');
  assert.match(main, /intent\.guard \|\| isFreeAction\(duelIntent\.action\) \? 0 : phase\.stickBeat/, 'no held-stick beat for a roll or guard press');
  assert.match(main, /isFreeAction\(duelIntent\.action\)/,'a roll or guard press ends the ceremony as the stick does');
  assert.match(main, /stepFreeRoam\(freeRoam, roam, duelIntent, ZONE!\.walkRadius\)/);
  assert.match(main, /walking: \(\) => heroStands\(\)/);
  assert.match(main, /free: freeHud\(freeRoam\)/);
  assert.match(hud, /view\.free \? view\.free\.dodge : ok\[3\]/);
});

