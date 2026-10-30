// SOURCE PINS moved out of test/progression.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - wiring: the page records kills in the zone loop, rebuilds the kinds, shows one discreet line, and the hero equip exists
//      wiring pin (src/client/main.ts, src/fight/scene.ts, data/stars.js): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle [the behaviour half stays in the original test]

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('wiring: the page records kills in the zone loop, rebuilds the kinds, shows one discreet line, and the hero equip exists (source pin)', () => {
  const main = readFileSync(new URL('../../src/client/main.ts', import.meta.url), 'utf8'), scene = readFileSync(new URL('../../src/fight/scene.ts', import.meta.url), 'utf8');
  assert.match(main, /onBossKilled\(spawns\[current\]!\.kind[,)]/); assert.match(main, /onBossKilled\(spawns\[a\.index\]!\.kind[,)]/);   // (the star bosses pass the dead one's star too, data/stars.json)
  assert.match(main, /KINDS = kindTable\(KIND_CTX\)/); assert.match(main, /opponentId, undefined, HERO_WEAPON,/);
  assert.match(scene, /weapons\/player\/cleaver\.glb/);
});

