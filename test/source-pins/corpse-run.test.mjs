// SOURCE PINS moved out of test/corpse-run.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the page wires it with no new URL flag and keeps #225 and the progression flags
//      wiring + absence pin (src/client/main.ts, src/corpse-run.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the page wires it with no new URL flag and keeps #225 and the progression flags (source pin)', () => {
  const main = readFileSync(new URL('../../src/client/main.ts', import.meta.url), 'utf8');
  assert.match(main, /const CR = ZONE && PROG \? CORPSE : null;/, 'it rides the progression save (?save=off, ?pitborn=v1)');
  assert.match(main, /if \(sinceDeath === 0\) onHeroDied\(\);/);
  assert.match(main, /standUpDue\(DEATH, sinceDeath, respawnAsked\)/, '#225\'s respawn loop is as it was');
  assert.doesNotMatch(readFileSync(new URL('../../src/corpse-run.ts', import.meta.url), 'utf8'), /URLSearchParams|search/, 'no query switch');
});

