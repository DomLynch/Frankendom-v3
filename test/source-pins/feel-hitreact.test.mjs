// SOURCE PINS moved out of test/feel-hitreact.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the module imports only TYPES from feel.ts (the feel chunk is its own bundle) and nothing back into the ragdoll or three
//      wiring + absence pin (src/fight/feel-hitreact.ts): pins what the module's source imports or names (an import boundary, a list of row keys it must read); the module imports under node, but no runtime observes an import edge or an unread key, so the text check stays
//  - classes: ragdoll.ts reads ctx.soften in all three stagger places and puts it back to 1 after every blow
//      wiring pin (src/fight/ragdoll.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the module imports only TYPES from feel.ts (the feel chunk is its own bundle) and nothing back into the ragdoll or three (source pin)', () => {
  const src = readFileSync(new URL('../../src/fight/feel-hitreact.ts', import.meta.url), 'utf8');
  assert.match(src, /import type \{ FeelCtx, FeelHooks \} from '\.\/feel\.ts'/); assert.doesNotMatch(src, /registerFeel/);
  assert.doesNotMatch(src, /from '\.\/ragdoll/, 'no import back into ragdoll.ts');
  assert.doesNotMatch(src, /from 'three'/, 'the core has no three dependency');
});

test('classes: ragdoll.ts reads ctx.soften in all three stagger places and puts it back to 1 after every blow (source pin)', () => {
  const src = readFileSync(new URL('../../src/fight/ragdoll.ts', import.meta.url), 'utf8');
  assert.match(src, /p\.scale \* soften\.impulse/); assert.match(src, /\* staggerK\.time\)/); assert.match(src, /\* staggerK\.blend, blend\)/);
  assert.match(src, /soften\.impulse = soften\.blend = soften\.time = 1;/);
});

