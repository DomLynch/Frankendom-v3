// The HELD duel foe wears its own body (PR 2 of "10 different bosses", docs/BOSS-BODIES.md; src/fight/held-body.ts, scene.ts holdBody, ragdoll.ts setHeldRagdoll / heldRagdollFor / idleFrame).
// No second real 106 body with the V3 clip set is in the repo (Psyche is the hero), so the swap is driven with stand-in rigs and ragdolls and a synthetic body stem; what the pixels do with a
// real second body is not exercised here (the PR body says so). The default (every spawn the Minotaur) must build nothing: pinned below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createHeldBodies } from '../src/fight/held-body.ts';
import { createFoeRagdoll, heldRagdollFor, ragdollBody, ragdollFinisher, ragdollRowFor, setHeldRagdoll } from '../src/fight/ragdoll.ts';
import { spawnBodyFile } from '../src/fight/foe-body.ts';
import { rigStemOf } from '../src/fight/rig-bones.ts';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const PHYSICS = read('physics'), ZONE = JSON.parse(readFileSync(new URL('../data/zones/zone1.row.json', import.meta.url), 'utf8'));
const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

/** A harness: stand-in rigs/ragdolls, a build counter, and the mount log. `plan[body]` = 'ok' | 'null' | 'throw'. */
function harness(plan = {}, over = {}) {
  const log = { builds: [], mounts: [], errors: [] };
  const ragdoll = (name) => ({ name, corpses: 0 });
  const home = { body: 'minotaur-106', rig: { name: 'home-rig' }, ragdoll: ragdoll('home-rd'), plainOnly: false };
  let canSwap = true;
  const held = createHeldBodies({
    home,
    build: async (body) => {
      log.builds.push(body);
      const how = plan[body] ?? 'ok';
      if (how === 'throw') throw new Error('load failed');
      if (how === 'null') return null;
      return { rig: { name: `${body}-rig` }, ragdoll: how === 'norow' ? null : ragdoll(`${body}-rd`) };
    },
    mount: (next, prev, first) => { if (over.mountThrows === next.body) throw new Error('wiring broke'); log.mounts.push([prev.body, next.body, first]); },
    canSwap: () => canSwap,
    onError: (e) => log.errors.push(String(e.message)),
  });
  return { held, log, home, setCanSwap: (v) => { canSwap = v; } };
}

test('DEFAULT UNCHANGED: holding the page\'s own body builds, loads and mounts nothing, however often it is asked', async () => {
  const { held, log, home } = harness();
  for (let i = 0; i < 50; i++) assert.equal(held.hold('minotaur-106'), 'same');
  assert.equal(held.hold(undefined), 'same'); assert.equal(held.hold(null), 'same');
  await held.settled();
  assert.deepEqual(log.builds, []); assert.deepEqual(log.mounts, []);
  assert.equal(held.atHome, true); assert.equal(held.slots().length, 1);
  assert.deepEqual(held.counts(), { builds: 0, hits: 0, swaps: 0 });
  // the shipped zone: no spawn row names a body; the Pitborn spawn (spawn 1, the page's own body) builds nothing (the scene's holdBody returns before it makes a controller).
  // Re-pinned 2026-10-28 (Dom: spawns 2 and 3 are different bosses): spawns 2 and 3 take their profile rows' bodies (gargantua-106, arachne-106), reached through the swap path tested below.
  assert.deepEqual(ZONE.spawns.map((s) => spawnBodyFile(s.kind, 'minotaur', s.body)), ['minotaur-106', 'gargantua-106', 'arachne-106']);
  assert.equal(spawnBodyFile(ZONE.spawns[0].kind, 'minotaur', ZONE.spawns[0].body), home.body, 'spawn 1 is the live body: nothing to swap');
  const scene = src('fight/scene.ts');
  assert.match(scene, /if \(body === activeBody\(\) && !heldCtl\) return 'same';/, 'no controller is made while the held body is the live one');
  // Re-pinned 2026-10-28 (lazy boss bodies, the +3.13 MB first-visit finding): the one hook line now also passes whether the hero is within world.loadWithinMetres of the held spawn; scene.ts holdBody
  // still returns before it makes a controller for the page's own body (asserted above), and still starts no fetch for a far spawn (test/zone-spawns.test.mjs).
  assert.match(src('client/main.ts'), /if \(ZONE\) view\.holdBody\(spawns\[current\], withinLoad\(spawns\[current\]!, state\)\);/, 'one delimited line in main.ts');
});

