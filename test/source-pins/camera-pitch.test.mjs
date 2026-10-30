// SOURCE PINS moved out of test/camera-pitch.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - wiring pin: the page reads the row for the zone only, never under ?cam=v1, and the default is OFF (the camera is today\'s)
//      wiring + absence pin (src/client/main.ts, src/fight/camera.ts, src/fight/combat.ts, src/fight/duel.ts, src/fight/moves.ts, src/fight/record.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle [the behaviour half stays in the original test]

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('wiring pin: the page reads the row for the zone only, never under ?cam=v1, and the default is OFF (the camera is today\'s) (source pin)', () => {
  const main = read('../../src/client/main.ts');
  assert.match(main, /if \(ZONE && !\/\[\?&\]cam=v1\\b\/\.test\(search\)\) setCameraPitch\(pitchChoice\(FIGHT\.camera\.pitch, search\), FIGHT\.camera\.pitch, portraitPitch\(FIGHT\.camera\.pitch, search\)\);/);
  const cam = read('../../src/fight/camera.ts');
  assert.match(cam, /let PITCH: [^\n]*= null;/);   // module default: no pitch
  for (const f of ['../../src/fight/combat.ts', '../../src/fight/duel.ts', '../../src/fight/moves.ts', '../../src/fight/record.ts']) assert.doesNotMatch(read(f), /camera-pitch|camera\.pitch/, f);
});

