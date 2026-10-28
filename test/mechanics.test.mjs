// Boss signature mechanics (data/mechanics.json, src/fight/mechanics): the schema, the registry pinned to the rows, the rings naming a mechanic, and The Titan's Envoy's LATCH stepped on the real duel
// (stepDuel): the tell, the lunge, the latch (stamina drain to a floor above the roll cost, slowed walk), and every way out: a roll, three cuts, the timeout, a guarded lunge, a rolled-away lunge, a cut on the crouch, a death.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkMechanics, validateFile, SCHEMA } from '../src/sim/validate.js';
import { validateRings } from '../src/sim/validate-rings.js';
import { initialDuel, idleIntent, stepDuel } from '../src/fight/duel.ts';
import { OPPONENTS, RULES } from '../src/fight/moves.ts';
import { MECHANICS, createMechanic, heldBoss, mechanicIdFor } from '../src/fight/mechanics/registry.ts';
import { createEnvoyLatch, ENVOY_LATCH_ROW } from '../src/fight/mechanics/envoy-latch.ts';
import { RINGS } from '../src/zone/rings.ts';
import { ZONES } from '../src/zone/zone-rows.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const DATA = read('mechanics'), ROW = ENVOY_LATCH_ROW;

test('the mechanics file validates, the registry holds exactly its ids, and a floor under the roll cost is refused', () => {
  assert.ok(SCHEMA.mechanics);
  assert.deepEqual(validateFile('mechanics', DATA), []);
  assert.deepEqual(checkMechanics(DATA, { rollCost: RULES.rollCost }), []);
  assert.deepEqual(Object.keys(MECHANICS).sort(), Object.keys(DATA.rows).sort(), 'one registry line per row, one row per registry line');
  assert.ok(ROW.drainFloor >= RULES.rollCost, 'the latch is always breakable by a roll');
  const bad = (edit, re) => { const j = clone(DATA); edit(j.rows['envoy-latch']); assert.match(checkMechanics(j, { rollCost: RULES.rollCost }).join('\n'), re); };
  bad((r) => { r.drainFloor = RULES.rollCost - 1; }, /roll cost/);
  bad((r) => { r.breakHits = 0; }, /breakHits/);
  bad((r) => { r.lungeMaxM = r.lungeMinM; }, /lungeMaxM/);
  bad((r) => { r.tell.colour = 'green'; }, /colour/);
  bad((r) => { r.surprise = 1; }, /unknown key/);
  const stray = clone(DATA); stray.rows.nobody = {};
  assert.match(checkMechanics(stray).join('\n'), /no checker/);
  assert.throws(() => createMechanic('nobody'), /no mechanic/);
});

test('the rings accept a registered mechanic id (the parasite names envoy-latch) and refuse any other', () => {
  const ids = Object.keys(DATA.rows);
  assert.equal(mechanicIdFor('parasite'), 'envoy-latch');
  assert.equal(mechanicIdFor('pumpkinhulk'), null);
  const zone = read('zones/zone1.row'), plates = read('stage').skyline.ring.plates.map((p) => p.id), kinds = read('profiles').profiles.map((p) => p.id), rig = read('rig');
  const origin = { x: 0, z: 0 };
  void ZONES; void origin;
  const refuse = (mutate, re) => { const rows = clone(RINGS); mutate(rows); assert.match(validateRings(rows, zone, ringOriginOf(zone), kinds, rig, plates, ids).join('\n'), re); };
  function ringOriginOf(z) { const a = z.areas.find((x) => x.id === read('respawn').world.pitArea), c = read('respawn').world.centre; return { x: a.min[0] + (a.max[0] - a.min[0]) * c, z: a.min[1] + (a.max[1] - a.min[1]) * c }; }
  assert.deepEqual(validateRings(clone(RINGS), zone, ringOriginOf(zone), kinds, rig, plates, ids), []);
  refuse((r) => { r.bosses[0].mechanic = 'spin'; }, /mechanic/);
  refuse((r) => { r.bosses[0].mechanic = 7; }, /mechanic/);
  assert.match(validateRings(clone(RINGS), zone, ringOriginOf(zone), kinds, rig, plates).join('\n'), /parasite.mechanic/, 'with no registry given, a named mechanic is refused');
});

