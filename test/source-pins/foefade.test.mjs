// SOURCE PINS moved out of test/foefade.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - ?foefade=v1 and the rows switch it off; default B has it on; v1 skyview has none
//      wiring pin (src/fight/scene.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle [the behaviour half stays in the original test]
//  - wiring: the hero is protected and the foe, its idle copies, other bodies and live attackers are adopted; sand look untouched
//      wiring + absence pin (src/fight/scene.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('?foefade=v1 and the rows switch it off; default B has it on; v1 skyview has none (source pin)', () => {

  assert.match(read('../../src/fight/scene.ts'), /const foeFade = skyView && foeFadeOn\(pageSearch, skyView\) \? createFoeFade\(skyView\) : null;/);
});

test('wiring: the hero is protected and the foe, its idle copies, other bodies and live attackers are adopted; sand look untouched (source pin)', () => {
  const scene = read('../../src/fight/scene.ts');
  assert.match(scene, /foeFade\?\.protect\(player\); foeFade\?\.adopt\(opponent\);/); assert.doesNotMatch(scene, /foeFade\??\.adopt\(player\)/);
  assert.match(scene, /for \(const h of idleCopies\) foeFade\.adopt\(h\);/);
  assert.match(scene, /for \(const e of liveFoes\.values\(\)\) foeFade\.adopt\(e\.group\);/);
  assert.match(scene, /foeFade\.move\(camera\.position\)/);
  assert.match(scene, /const floorFade = skyView \? fadeFloor\(arena\.group, skyView\) : null;/);
});

