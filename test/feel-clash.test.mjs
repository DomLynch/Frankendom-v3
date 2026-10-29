// Weapon clash on a block or parry (data/feel-clash.json, src/fight/feel-clash.ts, ?feel=clash): the rows validate, the pure core is pinned, the package's ragdoll
// really recoils from the impulse and the motor dip, and the module can never touch the sim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPhysics } from '@frankendom/physics';
import { clashOf, clashOn, createClash, depthAt, impulseVector, leanOf, motorRows, simEvent, sparkPoint } from '../src/fight/feel-clash.ts';
import { checkFeelClash, validateFile } from '../src/sim/validate.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const ROWS = read('feel-clash'), RULES = read('rules'), PHYS = read('physics');
const clone = (x) => JSON.parse(JSON.stringify(x));
const blocked = (over = {}) => ({ type: 'Blocked', tick: 10, actor: 1, target: 0, move: 'light_slash_right', weapon: 'longsword', perfect: false, ...over });

test('the row validates, and every weapon the rules know has a weight', () => {
  assert.deepEqual(validateFile('feel-clash', ROWS), []);
  assert.deepEqual(Object.keys(ROWS.weaponKg).sort(), Object.keys(RULES.weapons).sort());
});

test('the validator refuses non-finite, out-of-range and unknown rows', () => {
  const bad = (edit) => { const j = clone(ROWS); edit(j); return checkFeelClash(j).join('\n'); };
  assert.match(bad((j) => { j.weaponKg.maul = Infinity; }), /weaponKg\.maul/);
  assert.match(bad((j) => { j.weaponKg.maul = -1; }), /weaponKg\.maul/);
  assert.match(bad((j) => { j.kinds.parried.absorbed = 1.5; }), /kinds\.parried\.absorbed/);
  assert.match(bad((j) => { j.kinds.blocked.dip = 0; }), /kinds\.blocked\.dip/);
  assert.match(bad((j) => { j.impulse.min = 99; }), /impulse\.min/);
  assert.match(bad((j) => { j.timing.upS = NaN; }), /timing\.upS/);
  assert.match(bad((j) => { delete j.kinds.broken; }), /kinds\.broken: missing/);
  assert.match(bad((j) => { j.spark.color = 'red'; }), /spark\.color/);
  assert.match(bad((j) => { j.hero.weaponArmRad = [9, 0, 0]; }), /hero\.weaponArmRad/);
  const unknown = clone(ROWS); unknown.extra = 1;
  assert.match(validateFile('feel-clash', unknown).join('\n'), /feel-clash\.extra: unknown key/);
});

test('opt-in: only ?feel=clash turns it on', () => {
  assert.equal(clashOn(ROWS, ''), false);
  assert.equal(clashOn(ROWS, '?feel=hit'), false);
  assert.equal(clashOn(ROWS, '?feel=clash'), true);
  assert.equal(clashOn({ ...ROWS, on: false }, '?feel=clash'), false);
});

test('a clash is read from the sim\'s Blocked, Parried and GuardBroken: defender is the actor, attacker the target; nothing else is a clash', () => {
  const b = clashOf(ROWS, blocked()), p = clashOf(ROWS, blocked({ type: 'Parried' })), g = clashOf(ROWS, blocked({ type: 'GuardBroken' })), pf = clashOf(ROWS, blocked({ perfect: true }));
  assert.deepEqual([b.kind, p.kind, g.kind, pf.kind], ['blocked', 'parried', 'broken', 'perfect']);
  assert.equal(b.defender, 1); assert.equal(b.attacker, 0);
  for (const type of ['Hit', 'Dodged', 'Killed', 'Staggered']) assert.equal(clashOf(ROWS, blocked({ type })), null);
  assert.equal(clashOf(ROWS, blocked({ missile: true })), null);
});

test('recoil scales with weapon weight and swing strength; a parry throws the attacker open more than a block, and the block\'s guard absorbs more than the parry\'s', () => {
  const at = (over) => clashOf(ROWS, blocked(over));
  assert.ok(at({ weapon: 'maul' }).attackerImpulse > at({ weapon: 'longsword' }).attackerImpulse);
  assert.ok(at({ weapon: 'longsword' }).attackerImpulse > at({ weapon: 'knife' }).attackerImpulse);
  const heavy = at({ move: 'heavy_overhead' }), light = at({});
  assert.equal(heavy.heavy, true); assert.equal(light.heavy, false);
  assert.ok(heavy.attackerImpulse > light.attackerImpulse);
  assert.ok(clashOf(ROWS, blocked({ type: 'Parried' })).attackerImpulse > light.attackerImpulse);
  assert.ok(light.defenderImpulse > clashOf(ROWS, blocked({ type: 'Parried' })).defenderImpulse);
  assert.equal(at({ charged: true, type: 'GuardBroken' }).charged, true);
  for (const w of Object.keys(ROWS.weaponKg)) for (const move of ['light_slash_right', 'heavy_overhead']) for (const type of ['Blocked', 'Parried', 'GuardBroken']) {
    const c = clashOf(ROWS, blocked({ weapon: w, move, type }));
    for (const v of [c.attackerImpulse, c.defenderImpulse]) assert.ok(Number.isFinite(v) && v >= 0 && v <= ROWS.impulse.max, `${w} ${move} ${type}: ${v}`);
  }
});

