// SOURCE PINS moved out of test/telemetry.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - main.ts reports the two fight events at the kill and at the death, and the index file needs no change (same-origin path, no CSP)
//      wiring + absence pin (src/client/main.ts, index.html): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('main.ts reports the two fight events at the kill and at the death, and the index file needs no change (same-origin path, no CSP) (source pin)', () => {
  const main = readFileSync(new URL('../../src/client/main.ts', import.meta.url), 'utf8');
  assert.match(main, /reportFight\('boss_kill', current\)/);
  assert.match(main, /if \(sinceDeath === 0\) reportFight\('boss_death'/);
  assert.match(main, /setErrorSink\(/);
  assert.ok(!/connect-src|Content-Security-Policy/i.test(readFileSync(new URL('../../index.html', import.meta.url), 'utf8')), 'no page CSP to widen');
});

