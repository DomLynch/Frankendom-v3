// SOURCE PINS moved out of test/share-clip.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the button sits on the bottom edge, below the cut hint box (pickup.json safe.bottomFrac), never mid-screen
//      wiring + absence pin (src/share-clip.ts): pins what the module's source imports or names (an import boundary, a list of row keys it must read); the module imports under node, but no runtime observes an import edge or an unread key, so the text check stays [the behaviour half stays in the original test]
//  - the page wiring is small: one import, one mount, one frame call, the kill and death hooks; the file holds no player text or ids
//      wiring + absence pin (src/client/main.ts, src/share-clip.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the button sits on the bottom edge, below the cut hint box (pickup.json safe.bottomFrac), never mid-screen (source pin)', () => {
  const css = JSON.parse(read('../../data/share-clip.json')).button.css;   // the stylesheet is a data row now (data/share-clip.json button.css); src/share-clip.ts only fills its slots

  assert.match(css, /bottom:calc\(\{bottomPx\}px \+ env\(safe-area-inset-bottom/);
  assert.ok(!/top:\{|left:50%;top/.test(css));
  assert.ok(!/\.sc-btn\{/.test(read('../../src/share-clip.ts')), 'the stylesheet is not written in the code');
});

test('the page wiring is small: one import, one mount, one frame call, the kill and death hooks; the file holds no player text or ids (source pin)', () => {
  const main = read('../../src/client/main.ts');
  assert.match(main, /import \{ mountShareClip \} from '\.\.\/share-clip\.ts'/);
  assert.match(main, /shareClip\.frame\(engaged\)/);
  assert.match(main, /if \(name === 'boss_kill'\) shareClip\.moment\(/);
  assert.match(main, /reportFight\('boss_kill', current\)/, 'the telemetry call is untouched');
  const src = read('../../src/share-clip.ts');
  assert.ok(!/localStorage|userId|document\.cookie|location\./.test(src), 'no user data is read');
  assert.match(src, /v3:clip-moment/);
  assert.ok(!/URLSearchParams|location\.search/.test(src), 'no URL flag');
});

