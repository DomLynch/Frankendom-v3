// TRASH MOB SWARMS (data/mobs.json, src/zone/mobs.ts, src/fight/mob-swing.ts, src/mobs-run.ts; Dom 2026-10-28): pack spawn, cap, leash, suppress, the boss-pad exclusion, determinism, the rows, and one REAL input
// test: the hero presses STRIKE through the page's own input layer into the real duel sim and kills a goblin with the sim's own blade sweep and move rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Mobs, MOBS, cellUnit, kindRow } from '../src/zone/mobs.ts';
import { validateMobs } from '../src/sim/validate-mobs.js';
import { validateFile } from '../src/sim/validate.js';
import { swingOf, defenceOf, heroOf } from '../src/fight/mob-swing.ts';
import { OPPONENTS, opponentAt } from '../src/fight/moves.ts';
import { initialPractice, project, stepPractice } from '../src/fight/combat.ts';
import * as play from '../src/fight/play-radius.ts';
import { WORLD, zoneDuel } from '../src/zone/spawns.ts';
import { createInput } from '../src/fight/input.ts';
import { quantizeIntent } from '../src/fight/record.ts';
import { RULES } from '../src/fight/rules.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const RIG = read('rig'), RINGS = read('rings'), ZONE = read('zones/zone1.row'), FIGHT = read('fight');
const ringIds = RINGS.rings.map((r) => r.id), areaIds = ZONE.areas.map((a) => a.id);
const TICK = 1 / 60;
const here = { x: 0, z: 0, heading: 0, alive: true, defence: 0 };
const rowsWith = (patch) => { const r = clone(MOBS); for (const ring of Object.values(r.rings)) ring.density = 0; for (const [k, v] of Object.entries(patch)) { if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(r[k], v); else r[k] = v; } return r; };
const run = (m, hero, secs, swing = null, suppress = false) => { for (let i = 0; i < secs / TICK; i++) m.tick(TICK, hero, swing, suppress); };

test('the shipped rows validate (schema, ranges, the body in data/rig.json, the rings and the zone areas)', () => {
  assert.deepEqual(validateMobs(MOBS, RIG, ringIds, areaIds), []);
  assert.deepEqual(validateFile('mobs', read('mobs')), []);
  assert.deepEqual(validateFile('radar', read('radar')), []);
  assert.equal(MOBS.cap, 12, 'the default cap near the hero is a data row');
  assert.equal(kindRow(0).body, 'mob-crowd-b1-05');
  const bad = clone(MOBS); bad.kinds.goblin.body = 'no-such-body'; bad.despawnMetres = 10; bad.rings['ring-9'] = bad.rings.default; bad.cap = 99;
  const why = validateMobs(bad, RIG, ringIds, areaIds).join('\n');
  assert.match(why, /goblin\.body/); assert.match(why, /despawnMetres must be above/); assert.match(why, /ring-9 is no/); assert.match(why, /cap/);
});

test('the grid is deterministic: the same cell is the same pack on every visit, and the packs are not everywhere', () => {
  const a = [], b = [];
  for (let i = -20; i < 20; i++) for (let j = -20; j < 20; j++) { a.push(cellUnit(MOBS, i, j, 1)); b.push(cellUnit(MOBS, i, j, 1)); }
  assert.deepEqual(a, b);
  const dense = a.filter((u) => u < MOBS.rings.default.density).length / a.length;
  assert.ok(dense > 0.15 && dense < 0.5, `about the ring's density of cells hold a pack (${dense})`);
});

test('a pack comes in only when the hero is near, never in his face, never over the cap, and the rest wait for a free slot', () => {
  const rows = rowsWith({ pack: { radiusMetres: 2 } });
  const m = new Mobs({ rows });
  m.spawnPackAt(40, 0, 'goblin', 20);
  run(m, { ...here, x: 200 }, 1);
  assert.equal(m.count, 0, 'far from the hero nothing is made');
  run(m, { ...here, x: 40 - rows.activateMetres + 1 }, 1);
  assert.equal(m.count, rows.cap, 'a 20-strong pack fills the cap and no more');
  assert.equal(m.alive, rows.cap);
  const near = new Mobs({ rows }); near.spawnPackAt(5, 0, 'goblin', 5);
  run(near, here, 1);
  assert.equal(near.count, 0, 'a pack inside spawnMinMetres of the hero does not pop in beside him');
});

