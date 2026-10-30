// SOURCE PINS moved out of test/zone-opener.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the page sets the lift only from the spawn in aggro and clears it on every reset (hand-over, leash reset, respawn)
//      wiring + absence pin (src/client/main.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle
//  - the page wires it once: the clock runs when the assets are ready, any engagement/kill/death spends it, ?opener=off and ?postkill=v1 start spent
//      wiring pin (src/client/main.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the page sets the lift only from the spawn in aggro and clears it on every reset (hand-over, leash reset, respawn) (source pin)', () => {
  const main = readFileSync(new URL('../../src/client/main.ts', import.meta.url), 'utf8');
  assert.match(main, /openerLift = openerLeashLift\(spawns\[near\]\);/);
  assert.doesNotMatch(main, /openerLift = OPENERS\.reachMetres/);
  const rematch = main.slice(main.indexOf('function rematch('), main.indexOf('const hand = '));
  assert.match(rematch, /openerLift = 0;/, 'rematch is what hand() and the leash reset call');
});

test('the page wires it once: the clock runs when the assets are ready, any engagement/kill/death spends it, ?opener=off and ?postkill=v1 start spent (source pin)', () => {
  const main = readFileSync(new URL('../../src/client/main.ts', import.meta.url), 'utf8');
  assert.match(main, /openerSpent = !ZONE \|\| !openerOn\(search\)/);
  assert.match(main, /if \(engaged\) openerSpent = true;/);
  assert.match(main, /leashed\(spawns\[current\]!, practice\.enemy, openerLift\)/);
  assert.match(main, /if \(practice\.finish\) \{ openerSpent = true; openerLift = 0; \}/);
  assert.match(main, /if \(!openerSpent && assetsReady\) openerIdle \+= dt;/);
  assert.match(main, /inAggro\(openerSpent \? spawns : openerReach\(spawns, OPENERS, openerIdle, hero\), hero\)/);
});

