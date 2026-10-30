// SOURCE PINS moved out of test/zone-spread.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the page wires it for the zone only: poseAt on the ground, the pose door routed by poseFits, the radius via zoneDuel, the camera clamp; no key in the 
//      wiring + absence pin (src/client/main.ts, src/fight/camera.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle [the behaviour half stays in the original test]

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the page wires it for the zone only: poseAt on the ground, the pose door routed by poseFits, the radius via zoneDuel, the camera clamp; no key in the single fight (source pin)', () => {
  const main = read('../../src/client/main.ts');
  assert.match(main, /poseAt\(at, spawns\[index\]!, OPEN_RADIUS, ZONE!\.minDistance, heroStart\)/);
  assert.match(main, /const fits = !ZONE \|\| !pose \|\| poseFits\(pose, RADIUS\);/, 'with no zone every pose is the sim\'s own');
  assert.match(main, /return ZONE \? project\(zoneDuel\(scaled\.duel, fits \? undefined : pose\), scaled\.ai, scaled\) : scaled;/, 'no zone = the practice untouched');
  assert.match(main, /if \(ZONE\) setArenaClamp\(OPEN_RADIUS\);/);
  const live = main.split('\n').map((l) => l.replace(/\s\/\/.*$/, '')).join('\n');
  assert.match(live, /if \(ZONE\) setArenaClamp\(OPEN_RADIUS\);\s*\n/, 'live code, not swallowed by a trailing comment');
  assert.match(live, /kindPractice\(k, KIND_CTX, s, fits \? pose : undefined\)/, 'a pose beyond the pit is not handed to the sim');
  assert.match(live, /roam = \{ \.\.\.practice\.fighter \}; view\.stopTour\(\); \}/, 'the finisher tour ends the moment the hero walks: the follow camera is behind him');
  assert.doesNotMatch(live, /intoPit\(/, 'nothing in the page draws the hero to a wall any more');
  const cam = read('../../src/fight/camera.ts');
  assert.equal((cam.match(/ARENA_CLAMP/g) ?? []).length >= 8 && !/const ARENA_CLAMP/.test(cam), true, 'finisher side view, tour and intro orbit all clamp at the one settable ARENA_CLAMP');
  const sim = ['sim', 'duel', 'combat', 'play-radius'].map((f) => read(`../../src/fight/${f}.ts`)).join('\n');
  assert.doesNotMatch(sim, /zoneDuel|spreadRadius|setArenaClamp/, 'the sim files do not know the zone');
});

