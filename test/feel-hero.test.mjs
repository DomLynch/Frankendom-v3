// ?feel=hero (src/fight/feel-hero.ts): the hero's hit reactions come from the SAME rows as the Minotaur's, on her own ragdoll (fighter 0), presentation only, and with the flag off nothing changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { feelHooks as HERO } from '../src/fight/feel-hero.ts';
import { feelHooks as FOE } from '../src/fight/feel-hitreact.ts';
import { activeFeels, feelNames } from '../src/fight/feel.ts';
import { FEEL_NAMES } from '../src/fight/feel-modules.ts';
import * as CHUNK from '../src/fight/feel-chunk.ts';
import { validateFile } from '../src/sim/validate.js';

const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const PHYSICS = JSON.parse(src('data/physics.json')), RIG = JSON.parse(src('data/rig.json'));

// A mock ragdoll that records what the module asks of it, and a mock ctx for fighter `target`.
function fixture(target) {
  const log = { impulses: [], strengths: [], blends: [] };
  const rd = { state: 'alive', applyImpulse: (p, v) => log.impulses.push([p, v]), setMotorStrength: (r) => log.strengths.push(r) };
  return { log, ctx: { target, rd, group: { rotation: { y: 0 } }, partBones: {}, mode: 'alive', emit() {}, limbs: () => ({}), blendToward: (s) => log.blends.push(s) } };
}
// She faces +z; a blow from in front: heading PI.
const HIT = { type: 'Hit', target: 0, tick: 7, location: 'torso', heading: Math.PI };

test('opt-in: ?feel=hero names the hero module; the opponent\'s list never gets it, the hero\'s list gets only it', async () => {
  assert.ok(FEEL_NAMES.includes('hero')); assert.equal(CHUNK.hero, HERO);
  assert.deepEqual(feelNames('?feel=hitreact,hero'), ['hitreact', 'hero']);
  const foe = activeFeels('?feel=hero'); const hero = activeFeels('?feel=hero', undefined, true);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(foe.includes(HERO), false, 'the opponent\'s ragdoll never runs the hero module');
  assert.equal(hero.includes(HERO), true);
  for (const s of ['', '?feel=hitreact', '?feel=heroes']) assert.deepEqual(activeFeels(s, undefined, true), [], `${s}: nothing for the hero`);
});

