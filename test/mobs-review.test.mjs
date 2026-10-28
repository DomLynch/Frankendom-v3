// TRASH MOBS, the reviewer's findings on #268 (2026-10-28): a STRIKE is never a hand-over, the fallen boss's corpse is protected while the hero cuts it, no farming at the never-lethal floor,
// the Daily Pit builds no mobs, a boss engage restores full health, and guard and roll work with goblins adjacent (real input).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Mobs, MOBS, kindRow } from '../src/zone/mobs.ts';
import { swingOf, heroOf } from '../src/fight/mob-swing.ts';
import { OPPONENTS, opponentAt } from '../src/fight/moves.ts';
import { initialPractice, project, stepPractice } from '../src/fight/combat.ts';
import { createInput } from '../src/fight/input.ts';
import { quantizeIntent } from '../src/fight/record.ts';
import { RULES } from '../src/fight/rules.ts';
import * as play from '../src/fight/play-radius.ts';
import { WORLD, zoneDuel } from '../src/zone/spawns.ts';
import { createMobsRun } from '../src/mobs-run.ts';
import { handsOver, freeCameraFor } from '../src/fight/free-camera.ts';
import { isFreeAction, isFreeStrike, setRoamStrikes, startFreeRoam, stepFreeRoam } from '../src/fight/free-roam.ts';
import { idleIntent } from '../src/fight/duel.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const ZONE = read('zones/zone1.row'), FIGHT = read('fight');
const MAIN = readFileSync(new URL('../src/client/main.ts', import.meta.url), 'utf8');
const TICK = 1 / 60;
const rowsWith = (patch) => { const r = clone(MOBS); for (const ring of Object.values(r.rings)) ring.density = 0; for (const [k, v] of Object.entries(patch)) { if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(r[k], v); else r[k] = v; } return r; };
const first = () => initialPractice(7, opponentAt(OPPONENTS[FIGHT.opponent], FIGHT.level), FIGHT.weapon, FIGHT.skill);