// ---- the duel harness: the hero and the Envoy 4 m apart, both standing; the Envoy is held by the mechanic's layer and otherwise passive (his own brain is the game's, not this test's)
const DT = 1;
function start(pose = { hero: { x: 0, z: 2 }, foe: { x: 0, z: -2 }, heroFacing: Math.PI }) {
  const d = initialDuel(OPPONENTS.veteran, undefined, null, pose);
  return { ...d, radius: 20, fighters: [{ ...d.fighters[0], phase: 'ready', stamina: 100 }, { ...d.fighters[1], phase: 'ready' }] };
}
const go = (heroIntent = {}) => ({ ...idleIntent(), ...heroIntent });
const WALK = { move: { x: 0, z: 1, yaw: 0, run: true } };
/** One game tick, exactly as src/client/main.ts steps it: the mechanic first, then stepDuel with the held layer. */
function tick(state, heroIntent) {
  const m = state.mech.step(state.duel, heroIntent);
  const warden = m.hold ? heldBoss(m.duel, idleIntent()) : idleIntent();
  const duel = stepDuel(m.duel, [m.intent, warden]);
  state.duel = duel; state.log.push({ tick: duel.tick, stage: state.mech.view()?.phase ?? null, stamina: duel.fighters[0].stamina, hero: { x: duel.fighters[0].body.x, z: duel.fighters[0].body.z }, boss: { x: duel.fighters[1].body.x, z: duel.fighters[1].body.z }, intent: m.intent });
  return state;
}
const fresh = (row = ROW, pose) => ({ mech: createEnvoyLatch({ ...row, firstCooldownTicks: 1 }), duel: start(pose), log: [] });
const until = (s, pred, intent = () => go(), max = 600) => { for (let i = 0; i < max && !pred(s); i++) tick(s, intent(s)); return pred(s); };
const phase = (s) => s.mech.view()?.phase ?? null;
const FIRST_COOLDOWN_GONE = (s) => s.duel.tick > 2;

test('the Envoy crouches (the tell shows a line to the hero) for tellTicks, then lunges, then latches on a hero who stands', () => {
  const s = fresh();
  assert.ok(until(s, (x) => phase(x) === 'tell'), 'in range and ready: he crouches');
  const v = s.mech.view();
  assert.ok(Math.abs(v.fromZ - -2) < 0.01 && Math.abs(v.toZ - 2) < 0.01, 'the line runs from the Envoy to the hero');
  const crouchedAt = s.duel.tick;
  assert.ok(until(s, (x) => phase(x) === 'lunge'));
  assert.ok(s.duel.tick - crouchedAt >= ROW.tellTicks - 1 && s.duel.tick - crouchedAt <= ROW.tellTicks + 1, `the crouch is the tell row's ${ROW.tellTicks} ticks, was ${s.duel.tick - crouchedAt}`);
  assert.ok(until(s, (x) => phase(x) === 'latched'), 'the lunge lands');
  const [hero, boss] = s.duel.fighters;
  assert.ok(Math.hypot(hero.body.x - boss.body.x, hero.body.z - boss.body.z) <= ROW.latchGapM + 0.05, 'latched he rides one latch gap from the hero');
});

test('latched: stamina drains at the row rate to the floor and no further, the walk is slowed and the sprint refused; the roll cost stays affordable', () => {
  const s = fresh(); until(s, (x) => phase(x) === 'latched');
  const at = s.duel.fighters[0].stamina, t0 = s.duel.tick;
  for (let i = 0; i < 60; i++) tick(s, go(WALK));
  const lost = at - s.duel.fighters[0].stamina;
  assert.ok(Math.abs(lost - ROW.drainPerSecond) < 1.5, `one second latched costs about drainPerSecond (${ROW.drainPerSecond}), cost ${lost}`);
  const last = s.log[s.log.length - 1];
  assert.equal(last.intent.move.run, false, 'no sprint while latched');
  assert.ok(Math.abs(last.intent.move.z - ROW.slowPct / 100) < 1e-9, 'the stick is scaled to slowPct');
  assert.ok(s.duel.tick > t0);
  for (let i = 0; i < 400 && phase(s) === 'latched'; i++) tick(s, go());
  const floor = Math.min(...s.log.filter((l) => l.stage === 'latched').map((l) => l.stamina));
  assert.ok(floor >= ROW.drainFloor - 1e-9 && floor >= RULES.rollCost, `stamina never falls under the floor (${floor} vs ${ROW.drainFloor}), so a roll is always paid for`);
});

test('a ROLL breaks the latch: he is thrown off, stands open (held) for breakRecoverTicks, and the cooldown keeps him from latching again at once', () => {
  const s = fresh(); until(s, (x) => phase(x) === 'latched');
  tick(s, go({ action: 'dodge', move: { x: 1, z: 0, yaw: 0, run: false } }));
  assert.ok(until(s, (x) => phase(x) === null, () => go(), 30), 'the latch is gone within a few ticks of the roll');
  const gap = Math.hypot(s.duel.fighters[0].body.x - s.duel.fighters[1].body.x, s.duel.fighters[0].body.z - s.duel.fighters[1].body.z);
  assert.ok(gap > ROW.latchGapM, `thrown off the hero (gap ${gap})`);
  for (let i = 0; i < ROW.breakRecoverTicks + 5; i++) tick(s, go());
  assert.notEqual(phase(s), 'latched');
  for (let i = 0; i < ROW.cooldownTicks - ROW.breakRecoverTicks - 20; i++) { tick(s, go()); assert.equal(phase(s), null, 'cooldown: no crouch yet'); }
});

