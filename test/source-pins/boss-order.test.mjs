// SOURCE PINS moved out of test/boss-order.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the page wires the order: zone and spots through orderedZone, the opener through orderProfile, the live rig armed from its boss row
//      wiring pin (client/main.ts, fight/scene.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the page wires the order: zone and spots through orderedZone, the opener through orderProfile, the live rig armed from its boss row (source pin)', () => {
  const src = (p) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');
  const main = src('client/main.ts');
  const scene = src('fight/scene.ts');

  assert.match(main, /orderedZone\(zoneFor\(search\), FIGHT\.order, search\)/);
  assert.match(main, /orderProfile\(FIGHT\.profile, FIGHT\.order, search\)/);
  assert.match(scene, /const liveBoss = bossRowOfBody\(foeBodyFile\(opponentId/);
  assert.match(scene, /bossOpponent\(OPPONENTS\[opponentId\], pageSearch\)/);
});

