// SOURCE PINS moved out of test/hero-death.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the wiring: the page asks for the loop from the row, the scene builds the death-only ragdoll and tells it the killing blow alone, the HUD swaps the li
//      wiring + absence pin (src/client/main.ts, src/fight/scene.ts, src/fight/hud.ts, src/fight/ragdoll.ts, src/fight/camera.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the wiring: the page asks for the loop from the row, the scene builds the death-only ragdoll and tells it the killing blow alone, the HUD swaps the line and the button (source pin)', () => {
  const main = src('../../src/client/main.ts'), scene = src('../../src/fight/scene.ts'), hud = src('../../src/fight/hud.ts'), ragdoll = src('../../src/fight/ragdoll.ts'), cam = src('../../src/fight/camera.ts');
  assert.match(main, /heroDeathFor\(!!ZONE, search\)/); assert.match(main, /view\.heroDeath\(DEATH\)/);
  assert.match(main, /standUpDue\(DEATH, sinceDeath, respawnAsked\) : sinceDeath >= ZONE!\.diedSeconds/, 'v1 keeps the zone row\'s downSeconds');
  assert.match(main, /if \(DEATH && heroDied\(\)\) askRespawn\(\); else rematch\(\)/);
  assert.match(scene, /heroRagdollFor\(location\.search, true\)/); assert.match(scene, /heroFeel \? events : events\.filter\(\(e\) => e\.type === 'Killed'\)/);
  assert.match(ragdoll, /feelHero \? activeFeels\(search, undefined, true\) : \[\]/, 'no hit reactions without ?feel=hero');
  assert.match(hud, /view\.death \? view\.death\.line/); assert.match(hud, /view\.death \? !view\.death\.ready/);
  assert.match(cam, /!dyingHero && \(tourAngle/, 'the arena tour stays out of the death camera');
  assert.doesNotMatch(cam + scene, /finishPush[^;]*DEATH_CAM/, 'not the finisher zoom');
});