test('every directional and special heavy the rules list counts as heavy', () => {
  for (const m of RULES.heavyMoves) assert.equal(clashOf(ROWS, blocked({ move: m })).heavy, true, m);
});

test('pushback is data, not motion: a heavy guard hit pushes further, nothing here moves a body, and the event carries the sim-facing numbers', () => {
  const light = clashOf(ROWS, blocked()), heavy = clashOf(ROWS, blocked({ move: 'heavy_overhead' })), broken = clashOf(ROWS, blocked({ type: 'GuardBroken', move: 'heavy_overhead' })), parry = clashOf(ROWS, blocked({ type: 'Parried' }));
  assert.ok(heavy.pushbackM > light.pushbackM); assert.ok(broken.pushbackM > heavy.pushbackM); assert.equal(parry.pushbackM, 0);
  const ev = simEvent(ROWS, heavy);
  assert.deepEqual([ev.type, ev.kind, ev.pushbackM, ev.pushed, ev.attacker], ['feel:clash', 'block', heavy.pushbackM, 1, 0]);
  assert.equal(simEvent(ROWS, parry).kind, 'parry');
});

test('the dip eases in, holds, recovers and is over; a light clash is shorter than a heavy', () => {
  const T = ROWS.timing;
  assert.equal(depthAt(ROWS, true, 0), 0);
  assert.equal(depthAt(ROWS, true, T.easeInS + T.holdS / 2), 1);
  assert.ok(depthAt(ROWS, true, T.easeInS + T.holdS + T.upS / 2) > 0 && depthAt(ROWS, true, T.easeInS + T.holdS + T.upS / 2) < 1);
  assert.equal(depthAt(ROWS, true, T.easeInS + T.holdS + T.upS + 0.001), -1);
  assert.equal(depthAt(ROWS, true, -1), -1);
  const t = T.easeInS + T.holdS + T.upS - 0.01;
  assert.equal(depthAt(ROWS, false, t), -1); assert.ok(depthAt(ROWS, true, t) >= 0);
});

test('motor rows dip the weapon arm and spine of the attacker and the guard arm of the defender, only to the row\'s floor, and release to 1', () => {
  const c = clashOf(ROWS, blocked({ type: 'Parried', move: 'heavy_overhead' }));
  const a = motorRows(ROWS, c, 'attacker', 1), d = motorRows(ROWS, c, 'defender', 1);
  assert.deepEqual(Object.keys(a).sort(), [...ROWS.parts.attacker.weapon, ...ROWS.parts.attacker.spine].sort());
  assert.deepEqual(Object.keys(d).sort(), [...ROWS.parts.defender.guard, ...ROWS.parts.defender.spine].sort());
  for (const v of [...Object.values(a), ...Object.values(d)]) assert.ok(v >= 0.01 && v <= 1 && Number.isFinite(v));
  assert.ok(a.armRight < 1 && a.armRight >= c.dip - 1e-9 && a.spine2 > a.armRight);   // the arm dips more than the spine (dipParts)
  for (const v of Object.values(motorRows(ROWS, c, 'attacker', -1))) assert.equal(v, 1);
  const light = motorRows(ROWS, clashOf(ROWS, blocked({ type: 'Parried' })), 'attacker', 1);
  assert.ok(light.armRight > a.armRight, 'a light clash dips less deep than a heavy one');
});

test('the impulse knocks back along the struck fighter\'s own z, with the row\'s lift', () => {
  assert.deepEqual(impulseVector(6, 0.8), [0, 0.8, -6]);
  assert.deepEqual(impulseVector(0, 0.8), [0, 0, -0]);
});