test('a STRIKE press is never a hand-over: the kill\'s ceremony and the finisher camera are not ended by a mashed STRIKE (roll, guard, step back and the stick still end it)', () => {
  setRoamStrikes(MOBS.hero.roamStrikes);
  const FREE = freeCameraFor(true, '');
  assert.ok(FREE?.stickEndsCeremony, 'the shipped row ends the ceremony on the stick');
  for (const a of ['light', 'light_left', 'light_right', 'heavy', 'thrust', 'kick']) {
    assert.equal(isFreeAction(a), false, `${a} is not a free action`);
    assert.equal(isFreeStrike(a), true, `${a} is a strike the walking hero takes`);
    assert.equal(handsOver(FREE, false, !!isFreeAction(a), 0.5, 0), false, `${a} mid-finisher does not hand over`);
  }
  for (const a of ['dodge', 'backstep', 'parry']) assert.equal(handsOver(FREE, false, isFreeAction(a), 0.5, 0), true, `${a} still ends the ceremony, as before`);
  assert.match(MAIN, /!!\(intent\.x \|\| intent\.z \|\| intent\.guard \|\| isFreeAction\(duelIntent\.action\)\)/, 'the page\'s hand-over reads isFreeAction only');
  assert.doesNotMatch(MAIN, /handsOver\([^\n]*isFreeStrike/);
  const p0 = first(), free = startFreeRoam(p0.duel, 100), step = stepFreeRoam(free, free.duel.fighters[0].body, { ...idleIntent(), action: 'light' }, 100);
  assert.equal(step.free.duel.fighters[0].phase, 'attack', 'once the walk has begun a STRIKE swings');
});

const corpseRun = () => {
  const run = createMobsRun({ zone: ZONE, origin: { x: 0, z: 0 }, bosses: () => [], suppress: () => false, coins: () => {}, rangeMetres: 30 });
  run.core.rows.spawnMinMetres = 0;
  for (const ring of Object.values(run.core.rows.rings)) ring.density = 0;   // no grid packs: only the ones the test makes
  const p0 = first();
  const at = (x, z) => ({ ...p0, duel: { ...p0.duel, fighters: [{ ...p0.duel.fighters[0], body: { ...p0.duel.fighters[0].body, x, z } }, p0.duel.fighters[1]] } });
  const kill = (practice, x, z) => ({ ...practice, enemy: { ...practice.enemy, x, z }, finish: { victim: 1, location: 'torso', move: 'light_right', heading: 0 } });
  const step = (practice, secs) => { for (let i = 0; i < secs / TICK; i++) run.tick(practice, practice.duel.fighters[0], TICK); };
  return { run, at, kill, step };
};

test('the fallen boss: packs stay quiet through the grace and while the hero stands within nearMetres of the corpse, no mob spawns inside the corpse pad, and it is forgotten after holdSeconds', () => {
  const { run, at, kill, step } = corpseRun(), C = MOBS.corpse;
  assert.ok(C.nearMetres >= 6, 'covers the any-attack-press cut reach of #252 (the validator also reads physics.json cut.strike.nearM once it lands)');
  run.core.spawnPackAt(70, 0, 'goblin', 6);
  step(at(50, 0), 1);
  assert.ok(run.core.count > 0, 'before the kill the pack came in');
  run.core.reset();
  run.core.spawnPackAt(70, 0, 'goblin', 6);
  step(kill(at(50, 0), 52, 0), C.graceSeconds - 1);
  assert.equal(run.corpses.length, 1);
  assert.equal(run.core.count, 0, 'no pack comes in during the grace after the kill');
  assert.equal(run.core.takeHeroDamage(), 0);
  step(at(52 + C.nearMetres + 20, 0), 3);   // grace over (the kill's finish is gone from the practice), hero away from the corpse
  assert.equal(run.core.count, 0, 'nobody spawns inside the corpse pad (corpse + nearMetres + padMetres)');
  const near = at(52 + C.nearMetres - 1, 0);
  step(near, 2);
  assert.equal(run.core.takeHeroDamage(), 0);
  assert.equal(run.core.alive, 0, 'a hero cutting the corpse is left alone');
  step(near, C.holdSeconds);
  assert.equal(run.corpses.length, 0, 'the corpse is forgotten after holdSeconds');
});

test('a mob walked into the corpse pad is walked out of it', () => {
  const { run, at, kill, step } = corpseRun();
  run.core.spawnPackAt(70, 0, 'goblin', 3);
  step(at(60, 30), 1);
  const pad = MOBS.corpse.nearMetres + MOBS.padMetres;
  step(kill(at(60, 30), 70, 0), 1);
  assert.ok(run.core.view.n > 0);
  for (let i = 0; i < run.core.view.n; i++) assert.ok(Math.hypot(run.core.view.x[i] - 70, run.core.view.z[i]) >= pad - 0.05, 'standing outside the corpse pad');
});

test('diminishing returns at the floor: a hero held at the floor farms less and less, and full pay is back above it', () => {
  const kills = (atFloor, n) => {
    const m = new Mobs({ rows: rowsWith({ pack: { radiusMetres: 1 }, spawnMinMetres: 0 }) });
    m.spawnPackAt(0, 30, 'goblin', n);
    const hero = { x: 0, z: 29, heading: 0, alive: true, defence: 0, atFloor }, out = [];
    m.onMobKilled((e) => out.push(e));
    m.tick(TICK, hero, null, false);
    for (let k = 0; k < n; k++) m.tick(TICK, hero, { active: true, id: k + 1, x: 0, z: 30, heading: 0, knockback: 1, hit: () => 999 }, true);
    return out;
  };
  const base = kills(false, 8), floored = kills(true, 8);
  assert.ok(base.length > 3 && floored.length === base.length);
  assert.ok(base.every((e) => e.farm === 1 && e.coins === kindRow(0).coins && e.heat === kindRow(0).heat));
  assert.equal(floored[0].farm, 1, 'the first kill at the floor pays in full');
  assert.equal(floored[1].farm, MOBS.farm.decay);
  assert.ok(floored[1].heat < floored[0].heat && floored[2].heat < floored[1].heat && floored[2].xp < floored[0].xp);
  assert.ok(floored.reduce((n, e) => n + e.coins, 0) < base.reduce((n, e) => n + e.coins, 0), 'coins fall away');
  assert.equal(floored.at(-1).coins, 0);
});

test('the Daily Pit builds no mobs (the page reads daily.run), and a boss engage rebuilds the fight at full health (hand -> rematch -> fresh)', () => {
  assert.match(MAIN, /const mobsRun = ZONE && !daily\.run \? createMobsRun\(/);
  assert.match(MAIN, /const hand = \(index: number, at: \{ x: number; z: number \}\) => rematch\(poseFor\(index, at\), index, false, true\);/);
  assert.match(MAIN, /seed = nextSeed\(seed\); practice = fresh\(pose\);/, 'every hand-over builds a fresh practice');
  assert.equal(first().playerHealth, RULES.health, 'a fresh fight starts the hero at full health');
});

test('REAL INPUT: with goblins adjacent the hero\'s guard (held) and roll work through the input layer, guard turns their blows aside', () => {
  const rows = rowsWith({ pack: { radiusMetres: 0, wanderMetres: 0 }, spawnMinMetres: 0 });
  const els = {};
  const fake = () => ({ handlers: {}, dataset: {}, style: {}, offsetWidth: 0, addEventListener(t, f) { (this.handlers[t] ??= []).push(f); }, fire(t, e = {}) { for (const f of this.handlers[t] ?? []) f({ button: 0, pointerId: 1, preventDefault() {}, ...e }); }, setPointerCapture() {}, setAttribute() {}, click() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 50, height: 50 }) });
  const win = fake();
  let now = 0;
  play.setPlayScale(WORLD.pitScale);
  let practice = first();
  practice = project(zoneDuel(practice.duel, { hero: { x: 0, z: 0 }, foe: { x: 300, z: 300 }, heroFacing: 0 }), practice.ai, practice);
  const controls = createInput({ element: (id) => (els[id] ??= fake()), window: win, now: () => now, matchMedia: () => ({ matches: false }), innerWidth: () => 375, paused: () => false, ready: () => true, practice: () => practice, quiet: () => {}, walking: () => false });
  const m = new Mobs({ rows });
  m.spawnPackAt(0, 1.3, 'goblin', 3);
  let blocked = 0, hurt = 0, rolled = false, guarded = false;
  const tick = () => {
    now += 1000 / 60; controls.promoteDodge(now);
    const it = controls.intent(), prior = practice;
    practice = stepPractice(prior, quantizeIntent({ move: { x: it.x, z: it.z, yaw: 0, run: it.run }, action: it.action, guard: it.guard, guardDirection: it.guardDirection ?? undefined, held: it.held, lock: false, cancel: it.cancel }));
    controls.consumed(practice.events);
    const f = practice.duel.fighters[0];
    m.tick(TICK, heroOf(f), swingOf(prior.duel.fighters[0], f), false);
    blocked += m.takeBlocked(); hurt += m.takeHeroDamage();
    if (f.phase === 'roll') rolled = true;
    if (f.phase === 'guard') guarded = true;
  };
  win.fire('keydown', { code: 'KeyQ' });
  for (let i = 0; i < 360; i++) tick();
  assert.equal(guarded, true, 'the guard came up with goblins adjacent');
  assert.ok(blocked > 0, 'their blows were turned aside by the guard');
  assert.equal(hurt, 0, 'and none landed');
  win.fire('keyup', { code: 'KeyQ' });
  for (let i = 0; i < 20; i++) tick();
  win.fire('keydown', { code: 'KeyW' }); win.fire('keydown', { code: 'KeyE' }); win.fire('keyup', { code: 'KeyE' });
  for (let i = 0; i < 40; i++) tick();
  win.fire('keyup', { code: 'KeyW' });
  assert.equal(rolled, true, 'the roll came out with goblins adjacent');
  for (let i = 0; i < 600; i++) tick();
  assert.ok(hurt > 0, 'control: standing open, the same goblins land blows');
});
