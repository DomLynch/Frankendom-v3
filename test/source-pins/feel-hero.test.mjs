// SOURCE PINS moved out of test/feel-hero.test.mjs (audit item 19, 2026-10-29).
// Each test below asserts on source TEXT (a regex over a src file), not on behaviour. They are kept (not deleted) because what they pin is not reachable from node: the page
// entry, the scene and the ragdoll run only in a browser. They still run in `npm test` and on their own as `npm run test:pins`. A rename in the pinned code breaks them on
// purpose: update the pin in the same PR. Behaviour assertions that sat in the same test cases stayed in the original file.
//
//  - the flag off changes nothing: no hero ragdoll is made, and the opponent\'s hooks and tracking are unchanged
//      wiring pin (src/fight/ragdoll.ts, src/fight/scene.ts, data/hero-death.js): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle [the behaviour half stays in the original test]
//  - presentation only: the module imports no sim code and emits no sim event
//      wiring + absence pin (src/fight/feel-hero.ts): pins what the module's source imports or names (an import boundary, a list of row keys it must read); the module imports under node, but no runtime observes an import edge or an unread key, so the text check stays
//  - hero death: she is the killed fighter 0, the ragdoll runs after the clip is posed, and a finish (victim 0) keeps her down
//      wiring pin (src/fight/scene.ts, src/fight/ragdoll.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle
//  - hero ragdoll: no cuts, no corpse, no finisher, no rules path; her kill is the existing death fall
//      wiring pin (src/fight/ragdoll.ts): the pinned line sits in code that only runs in a browser (the page entry, the scene, the HUD, the ragdoll build: DOM / WebGL / physics world), so no node test can call it; its text is the only handle

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

test('the flag off changes nothing: no hero ragdoll is made, and the opponent\'s hooks and tracking are unchanged (source pin)', () => {
  const ragdoll = src('src/fight/ragdoll.ts'), scene = src('src/fight/scene.ts');
  assert.match(ragdoll, /export function heroRagdollFor\(search: string, deathOnly = false\): FoeRagdoll \| null \{\n  const feelHero = feelNames\(search\)\.includes\('hero'\);[^\n]*\n  if \(!PHYSICS\.on \|\| !\(feelHero \|\| deathOnly\)/, 'null unless ?feel=hero (or the zone\'s death-only ragdoll, data/hero-death.json)');
  assert.match(scene, /let heroRagdoll = typeof location === 'undefined' \? null : heroRagdollFor\(location\.search\)/);
  assert.match(scene, /heroRagdoll\?\.attach\(player, loaded\.player\)/); assert.match(scene, /heroRagdoll\?\.frame\(/);
  assert.match(ragdoll, /side = 1, costKey = '__ragdoll'\)/, 'the opponent\'s ragdoll is still fighter 1 with its old cost record');
  assert.match(ragdoll, /foe \? createFoeRagdoll\(PHYSICS, foe, [^\n]*activeFeels\(search, FEEL_DEFAULTS\), search\) : null/, 'foeRagdollFor passes no side: unchanged');
});

test('presentation only: the module imports no sim code and emits no sim event (source pin)', () => {
  const s = src('src/fight/feel-hero.ts');
  assert.doesNotMatch(s, /import (?!type)[^\n]*from '\.\/duel\.ts'/);
  assert.doesNotMatch(s, /emitFeel|ctx\.emit|feel\.on/);
});

test('hero death: she is the killed fighter 0, the ragdoll runs after the clip is posed, and a finish (victim 0) keeps her down (source pin)', () => {
  const scene = src('src/fight/scene.ts'), ragdoll = src('src/fight/ragdoll.ts');
  const frame = scene.indexOf('heroRagdoll?.frame('), pose = scene.indexOf('heroFalls(stand(');
  assert.ok(pose > 0 && frame > pose, 'the hero ragdoll frame comes after the Death clip pose, so its bones win each frame');
  assert.match(scene, /heroRagdoll\?\.frame\(animationDt, heroFeel \? events : events\.filter\(\(e\) => e\.type === 'Killed'\), practice\.finish\?\.victim === 0 \|\| practice\.duel\.fighters\[0\]\.health <= 0 \? \{ victim: 0 \} : null/);
  assert.match(ragdoll, /e\.type === 'Killed' && e\.target === side/);
});

test('hero ragdoll: no cuts, no corpse, no finisher, no rules path; her kill is the existing death fall (source pin)', () => {
  const s = src('src/fight/ragdoll.ts'); const i = s.indexOf('export function heroRagdollFor');
  const body = s.slice(i, s.indexOf('/** scene.ts: does the ragdoll play', i));
  assert.match(body, /cut: \{ \.\.\.PHYSICS\.cut, on: false, onKill: \{\} \}/);
  assert.match(body, /false, false, false, feelHero \? activeFeels\(search, undefined, true\) : \[\], search, 0, '__ragdollHero'/);
  assert.match(s, /e\.type === 'Killed' && e\.target === side/); assert.match(s, /rd\.kill\(blowImpulse\(/);
});

