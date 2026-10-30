// SOURCE PINS moved out of test/skyfold.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - draw order: after the strip, before the sand; no depth write, no fog, no tone map, no shadows
//      wiring + absence pin (src/fight/skyfold.ts, src/fight/scene.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle [the behaviour half stays in the original test]

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('draw order: after the strip, before the sand; no depth write, no fog, no tone map, no shadows (source pin)', () => {

  const src = read('../../src/fight/skyfold.ts');
  for (const k of ['farMetres', 'nearMetres', 'featherFraction', 'groundY', 'orderOffset', 'around', 'rings']) assert.match(src, new RegExp(`row\\.${k}|FOLD\\.${k}`));
  assert.match(read('../../src/fight/scene.ts'), /skyfold\?\.update\(camera\.position, dt, skyline\);/);
  // the sand's depth push (zone-ground.json floorDepthPush) is untouched by this file
  assert.doesNotMatch(src, /polygonOffset|floorDepthPush/);
});

