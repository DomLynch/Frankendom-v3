// SOURCE PINS moved out of test/finisher-cam.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the camera rig gates the push-in, the side reveal and the close view on the flag; the default frames a finish like normal combat
//      wiring pin (src/fight/camera.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle
//  - wired: the camera, the blood and the stick rule read the rows; no sim file knows them
//      wiring + absence pin (src/fight/camera.ts, src/fight/scene.ts, src/client/main.ts, src/fight/sim.ts, src/sim/validate.js): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle [the behaviour half stays in the original test]

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the camera rig gates the push-in, the side reveal and the close view on the flag; the default frames a finish like normal combat (source pin)', () => {
  const cam = read('../../src/fight/camera.ts');
  assert.match(cam, /const FINISH_ZOOM = finisherCamOn\(/);
  assert.match(cam, /if \(FINISH_ZOOM && finish && finish\.posed/, 'push-in gated');
  assert.match(cam, /if \(FINISH_ZOOM && locked && !still && finish\?\.victim === 1 && open\)/, 'side reveal gated');
  assert.match(cam, /const cutRow = CUT_CAM && finish/, 'close view gated by the null rows');
});

test('wired: the camera, the blood and the stick rule read the rows; no sim file knows them (source pin)', () => {
  assert.match(read('../../src/fight/camera.ts'), /cutCamRows\(/);
  assert.match(read('../../src/fight/scene.ts'), /!CUT_STICK \? 0/, 'the stick beat follows the zoom flag');
  assert.match(read('../../src/fight/camera.ts'), /cutRow && finish!\.focus/);
  assert.match(read('../../src/fight/scene.ts'), /CUT_BLOOD\?\.\[finisher\]\?\.blood/);
  assert.match(read('../../src/fight/scene.ts'), /focus: cutBone \? cutFocus : null/);
  assert.match(read('../../src/fight/scene.ts'), /cutRigKey !== rigNow/);
  assert.match(read('../../src/client/main.ts'), /phase\.stickBeat/);
  assert.match(read('../../src/fight/scene.ts'), /: STICK_FIRST_FRAME;/, 'the killing frame holds a stick still down');
  for (const f of ['../../src/fight/sim.ts', '../../src/sim/validate.js']) assert.doesNotMatch(read(f), /finisher-cam|finishercam/);
});