test('cache miss: the first hold of another body starts ONE build, the live rig is untouched until it is in, then it swaps', async () => {
  const { held, log } = harness();
  assert.equal(held.hold('titan-106'), 'loading'); assert.equal(held.hold('titan-106'), 'loading'); assert.equal(held.pending(), 1);
  assert.equal(held.active.body, 'minotaur-106', 'still the first body while the file loads');
  await held.settled();
  assert.deepEqual(log.builds, ['titan-106'], 'one build however many frames asked');
  assert.equal(held.hold('titan-106'), 'swapped');
  assert.deepEqual(log.mounts, [['minotaur-106', 'titan-106', true]]);
  assert.equal(held.active.body, 'titan-106'); assert.equal(held.active.plainOnly, true, 'only the page\'s own body keeps the baked finishers');
  assert.equal(held.hold('titan-106'), 'same');
});

test('cache hit: handing back to the first body and over again builds nothing; the previous rig and ragdoll stay cached', async () => {
  const { held, log, home } = harness();
  held.hold('titan-106'); await held.settled(); held.hold('titan-106');
  const titan = held.active;
  assert.equal(held.hold('minotaur-106'), 'swapped', 'swapped back');
  assert.equal(held.active, home); assert.equal(held.atHome, true); assert.equal(held.active.plainOnly, false);
  assert.equal(held.hold('titan-106'), 'swapped', 'a cache hit: no loading state');
  assert.equal(held.active, titan, 'the same slot object, its rig and ragdoll are the ones built the first time');
  assert.deepEqual(log.builds, ['titan-106'], 'built once, ever');
  assert.deepEqual(log.mounts.map((m) => m[2]), [true, false, false], 'only the first mount of a body is `first`');
  assert.deepEqual(held.counts(), { builds: 1, hits: 2, swaps: 3 });
  assert.deepEqual(held.slots().map((s) => s.body), ['minotaur-106', 'titan-106']);
});

test('no leak between bodies: each slot keeps its own rig and ragdoll, a swap changes only which is active', async () => {
  const { held, home } = harness();
  held.hold('a-106'); held.hold('b-106'); await held.settled();
  held.hold('a-106'); const a = held.active; held.hold('b-106'); const b = held.active;
  assert.notEqual(a.rig, b.rig); assert.notEqual(a.ragdoll, b.ragdoll); assert.notEqual(a.ragdoll, home.ragdoll);
  assert.equal(held.slot('minotaur-106').ragdoll.name, 'home-rd'); assert.equal(held.slot('a-106').ragdoll.name, 'a-106-rd');
  assert.equal(held.slots().length, 3);
});

test('a swap waits while the live foe is mid-kill, and happens the first frame it is safe', async () => {
  const { held, setCanSwap, log } = harness();
  held.hold('titan-106'); await held.settled();
  setCanSwap(false);
  assert.equal(held.hold('titan-106'), 'waiting'); assert.equal(held.active.body, 'minotaur-106'); assert.deepEqual(log.mounts, []);
  setCanSwap(true);
  assert.equal(held.hold('titan-106'), 'swapped');
});

test('degrade, never throw: a body whose build is null, rejects, or whose wiring throws leaves the foe in the body it wears', async () => {
  for (const [how, expectError] of [['null', false], ['throw', true]]) {
    const { held, log } = harness({ 'x-106': how });
    assert.equal(held.hold('x-106'), 'loading'); await held.settled();
    assert.equal(held.hold('x-106'), 'failed'); assert.equal(held.hold('x-106'), 'failed');
    assert.deepEqual(log.builds, ['x-106'], 'a failed body is never retried');
    assert.equal(held.active.body, 'minotaur-106'); assert.equal(log.errors.length, expectError ? 1 : 0);
    assert.equal(held.hold('minotaur-106'), 'same');
  }
  const { held, log } = harness({}, { mountThrows: 'm-106' });
  held.hold('m-106'); await held.settled();
  assert.equal(held.hold('m-106'), 'failed'); assert.equal(held.active.body, 'minotaur-106'); assert.equal(log.errors[0], 'wiring broke');
  assert.equal(held.has('m-106'), false, 'a body whose wiring broke is dropped from the cache');
  assert.equal(held.hold('m-106'), 'failed');
});

test('a body with no physics row builds with a null ragdoll and still swaps (it dies the plain way)', async () => {
  const { held } = harness({ 'n-106': 'norow' });
  held.hold('n-106'); await held.settled(); held.hold('n-106');
  assert.equal(held.active.ragdoll, null); assert.equal(held.active.plainOnly, true);
});