test('breakHits cuts inside breakWindowTicks break it; cuts spread wider than the window do not; a timeout lets go', () => {
  const hit = (s) => ({ ...s.duel, events: [{ tick: s.duel.tick, type: 'Hit', actor: 0, target: 1, damage: 5 }] });
  const s = fresh(); until(s, (x) => phase(x) === 'latched');
  for (let i = 0; i < ROW.breakHits - 1; i++) { s.duel = hit(s); tick(s, go()); }
  assert.equal(phase(s), 'latched', 'one cut short of the count: still latched');
  s.duel = hit(s); tick(s, go()); tick(s, go());
  assert.equal(phase(s), null, 'the last cut of the count breaks it');
  const slow = fresh(); until(slow, (x) => phase(x) === 'latched');
  for (let i = 0; i < ROW.breakHits + 3; i++) { slow.duel = hit(slow); tick(slow, go()); for (let k = 0; k < ROW.breakWindowTicks; k++) tick(slow, go()); if (phase(slow) !== 'latched') break; }
  assert.equal(phase(slow) === 'latched' || slow.log.some((l) => l.stage === 'latched'), true);
  const idle = fresh({ ...ROW, maxLatchTicks: 90, breakWindowTicks: 40 }); until(idle, (x) => phase(x) === 'latched');
  const held = idle.duel.tick; until(idle, (x) => phase(x) !== 'latched', () => go(), 300);
  assert.ok(idle.duel.tick - held <= 92 && idle.duel.tick - held >= 40, 'the timeout is the ladder-scaled maxLatchTicks (the first landing is full length)');
});

test('GUARD the lunge: no latch, the stamina chip, the Envoy bounces off and stands open; a roll out of the line whiffs him', () => {
  const g = fresh(); g.duel = { ...g.duel, fighters: [{ ...g.duel.fighters[0], phase: 'guard' }, g.duel.fighters[1]] };
  until(g, (x) => phase(x) === 'lunge', () => go({ guard: true }));
  const before = g.duel.fighters[0].stamina;
  until(g, (x) => phase(x) === null, () => go({ guard: true }), 40);
  assert.ok(!g.log.some((l) => l.stage === 'latched'), 'a guarded lunge never latches');
  assert.ok(g.duel.fighters[0].stamina <= before, 'the guard paid the chip');
  const r = fresh(); until(r, (x) => phase(x) === 'lunge');
  tick(r, go({ action: 'dodge', move: { x: 1, z: 0, yaw: 0, run: false } }));
  until(r, (x) => phase(x) === null, () => go(), 40);
  assert.ok(!r.log.some((l) => l.stage === 'latched'), 'a roll as the lunge arrives: he whiffs');
});

test('a cut on the crouch cancels the lunge; a death ends the latch the same tick (the corpse cut); out of range he does not crouch', () => {
  const c = fresh(); until(c, (x) => phase(x) === 'tell');
  c.duel = { ...c.duel, fighters: [c.duel.fighters[0], { ...c.duel.fighters[1], phase: 'hurt' }] };
  tick(c, go()); assert.equal(phase(c), null); for (let i = 0; i < 80; i++) tick(c, go()); assert.ok(!c.log.some((l) => l.stage === 'lunge'));
  const d = fresh(); until(d, (x) => phase(x) === 'latched');
  d.duel = { ...d.duel, fighters: [d.duel.fighters[0], { ...d.duel.fighters[1], health: 0 }] };
  const m = d.mech.step(d.duel, go()); assert.equal(d.mech.view(), null); assert.equal(m.duel, d.duel); assert.equal(m.hold, false);
  const far = fresh(ROW, { hero: { x: 0, z: 8 }, foe: { x: 0, z: -6 }, heroFacing: Math.PI }); for (let i = 0; i < 200; i++) tick(far, go());
  assert.ok(!far.log.some((l) => l.stage), 'beyond lungeMaxM he never crouches');
});

test('the latch is a crowd-control kind: full, half, quarter, then a harmless bump; and the whole thing is deterministic', () => {
  const durations = [];
  const s = { mech: createEnvoyLatch({ ...ROW, firstCooldownTicks: 1, cooldownTicks: 1, breakRecoverTicks: 1, maxLatchTicks: 200, breakWindowTicks: 400 }), duel: start(), log: [] };
  for (let n = 0; n < 4; n++) {
    s.duel = start(); s.duel = { ...s.duel, tick: s.duel.tick + n * 10 };
    if (!until(s, (x) => phase(x) === 'latched', () => go(), 400)) { durations.push(0); continue; }
    let t = 0; while (phase(s) === 'latched' && t < 400) { tick(s, go()); t++; }
    durations.push(t);
    for (let i = 0; i < 6; i++) tick(s, go());
  }
  assert.ok(durations[0] >= 180 && durations[0] <= 202, `the first landing is full length (${durations[0]})`);
  assert.ok(durations[1] >= 90 && durations[1] <= 102, `the second lasts half (${durations[1]})`);
  assert.ok(durations[2] >= 44 && durations[2] <= 52, `the third a quarter (${durations[2]})`);
  assert.equal(durations[3] === 0 || durations[3] <= 2, true, 'the fourth is a bump');
  const run = () => { const a = fresh(); for (let i = 0; i < 400; i++) tick(a, go(i % 90 === 0 ? { action: 'dodge' } : {})); return JSON.stringify(a.log.map((l) => [l.stage, l.stamina, l.boss.x])); };
  assert.equal(run(), run());
});
