// SOURCE PINS moved out of test/parts.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the page hands the star to the cut: ragdoll.ts reads kind and star at the kill, main.ts sets both
//      wiring pin (src/fight/ragdoll.ts, src/client/main.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the page hands the star to the cut: ragdoll.ts reads kind and star at the kill, main.ts sets both (source pin)', () => {
  const rag = readFileSync(new URL('../../src/fight/ragdoll.ts', import.meta.url), 'utf8'), main = readFileSync(new URL('../../src/client/main.ts', import.meta.url), 'utf8');
  // the life is noted at the TOP of the kill, before the finisher skip branch (a beheading finisher cuts through scene.finisherCut with mode 'skip' and never reaches the else branch)
  const killAt = rag.indexOf('if (killed) {'), noteAt = rag.indexOf('noteLife(lifeProfiles, lifeId'), skipAt = rag.indexOf("mode = 'skip'", killAt), elseAt = rag.indexOf('rd.kill(blowImpulse', killAt);
  assert.ok(killAt > 0 && noteAt > killAt && noteAt < skipAt && noteAt < elseAt, 'noteLife runs before the skip branch and the plain-death branch');
  assert.equal(rag.split('noteLife(lifeProfiles').length - 1, 1, 'noted once, not per branch');
  assert.match(rag, /star: lifeProfiles\.get\(corpseId\)\?\.star \?\? 0/);
  assert.match(main, /setActiveKind\(k\.kind, k\.star \?\? 0\)/);
});