test('the hero leans only in a clash he is part of, by the row\'s radians, and not at all outside the dip', () => {
  const c = clashOf(ROWS, blocked({ move: 'heavy_overhead' }));   // the hero (side 0) is the attacker
  const lean = leanOf(ROWS, c, 0, 1);
  assert.ok(lean.weaponArm[0] !== 0 && lean.spine[0] !== 0);
  assert.deepEqual(lean.guardArm, [0, 0, 0]);
  const defend = leanOf(ROWS, clashOf(ROWS, blocked({ actor: 0, target: 1 })), 0, 1);
  assert.deepEqual(defend.weaponArm, [0, 0, 0]); assert.ok(defend.guardArm[0] !== 0);
  assert.deepEqual(leanOf(ROWS, c, 1, 1).spine.map(Math.abs).length, 3);   // the foe's slot: he is the defender here (not the hero)
  assert.deepEqual(leanOf(ROWS, c, 0, -1).weaponArm, [0, 0, 0]);
  const bound = Math.max(...ROWS.hero.weaponArmRad.map(Math.abs));
  for (const v of lean.weaponArm) assert.ok(Math.abs(v) <= bound + 1e-9);
});

test('the spark sits on the line between the two weapon hands, lifted', () => {
  const p = sparkPoint(ROWS, [0, 1, 0], [0, 1, 2]);
  assert.deepEqual(p.map((v) => +v.toFixed(6)), [0, +(1 + ROWS.spark.liftM).toFixed(6), 1]);
});

test('the package ragdoll really recoils: the same blow moves the struck arm further with the clash than without, and the dip releases', async () => {
  const physics = await createPhysics({ seed: PHYS.seed, states: PHYS.states }), row = PHYS.opponents[0];
  const measure = read('physics') && JSON.parse(readFileSync(new URL(`../node_modules/@frankendom/physics/data/bodies/${row.measure['106'].split('/').pop()}`, import.meta.url), 'utf8'));
  const run = async (clash) => {
    const rd = physics.createRagdoll(measure, { id: `${row.id}-${clash}`, motorTuning: PHYS.motorTuning, solveHinges: PHYS.solveHinges });
    for (let i = 0; i < 10; i++) physics.step(1 / PHYS.tickHz);
    const arm = rd.partIds.indexOf('handRight'), z0 = rd.readPose()[arm * 10 + 2];
    if (clash) {
      const c = clashOf(ROWS, blocked({ actor: 0, target: 1, type: 'Parried', move: 'heavy_overhead' }));
      rd.stagger({ part: 'armRight', impulse: impulseVector(c.attackerImpulse, ROWS.impulse.lift) });
      let peak = 0;
      for (let i = 0; i < 24; i++) { rd.setMotorStrength(motorRows(ROWS, c, 'attacker', depthAt(ROWS, true, i / PHYS.tickHz))); physics.step(1 / PHYS.tickHz); peak = Math.max(peak, Math.abs(rd.readPose()[arm * 10 + 2] - z0)); }
      rd.setMotorStrength(motorRows(ROWS, c, 'attacker', -1));
      return peak;
    }
    let peak = 0;
    for (let i = 0; i < 24; i++) { physics.step(1 / PHYS.tickHz); peak = Math.max(peak, Math.abs(rd.readPose()[arm * 10 + 2] - z0)); }
    return peak;
  };
  const still = await run(false), clashed = await run(true);
  assert.ok(clashed > still + 0.005, `clash moved the hand ${clashed.toFixed(4)} m vs ${still.toFixed(4)} m untouched`);
  assert.ok(Number.isFinite(clashed));
  physics.destroy();
});

test('createClash logs the sim event once per clash and a quiet frame emits nothing', () => {
  const fc = createClash(ROWS);
  const emitted = [], emit = (n, p) => emitted.push([n, p]);
  const applied = [], rd ={ state: 'alive', applyImpulse: (p, v) => applied.push([p, v]), stagger: (h) => applied.push(['stagger', h]), setMotorStrength: () => {} };
  fc.frame(1 / 60, [blocked({ actor: 0, target: 1, move: 'heavy_overhead' })], { rd, emit });
  assert.equal(emitted.length, 1); assert.equal(emitted[0][0], 'feel:clash'); assert.equal(emitted[0][1].kind, 'block');
  assert.equal(applied.length, 1); assert.equal(applied[0][0], 'armRight');   // the foe struck: his weapon arm is knocked back
  fc.frame(1 / 60, [blocked({ actor: 1, target: 0 })], { rd, emit });              // the foe defended: his guard arm absorbs
  assert.equal(applied[1][0], 'armLeft');
  assert.doesNotThrow(() => { for (let i = 0; i < 100; i++) fc.frame(1 / 60, [], { rd, emit }); }, 'quiet frames are safe (their cost: test/perf/feel-clash-cost.perf.mjs)');
  assert.equal(emitted.length, 2, 'a quiet frame emits nothing');
});
