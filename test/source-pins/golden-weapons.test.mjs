// SOURCE PINS moved out of test/golden-weapons.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - as built: the module and the page wiring carry no literal beyond the rows (as-data), and main.ts stays a few lines
//      wiring pin (src/client/main.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('as built: the module and the page wiring carry no literal beyond the rows (as-data), and main.ts stays a few lines (source pin)', () => {
  const main = readFileSync(new URL('../../src/client/main.ts', import.meta.url), 'utf8');
  assert.match(main, /mountGolden/); assert.match(main, /practice = golden\.strike\(practice\)/);
  assert.match(main, /KIND_CTX\.tune = mergeTune\(BASE_TUNE, escalation\(PROG\.save, PROG_ROWS\)\); KINDS = kindTable\(KIND_CTX\)/, 'the rider no longer rides the tune: the kill rebuild line is the original');
});