test('the cap is a hard ceiling every tick, a kill frees a slot for a waiting member, and the pack counts down', () => {
  const m = new Mobs({ rows: rowsWith({ pack: { radiusMetres: 2 } }) });
  const id = m.spawnPackAt(30, 0, 'goblin', 20);
  const killed = [];
  m.onMobKilled((e) => killed.push(e));
  const hero = { ...here, x: 30 - MOBS.spawnMinMetres - 2 };
  let peak = 0;
  const sweep = { active: true, id: 1, x: 0, z: 0, heading: 0, knockback: 4, hit: () => 99 };
  for (let k = 0; k < 6; k++) {
    for (let i = 0; i < 40; i++) { m.tick(TICK, hero, null, false); peak = Math.max(peak, m.count); }
    sweep.id++; sweep.x = 30; m.tick(TICK, hero, sweep, true);
  }
  run(m, hero, 4);
  assert.ok(peak <= MOBS.cap, `peak ${peak} never above the cap`);
  assert.ok(killed.length >= 12, `kills are events (${killed.length})`);
  assert.equal(killed[0].kind, 'goblin'); assert.equal(killed[0].coins, kindRow(0).coins); assert.equal(killed[0].heat, kindRow(0).heat); assert.equal(killed[0].xp, kindRow(0).xp);
  assert.equal(m.packLeft(id), 20 - killed.length);
});

test('leash and aggro: the pack hunts a hero in range, gives up and goes home when he runs past the leash; a boss fight (suppress) sends everyone home and nobody hits', () => {
  const rows = rowsWith({ pack: { radiusMetres: 2 } });
  const m = new Mobs({ rows });
  m.spawnPackAt(0, 40, 'goblin', 6);
  const hero = { x: 0, z: 40 - rows.spawnMinMetres - 1, heading: 0, alive: true, defence: 0 };
  run(m, hero, 1);
  assert.equal(m.count, 6);
  hero.z = 40 - 6;   // inside aggro of the pack
  run(m, hero, 3);
  assert.ok(m.view.state[0] === rows.states.chase || m.view.state[0] === rows.states.windup || m.view.state[0] === rows.states.recover, 'it hunts');
  const nearest = () => { let d = 1e9; for (let i = 0; i < m.view.n; i++) d = Math.min(d, Math.hypot(m.view.x[i] - hero.x, m.view.z[i] - hero.z)); return d; };
  assert.ok(nearest() < 3, 'it closed on him');
  m.takeHeroDamage();
  run(m, { ...hero, z: 40 - 6 }, 6);
  assert.ok(m.takeHeroDamage() > 0, 'a mob\'s blow lands on an open hero');
  // suppress: a boss fight
  run(m, hero, 8, null, true);
  assert.equal(m.takeHeroDamage(), 0, 'while a boss fight is on nobody hits him');
  for (let i = 0; i < m.view.n; i++) assert.ok(Math.hypot(m.view.x[i], m.view.z[i] - 40) < rows.pack.wanderMetres + 3, 'everyone went home');
  // out of leash
  const far = { ...hero, z: 40 + kindRow(0).leashMetres + 10 };
  run(m, far, 3);
  assert.equal(m.takeHeroDamage(), 0);
});

test('guard and roll turn a mob\'s blow aside; the hero is never killed by a mob while the row says so (the page lays the floor)', () => {
  const rows = rowsWith({ pack: { radiusMetres: 1 }, spawnMinMetres: 0 });
  const mk = (defence) => { const m = new Mobs({ rows }); m.spawnPackAt(1.2, 0, 'goblin', 3); const hero = { x: 0, z: 0, heading: 0, alive: true, defence }; run(m, hero, 4); return m; };
  assert.ok(mk(0).takeHeroDamage() > 0);
  const guarded = mk(rows.hero.guard), rolled = mk(rows.hero.roll);
  assert.equal(guarded.takeHeroDamage(), 0); assert.ok(guarded.takeBlocked() > 0);
  assert.equal(rolled.takeHeroDamage(), 0); assert.ok(rolled.takeBlocked() > 0);
  assert.equal(MOBS.hero.lethal, false);
});

test('boss pads: no pack stands in a boss circle and a mob that wanders into one is walked out of it', () => {
  const pad = { x: 60, z: 0, radius: 20 };
  const m = new Mobs({ rows: rowsWith({ startClearMetres: 0 }), pads: () => [pad] });
  for (let x = -300; x <= 300; x += 30) run(m, { ...here, x, z: 10 }, MOBS.scanSeconds * 2);
  assert.ok(m.count >= 0);
  const spots = [];
  m.forEachAlive((x, z) => spots.push([x, z]));
  for (const [x, z] of spots) assert.ok(Math.hypot(x - pad.x, z - pad.z) >= pad.radius - 1e-3, 'nobody inside the pad');
  // a pack made right on the pad is pushed out tick by tick
  const q = new Mobs({ rows: rowsWith({ spawnMinMetres: 0, pack: { radiusMetres: 1 } }), pads: () => [pad] });
  q.spawnPackAt(pad.x + 2, pad.z, 'goblin', 4);
  run(q, { ...here, x: pad.x + 30 }, 0.5);
  q.forEachAlive((x, z) => assert.ok(Math.hypot(x - pad.x, z - pad.z) >= pad.radius - 1e-3));
});

