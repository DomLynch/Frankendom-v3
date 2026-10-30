// SOURCE PINS moved out of test/zone-ground.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the wiring: only the zone, behind the flag, builds the open ground; ?postkill=v1 (no zone) builds the old stage; the follow is the scene\'s and is off
//      wiring + absence pin (src/client/main.ts, src/fight/scene.ts, src/arena-stage.ts, src/zone/ground-draw.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle
//  - sand quality: the floor depth push is a validated row, ?sand=v1 reverts it, the zone alone applies it
//      wiring + absence pin (src/client/main.ts, src/zone/ground-draw.ts, src/arena-stage.ts, src/client/stage.js): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle [the behaviour half stays in the original test]

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the wiring: only the zone, behind the flag, builds the open ground; ?postkill=v1 (no zone) builds the old stage; the follow is the scene\'s and is off until opened (source pin)', () => {
  const main = src('../../src/client/main.ts'), scene = src('../../src/fight/scene.ts'), stage = src('../../src/arena-stage.ts'), draw = src('../../src/zone/ground-draw.ts');
  assert.equal((main.match(/openGround\(/g) ?? []).length, 1, 'one call site');
  assert.match(main, /if \(ZONE && groundOn\(search\)\) view\.openGround\(groundFor\(WORLD\.pitScale/);
  assert.match(main, /const ZONE = zoneLoopFor\(orderedZone\(zoneFor\(search\), FIGHT\.order, search\), search/, 'ZONE is null under ?postkill=v1');
  assert.match(scene, /openGround\(sizing: GroundSizing\) \{ drawOpenGround\(arena\.group, camera, sizing\); groundSnap = sizing\.snap;/);
  assert.match(scene, /let groundSnap = 0/, 'no follow until the zone opens the ground');
  assert.match(scene, /if \(groundSnap > 0\) \{ anchorInto\(groundAt, state\.x, state\.z, groundSnap\);/);
  assert.match(scene, /sun\.position\.set\(groundAt\.x \+ sunHome\.x \+ 0\.7/, 'the flickering key light also stands on the hero');
  assert.match(scene, /get groundAnchor\(\)/, 'the hook the skyline follows');
  assert.doesNotMatch(stage, /ground-draw|openGround|zone-ground/, 'the pit stage itself is unchanged: buildArena still draws the 400-unit floor');
  assert.match(stage, /createGround\(STAGE\)/);
  assert.match(draw, /group\.getObjectByName\('floor'\)/, 'the same floor mesh and material, only wider');
  assert.doesNotMatch(draw, /TextureLoader|new THREE\.Texture|MeshStandardMaterial|MeshBasicMaterial/, 'no new texture or material');
  assert.doesNotMatch(stage, /boundary|RingGeometry|wall/i, 'the stage draws no pit wall, rim or ring: nothing to hide in the zone');
});

test('sand quality: the floor depth push is a validated row, ?sand=v1 reverts it, the zone alone applies it (source pin)', () => {

  const main = src('../../src/client/main.ts'), draw = src('../../src/zone/ground-draw.ts'), stage = src('../../src/arena-stage.ts'), client = src('../../src/client/stage.js');
  assert.match(main, /groundFor\(WORLD\.pitScale, undefined, sandOn\(search\)\)/);
  assert.match(draw, /if \(floor && s\.depthPush\) Object\.assign\(floor\.material as THREE\.Material, \{ polygonOffset: true, polygonOffsetFactor: s\.depthPush\.factor, polygonOffsetUnits: s\.depthPush\.units \}\)/);
  assert.doesNotMatch(stage + client, /polygonOffset/, 'the pit floor (?ground=v1, ?postkill=v1) is untouched');
});

