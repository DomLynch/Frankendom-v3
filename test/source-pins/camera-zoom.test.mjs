// SOURCE PINS moved out of test/camera-zoom.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the base lens is the scene camera\'s 51 degrees (zoom 1 = today\'s camera exactly)
//      wiring pin (src/fight/scene.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle [the behaviour half stays in the original test]
//  - presentation only: the page wires the lens and nothing in the sim reads the row
//      wiring + absence pin (src/client/main.ts, src/fight/combat.ts, src/fight/duel.ts, src/fight/moves.ts, src/fight/record.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BASE_FOV } from '../../src/fight/camera-zoom.ts';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the base lens is the scene camera\'s 51 degrees (zoom 1 = today\'s camera exactly) (source pin)', () => {
  assert.match(read('../../src/fight/scene.ts'), new RegExp(`new THREE\\.PerspectiveCamera\\(${BASE_FOV},`));
});

test('presentation only: the page wires the lens and nothing in the sim reads the row (source pin)', () => {
  assert.match(read('../../src/client/main.ts'), /view\.setZoom\(cameraZoom\(FIGHT\.camera\.zoom, search\)\)/);
  for (const f of ['../../src/fight/combat.ts', '../../src/fight/duel.ts', '../../src/fight/moves.ts', '../../src/fight/record.ts']) assert.doesNotMatch(read(f), /camera-zoom|camera\.zoom/, f);
});