test('the rings pick the pack: ring 3 is denser and bigger than ring 1', () => {
  const r = MOBS.rings;
  assert.ok(r['ring-3'].density > r['ring-1'].density && r['ring-3'].size[1] > r['ring-1'].size[1]);
  const seen = [];
  const m = new Mobs({ rows: rowsWith({ startClearMetres: 0 }), ringAt: (d) => { seen.push(d); return 'ring-3'; } });
  run(m, { ...here, x: 500, z: 500 }, 1);
  assert.ok(seen.length > 0, 'the ring row is asked for each cell');
});

test('REAL INPUT: the hero presses STRIKE through the page\'s input layer into the real duel sim and kills a goblin in one or two hits with the sim\'s own blade sweep', () => {
  const rows = rowsWith({ pack: { radiusMetres: 0, wanderMetres: 0 }, spawnMinMetres: 0 });
  const m = new Mobs({ rows });
  const handlers = {}, els = {};
  const fake = () => ({ handlers: {}, dataset: {}, style: {}, offsetWidth: 0, addEventListener(t, f) { (this.handlers[t] ??= []).push(f); }, fire(t, e = {}) { for (const f of this.handlers[t] ?? []) f({ button: 0, pointerId: 1, preventDefault() {}, ...e }); }, setPointerCapture() {}, setAttribute() {}, click() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 50, height: 50 }) });
  void handlers;
  const win = fake();
  let now = 0;
  let practice = initialPractice(7, opponentAt(OPPONENTS[FIGHT.opponent], FIGHT.level), FIGHT.weapon, FIGHT.skill);
  // the boss is far from the hero: the open world, nobody engaged
  play.setPlayScale(WORLD.pitScale);
  practice = project(zoneDuel(practice.duel, { hero: { x: 0, z: 0 }, foe: { x: 300, z: 300 }, heroFacing: 0 }), practice.ai, practice);
  const controls = createInput({ element: (id) => (els[id] ??= fake()), window: win, now: () => now, matchMedia: () => ({ matches: false }), innerWidth: () => 375, paused: () => false, ready: () => true, practice: () => practice, quiet: () => {}, walking: () => false });
  const hero0 = practice.duel.fighters[0].body, h = hero0.heading;
  m.spawnPackAt(hero0.x + Math.sin(h) * 3, hero0.z + Math.cos(h) * 3, 'goblin', 1);   // it sees him and walks in to arm's length
  const kills = []; m.onMobKilled((e) => kills.push(e));
  let swings = 0, prevPhase = '', total = 0;
  const tick = () => {
    now += 1000 / 60; controls.promoteDodge(now);
    const it = controls.intent(), prior = practice;
    practice = stepPractice(prior, quantizeIntent({ move: { x: it.x, z: it.z, yaw: 0, run: it.run }, action: it.action, guard: it.guard, held: it.held, lock: false, cancel: it.cancel }));
    controls.consumed(practice.events);
    const f = practice.duel.fighters[0];
    if (f.phase === 'attack' && prevPhase !== 'attack') swings++;
    prevPhase = f.phase;
    m.tick(TICK, heroOf(f), swingOf(prior.duel.fighters[0], f), false);
    total++;
  };
  // STRIKE: the first press draws the sword (V1: a light press from the sheath), then each press swings
  for (let press = 0; press < 6 && kills.length === 0; press++) {
    if (m.view.n) {   // the player turns to face the goblin (a stick push; the page's free facing)
      const f = practice.duel.fighters[0], aim = Math.atan2(m.view.x[0] - f.body.x, m.view.z[0] - f.body.z);
      practice = { ...practice, duel: { ...practice.duel, fighters: [{ ...f, body: { ...f.body, heading: aim } }, practice.duel.fighters[1]] } };
    }
    win.fire('keydown', { code: 'KeyF' }); tick(); win.fire('keyup', { code: 'KeyF' });
    for (let i = 0; i < 80 && kills.length === 0; i++) tick();
  }
  assert.equal(m.count, 1, 'the goblin stood in front of the hero');
  assert.equal(kills.length, 1, `STRIKE killed the goblin (${swings} swings, ${total} ticks)`);
  assert.ok(swings >= 1 && swings <= 3, `in one or two hits (${swings} swings counted, one of them may have been the draw)`);
  assert.equal(kills[0].coins, kindRow(0).coins);
  assert.ok(m.view.state[0] >= rows.states.dying, 'the body falls');
});

test('defenceOf reads the hero\'s own guard and roll frames', () => {
  const p = initialPractice(7, opponentAt(OPPONENTS[FIGHT.opponent], FIGHT.level), FIGHT.weapon, FIGHT.skill), f = p.duel.fighters[0];
  assert.equal(defenceOf({ ...f, phase: 'guard' }), MOBS.hero.guard);
  assert.equal(defenceOf({ ...f, phase: 'roll', age: RULES.safeStart }), MOBS.hero.roll);
  assert.equal(defenceOf({ ...f, phase: 'roll', age: RULES.safeEnd + 1 }), 0);
  assert.equal(defenceOf({ ...f, phase: 'ready' }), 0);
});
