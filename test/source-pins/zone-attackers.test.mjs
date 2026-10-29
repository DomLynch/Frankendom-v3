// SOURCE PINS moved out of test/zone-attackers.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the camera framing row: one boss is exactly the old frame, a far attacker widens it in proportion, capped; bad rows are refused
//      wiring pin (src/fight/camera.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle [the behaviour half stays in the original test]
//  - the sim is untouched: no file the Gate 0 table pins is edited by this change, the new modules import none of the page
//      absence pin (src/fight/attacker-bout.ts, src/zone/attackers.ts): a grep gate, dead or forbidden code must not come back; no runtime can observe an absence
//  - the page wiring is pinned: gated by the row, the same intent for every duel, joins only while engaged, the cap row, adoption, the killer, the rigs
//      wiring pin (src/client/main.ts, src/fight/scene.ts, src/fight/characters.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the camera framing row: one boss is exactly the old frame, a far attacker widens it in proportion, capped; bad rows are refused (source pin)', () => {

  const cam = read('../../src/fight/camera.ts');
  assert.match(cam, /foeLow = 0, foeWiden = 1, free = false\)/);   // re-pinned with the free camera: the arguments are foe*, and `widen` below is their value after the free camera's share is taken off (equal to the argument while the lock is on)
  assert.match(cam, /widen = on \? 1 \+ \(foeWiden - 1\) \* keep : foeWiden/); assert.match(cam, /\* \(1 \+ \(widen - 1\) \* shortShare\)/);
});

test('the sim is untouched: no file the Gate 0 table pins is edited by this change, the new modules import none of the page (source pin)', () => {
  for (const f of ['../../src/fight/attacker-bout.ts', '../../src/zone/attackers.ts']) assert.doesNotMatch(read(f), /from '\.\.\/client|from 'three'|document\.|window\./);
  assert.doesNotMatch(read('../../src/fight/attacker-bout.ts'), /Math\.random|Date\.now|performance\.now/, 'deterministic');
});

test('the page wiring is pinned: gated by the row, the same intent for every duel, joins only while engaged, the cap row, adoption, the killer, the rigs (source pin)', () => {
  const main = read('../../src/client/main.ts'), scene = read('../../src/fight/scene.ts'), ch = read('../../src/fight/characters.ts');
  assert.match(main, /const multi = !!ZONE && attackersOn\(search\)/);
  assert.match(main, /stepAttackers\(prior, practice, duelIntent, attackers, aiProfile\)/, 'every duel takes the hero\'s one intent');
  assert.match(main, /if \(attackers\.length\)/, 'nothing steps when nobody is on him');
  assert.match(main, /for \(const i of joiners\(spawns, current, alive\(\), hero\)\)/);
  assert.match(main, /make\(nextSeed\(/, 'an attacker is built by the same factory as the first fight: the difficulty rows\' health and damage scales apply');
  assert.match(main, /adoptAttacker\(live, hero\)/); assert.match(main, /killedBy \?\? current/);
  assert.match(main, /view\.liveFoes\(/); assert.match(main, /filter\(\(s\) => !attackers\.some/, 'a live attacker is not also drawn as a frozen copy');
  assert.match(scene, /liveFoes\(list/); assert.match(scene, /warriors\.spawnFoe\(\)/);
  assert.match(ch, /spawnFoe: \(\) => create\(true\)/);
});

