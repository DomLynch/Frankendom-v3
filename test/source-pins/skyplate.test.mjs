// SOURCE PINS moved out of test/skyplate.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the shipped numbers: about 100 degrees, 4:1 window, the swap is rows only (file, cropAspect, horizonFraction, face)
//      wiring pin (src/fight/skyplate.ts, src/fight/skyline.ts): pins what the module's source imports or names (an import boundary, a list of row keys it must read); the module imports under node, but no runtime observes an import edge or an unread key, so the text check stays [the behaviour half stays in the original test]

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the shipped numbers: about 100 degrees, 4:1 window, the swap is rows only (file, cropAspect, horizonFraction, face) (source pin)', () => {

  const src = readFileSync(new URL('../../src/fight/skyplate.ts', import.meta.url), 'utf8') + readFileSync(new URL('../../src/fight/skyline.ts', import.meta.url), 'utf8');
  for (const k of ['spanDegrees', 'cropAspect', 'faceElevationDegrees', 'edgeFadeFraction', 'turnDegrees', 'horizonFraction', 'file']) assert.match(src, new RegExp(`\\.${k}\\b`), k);
});