test('ragdoll rows are per id AND body: a held body without a data/physics.json opponents row has no ragdoll and no cut data', () => {
  const real = PHYSICS.opponents[0];
  assert.equal(ragdollRowFor(PHYSICS, '', real.id, real.body)?.body, real.body, 'the Minotaur\'s own row is found by (id, body)');
  assert.equal(ragdollRowFor(PHYSICS, '', real.id, 'synthetic'), null, 'a body with no row: the plain death');
  assert.equal(ragdollRowFor(PHYSICS, '?physics=v1', real.id, real.body), null);
  assert.equal(heldRagdollFor('', real.id, 'synthetic'), null);
  assert.equal(heldRagdollFor('', 'nobody', real.body), null);
  assert.equal(rigStemOf('minotaur-106'), 'minotaur'); assert.equal(rigStemOf('unmapped-106'), 'unmapped-106');
  // a body whose physics row exists but whose cut GLB/manifest does not: the chunk lists no manifest, the physics-chunk table is the data
  const chunk = src('fight/physics-chunk.ts');
  assert.match(chunk, /export const cutManifests: Record<string, unknown> = \{ minotaur: minotaurManifest \};/);
  assert.match(src('fight/ragdoll.ts'), /c\.cutManifests\?\.\[foe\.body\] \?\? \(foe\.body === 'minotaur' \? c\.minotaurCutManifest : undefined\)/);
});

test('the finisher pick follows the live body: a swapped body dies the plain way even with no ragdoll; swapping back restores the first body\'s rules', () => {
  try {
    setHeldRagdoll(null, true);
    assert.equal(ragdollFinisher(), ragdollFinisher([]), 'a plain-only body forces the plain death');
    assert.notEqual(ragdollFinisher(), null, 'plain death, not the rotation (its baked finishers are not prepared on this body)');
    assert.equal(ragdollBody(null), false);
    setHeldRagdoll(null, false);
    assert.equal(ragdollFinisher(), null, 'back on the first body with no ragdoll: the rotation as before');
  } finally { setHeldRagdoll(null, false); }
});

test('two ragdolls on one page keep separate state: own cost record, own corpses, an idle frame with none is a no-op', async () => {
  const row = { id: 'pitborn', body: 'synthetic', measure: {}, helmet: false, gear: {} };   // a synthetic body with no measure row
  const load = () => Promise.reject(new Error('the chunk is never asked for a body without a measure row'));
  const a = createFoeRagdoll(PHYSICS, row, load, false, false, false, [], '', 1, '__ragdoll:synthetic-a');
  const b = createFoeRagdoll(PHYSICS, row, load, false, false, false, [], '', 1, '__ragdoll:synthetic-b');
  assert.notEqual(globalThis['__ragdoll:synthetic-a'], globalThis['__ragdoll:synthetic-b']);
  const group = new THREE.Group(), anchor = new THREE.Group();
  await a.attach(group, { anchor });
  assert.match(globalThis['__ragdoll:synthetic-a'].state, /no measure row/, 'no cut/measure data: it degrades, never throws');
  assert.equal(a.busy, false); assert.equal(a.corpseCount, 0); assert.equal(b.corpseCount, 0);
  assert.doesNotThrow(() => { a.idleFrame(0.016); b.idleFrame(0.016); });
  assert.equal(a.leaveCorpse(), false, 'nothing to leave');
});

test('the scene wires the swap: ragdoll, tap, fade, feet, finisher pick, home-only baked finishers, parked corpses', () => {
  const scene = src('fight/scene.ts');
  for (const re of [
    /heldRagdollFor\(location\.search, opponentId, rigStemOf\(file\)\)/,   // the ragdoll row is keyed by id + the body's stem
    /rd\?\.listenTaps\(canvas, camera\)/,   // the tap on a corpse works for the new body's ragdoll too
    /if \(first\) next\.ragdoll\?\.attach\(opponent, next\.rig, w\.player\)/,   // attached once, on the first mount
    /setHeldRagdoll\(next\.ragdoll, next\.plainOnly\)/,   // the finisher pick reads the live body's ragdoll
    /foeFade\?\.adopt\(opponent\)/,   // the far fade covers the new rig
    /dustFeet\[2 \+ i\] = boneOf\(next\.rig\.anchor, name\)/,   // the sand under the new rig's feet
    /w\.opponent = next\.rig/,   // every reader of the live rig
    /idleFrame\(animationDt\)/,   // the left-behind body's corpses keep ageing
    /const hamstrungOk = \(\) => atHome\(\) && /, /const executionOk = \(\) => atHome\(\) && /,
    /\(homeActor \?\? loaded\.opponent\)\.adoptClip\('Death_Hamstrung'/,   // the baked clips are installed on the home rig, wherever the live foe is
  ]) assert.match(scene, re, String(re));
});
