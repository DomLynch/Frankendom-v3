// SOURCE PINS moved out of test/feel.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - main.js never imports a feel module statically (source pin)
//      absence pin (source text): a grep gate, dead or forbidden code must not come back; no runtime can observe an absence
//  - ragdoll.ts calls the registry at the three sites (a Hit on him, every frame, his killing blow) and takes the hooks from the page
//      wiring pin (src/fight/ragdoll.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('main.js never imports a feel module statically (source pin) (source pin)', () => {
  for (const f of ['ragdoll.ts', 'feel.ts', 'feel-modules.ts']) assert.doesNotMatch(readFileSync(new URL(`../../src/fight/${f}`, import.meta.url), 'utf8'), /^import ['"]\.\/feel-(clash|hitreact|limbs|kick)\.ts/m, `${f} has no static module import`);
});

test('ragdoll.ts calls the registry at the three sites (a Hit on him, every frame, his killing blow) and takes the hooks from the page (source pin)', () => {
  const src = readFileSync(new URL('../../src/fight/ragdoll.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('blendToward: (share) => poseToward(1, share)'), 'the hook context can pose parts from the ragdoll');
  for (const call of ['f.hit?.(e, feelCtx())', 'f.frame?.(dt, events, feelCtx())', 'f.kill?.(killed, feelCtx())', 'activeFeels(search, FEEL_DEFAULTS)']) assert.ok(src.includes(call), call);
});

