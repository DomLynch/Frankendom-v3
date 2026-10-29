// SOURCE PINS moved out of test/zone-loop.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the page wires the free walk: the zone path passes the data row radius to roamStep and the follow camera; the flag path (ZONE null) has no roam and th
//      wiring + absence pin (src/client/main.ts, src/fight/free-roam.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle [the behaviour half stays in the original test]
//  - the page wires the fall: main tells the scene the row (0 without the loop), the scene drives the Death clip on a clock and holds it
//      wiring pin (src/client/main.ts, src/fight/scene.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle
//  - the page wires the loop: the zone row via zoneFor, the corpse left BEFORE his sim body resets, the HUD drops the Rematch in the zone
//      wiring pin (src/client/main.ts, src/fight/hud.ts, src/fight/scene.ts, data/hero-death.js): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the page wires the free walk: the zone path passes the data row radius to roamStep and the follow camera; the flag path (ZONE null) has no roam and the pit wall (source pin)', () => {
  const main = readFileSync(new URL('../../src/client/main.ts', import.meta.url), 'utf8');
  assert.match(main, /stepFreeRoam\(freeRoam, roam, duelIntent, ZONE!\.walkRadius\)/, 'the walk is zone-loop roamStep through free-roam.ts (idle it is roamStep to the bit)');
  assert.match(readFileSync(new URL('../../src/fight/free-roam.ts', import.meta.url), 'utf8'),/roamStep\(roam, move, corpse\.body, wall\)/);
  assert.doesNotMatch(main, /roamStep\([^\n]*RADIUS\)/);
  assert.match(main, /if \(ZONE\) validateWalk\(ZONE\.walkRadius, RADIUS\)/);
  assert.match(main, /if \(ZONE\) setWalkClamp\(roam \? ZONE\.walkRadius \+ ZONE\.cameraMetres : 0\)/);
  assert.match(main, /heroStands\(\)\) \{[^]*?roam = \{ \.\.\.practice\.fighter \}/, 'roam only exists inside heroStands (the zone)');
});

test('the page wires the fall: main tells the scene the row (0 without the loop), the scene drives the Death clip on a clock and holds it (source pin)', () => {
  const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const main = src('../../src/client/main.ts');
  const scene = src('../../src/fight/scene.ts');

  assert.match(main, /view\.heroFall\(ZONE \? ZONE\.fallSeconds : 0\)/);
  assert.match(scene, /heroFall\(seconds: number\) \{ fallSeconds = seconds; \}/);
  assert.match(scene, /const mine = heroFalls\(stand\([^\n]*practice\.finish\?\.victim === 0, animationDt\)/);
  assert.match(scene, /pose: 'death', progress: Math\.min\(1, fallAge \/ fallSeconds\)/);
});

test('the page wires the loop: the zone row via zoneFor, the corpse left BEFORE his sim body resets, the HUD drops the Rematch in the zone (source pin)', () => {
  const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const main = src('../../src/client/main.ts');
  const hud = src('../../src/fight/hud.ts');

  assert.match(main, /zoneLoopFor\(orderedZone\(zoneFor\(search\), FIGHT\.order, search\), search/);
  assert.match(main, /zone: heroStands\(\) \|\| heroDied\(\)/);
  assert.match(main, /diedSeconds\) \{ respawnAsked = false; const who = killedBy \?\? current; rematch\(poseFor\(who, heroStart\), who\); \}/);
  assert.match(main, /if \(ZONE\) view\.respawnFoe\(\);[^\n]*\n\s*seed = nextSeed/);
  assert.match(src('../../src/fight/scene.ts'), /respawnFoe\(\): boolean \{ return ragdoll\?\.leaveCorpse\(\)/);
  assert.match(hud, /resetButton\.hidden = view\.death \? !view\.death\.ready : !!view\.zone/);   // a fallen hero gets Respawn (data/hero-death.json); everyone else in the zone still no Rematch
});

