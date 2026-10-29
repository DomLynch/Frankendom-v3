// SOURCE PINS moved out of test/shape-shipped.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - scene.ts gates the fetch on the shipping table only (the ?shapes= local drop is never filtered)
//      wiring pin (src/fight/scene.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('scene.ts gates the fetch on the shipping table only (the ?shapes= local drop is never filtered) (source pin)', () => {
  const src = readFileSync(new URL('../../src/fight/scene.ts', import.meta.url), 'utf8');
  assert.match(src, /shapeTable === SHIPPING_SHAPES && !shippedShape\(url\)/);
});

