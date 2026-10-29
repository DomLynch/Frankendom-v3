// SOURCE PINS moved out of test/audio-unlock-once.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - feedback exposes the context statechange and main.ts hooks it
//      wiring + absence pin (src/fight/sound/feedback.ts, src/client/main.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle
//  - main.ts wires it: no bare window.addEventListener loop for the unlock family, the wake handler re-arms only while locked
//      wiring + absence pin (src/client/main.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('feedback exposes the context statechange and main.ts hooks it (source pin)', () => {
  const fb = readFileSync(new URL('../../src/fight/sound/feedback.ts', import.meta.url), 'utf8');
  assert.match(fb, /addEventListener\?\.\('statechange'/);
  assert.match(fb, /onStateChange\(fn: \(\) => void\)/);
  const src = readFileSync(new URL('../../src/client/main.ts', import.meta.url), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.match(src, /rearmWhenLocked\(\(fn\) => feedback\.onStateChange\(fn\), audioUnlock\.arm,/);
});

test('main.ts wires it: no bare window.addEventListener loop for the unlock family, the wake handler re-arms only while locked (source pin)', () => {
  const src = readFileSync(new URL('../../src/client/main.ts', import.meta.url), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.match(src, /createAudioUnlock\(\{.*unlocked: \(\) => feedback\.unlocked\(\)/);
  assert.match(src, /audioUnlock\.arm\(\);/);
  assert.match(src, /if \(!feedback\.unlocked\(\)\) audioUnlock\.arm\(\)/);
  assert.doesNotMatch(src, /for \(const type of v1Sound/, 'the old for-loop that kept the listeners for life is gone');
});