test('the flag off changes nothing: no hero ragdoll is made, and the opponent\'s hooks and tracking are unchanged', () => {
  const ragdoll = src('src/fight/ragdoll.ts'), scene = src('src/fight/scene.ts');
  assert.match(ragdoll, /export function heroRagdollFor\(search: string\): FoeRagdoll \| null \{\n  if \(!PHYSICS\.on \|\| !feelNames\(search\)\.includes\('hero'\)/, 'null unless ?feel=hero');
  assert.match(scene, /const heroRagdoll = typeof location === 'undefined' \? null : heroRagdollFor\(location\.search\)/);
  assert.match(scene, /heroRagdoll\?\.attach\(player, loaded\.player\)/); assert.match(scene, /heroRagdoll\?\.frame\(/);
  assert.match(ragdoll, /side = 1, costKey = '__ragdoll'\)/, 'the opponent\'s ragdoll is still fighter 1 with its old cost record');
  assert.match(ragdoll, /foe \? createFoeRagdoll\(PHYSICS, foe, [^\n]*activeFeels\(search, FEEL_DEFAULTS\)\) : null/, 'foeRagdollFor passes no side: unchanged');
  const defaults = JSON.parse(src('data/feel-defaults.json'));
  assert.equal(defaults.modules.includes('hero'), false, 'hero is not a default module: the main URL never builds her ragdoll');
  assert.equal(JSON.stringify(defaults.revert).includes('hero'), false);
  assert.deepEqual(activeFeels('?feel=hitreact'), activeFeels('?feel=hitreact'));
});

test('the hero reacts from the same rows as the Minotaur: identical impulses and dips for the same blow', () => {
  const a = fixture(0), b = fixture(1);
  HERO.hit(HIT, a.ctx); FOE.hit({ ...HIT, target: 1 }, b.ctx);
  assert.ok(a.log.impulses.length > 0);
  assert.deepEqual(a.log.impulses, b.log.impulses);
  HERO.frame(0.1, [], a.ctx); FOE.frame(0.1, [], b.ctx);
  assert.deepEqual(a.log.strengths, b.log.strengths); assert.deepEqual(a.log.blends, b.log.blends);
  assert.ok(a.log.blends.length > 0, 'bones follow the ragdoll while the dip plays');
  HERO.kill(); FOE.kill();
});

test('state is per module: a blow on the hero does not move the Minotaur\'s dips, and the hero module ignores a context that is not hers', () => {
  const a = fixture(0), b = fixture(1), other = fixture(1);
  HERO.hit(HIT, other.ctx); HERO.frame(0.1, [], other.ctx);
  assert.equal(other.log.impulses.length + other.log.strengths.length + other.log.blends.length, 0, 'target 1: ignored');
  HERO.hit(HIT, a.ctx);
  FOE.frame(0.1, [], b.ctx);
  assert.equal(b.log.strengths.length, 0, 'his module saw no blow');
  HERO.kill();
});

test('death: the kill resets the hero\'s reaction and the motors are put back once; a dead body takes no more', () => {
  const a = fixture(0);
  HERO.hit(HIT, a.ctx); HERO.frame(0.05, [], a.ctx);
  HERO.kill({ type: 'Killed', target: 0 }, a.ctx);
  const n = a.log.strengths.length;
  a.ctx.mode = 'dead'; HERO.frame(0.05, [], a.ctx);
  assert.equal(a.log.strengths.length, n, 'nothing written once she is dead (the package\'s death ramp owns the motors)');
});

test('knockdown (?rules=m4) is the rules path\'s alone: the module writes nothing while she is down', () => {
  const a = fixture(0); a.ctx.rd.state = 'knockdown';
  HERO.hit(HIT, a.ctx); HERO.frame(0.05, [], a.ctx);
  assert.equal(a.log.impulses.length, 0); assert.equal(a.log.blends.length, 0);
});

test('presentation only: the module imports no sim code and emits no sim event', () => {
  const s = src('src/fight/feel-hero.ts');
  assert.doesNotMatch(s, /import (?!type)[^\n]*from '\.\/duel\.ts'/);
  assert.doesNotMatch(s, /emitFeel|ctx\.emit|feel\.on/);
});

test('data: the hero row exists, validates, names Psyche\'s 106 body and a measure row the package ships; the rig map has her body', () => {
  assert.deepEqual(validateFile('physics', PHYSICS), []);
  assert.equal(PHYSICS.hero.id, 'psyche'); assert.equal(PHYSICS.hero.helmet, false); assert.deepEqual(PHYSICS.hero.gear, {});
  assert.equal(RIG.files.psyche, 'psyche-106');
  const path = PHYSICS.hero.measure['106'];
  assert.equal(path, 'physics/bodies/psyche-106.measure.json');
  const pkg = new URL(`../node_modules/@frankendom/physics/data/bodies/${path.split('/').pop()}`, import.meta.url);
  if (existsSync(pkg)) { const row = JSON.parse(readFileSync(pkg, 'utf8')); assert.ok(row && typeof row === 'object'); }
});

test('validator: the hero row is checked (unknown key, missing 106 measure, a 65 row, helmet, gear, an opponent\'s id, a bad path)', () => {
  const t = (mut, re) => { const b = JSON.parse(JSON.stringify(PHYSICS)); mut(b); assert.match(validateFile('physics', b).join('\n'), re); };
  t((b) => { b.hero.zoom = 1; }, /physics\.hero\.zoom: unknown key/);
  t((b) => { b.hero.measure = {}; }, /physics\.hero\.measure\.106: missing/);
  t((b) => { b.hero.measure['65'] = 'physics/bodies/psyche.measure.json'; }, /physics\.hero\.measure\.65: only the 106 rig/);
  t((b) => { b.hero.measure['106'] = '../secret.json'; }, /physics\.hero\.measure\.106: only the 106 rig/);
  t((b) => { b.hero.helmet = true; }, /physics\.hero\.helmet: must be false/);
  t((b) => { b.hero.gear = { head: ['x'] }; }, /physics\.hero\.gear: must be an empty object/);
  t((b) => { b.hero.id = b.opponents[0].id; }, /is an opponent's id/);
  t((b) => { b.hero = []; }, /physics\.hero: must be an object/);
});

test('hero death: she is the killed fighter 0, the ragdoll runs after the clip is posed, and a finish (victim 0) keeps her down', () => {
  const scene = src('src/fight/scene.ts'), ragdoll = src('src/fight/ragdoll.ts');
  const frame = scene.indexOf('heroRagdoll?.frame('), pose = scene.indexOf('heroFalls(stand(');
  assert.ok(pose > 0 && frame > pose, 'the hero ragdoll frame comes after the Death clip pose, so its bones win each frame');
  assert.match(scene, /heroRagdoll\?\.frame\(animationDt, events, practice\.finish\?\.victim === 0 \|\| practice\.duel\.fighters\[0\]\.health <= 0 \? \{ victim: 0 \} : null/);
  assert.match(ragdoll, /e\.type === 'Killed' && e\.target === side/);
});

test('hero ragdoll: no cuts, no corpse, no finisher, no rules path; her kill is the existing death fall', () => {
  const s = src('src/fight/ragdoll.ts'); const i = s.indexOf('export function heroRagdollFor');
  const body = s.slice(i, s.indexOf('/** scene.ts: does the ragdoll play', i));
  assert.match(body, /cut: \{ \.\.\.PHYSICS\.cut, on: false, onKill: \{\} \}/);
  assert.match(body, /false, false, false, activeFeels\(search, undefined, true\), 0, '__ragdollHero'/);
  assert.match(s, /e\.type === 'Killed' && e\.target === side/); assert.match(s, /rd\.kill\(blowImpulse\(/);
});
