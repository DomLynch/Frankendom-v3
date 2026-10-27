// M7 limb damage (data/feel-limbs.json, src/fight/feel-limbs.ts, opt-in ?feel=limbs): the rows' schema, the pure plan (level, gait, stumble, arm sag), the dropped weapon's fall,
// the events by name, and the registry hook driving a fake ragdoll. PRESENTATION ONLY: nothing here imports the sim (duel.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createEvaluator, createFighterState, loadRules } from '@frankendom/physics';
import { validateFile, FEEL_PARTS } from '../src/sim/validate.js';
import { setPartHp } from '../src/fight/rules-eval.ts';
import { FEEL_NAMES } from '../src/fight/feel-modules.ts';
import * as chunk from '../src/fight/feel-chunk.ts';
import { createLimbs, feelLimbsOn, fighterOf, flatQuaternion, gaitDepth, heavyHit, hurtParts, levelOf, partOf, planOf, rowOf, stepFall, stumbleDepth, stumbles } from '../src/fight/feel-limbs.ts';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const ROWS = read('../data/feel-limbs.json'), RULES = read('../data/rules.json');
const whole = (o = {}) => fighterOf({ leg_left: 1, leg_right: 1, arm_left: 1, arm_right: 1, head: 1, torso: 1, ...o }, 'right');

test('the rows pass the closed key set and every number check; a bad number or key is named', () => {
  assert.deepEqual(validateFile('feel-limbs', ROWS), []);
  assert.deepEqual(FEEL_PARTS, Object.keys(ROWS.limbs.parts));
  const bad = (f) => { const c = structuredClone(ROWS); f(c); return validateFile('feel-limbs', c); };
  assert.deepEqual(validateFile('feel-limbs', { ...ROWS, extra: 1 }), ['feel-limbs.extra: unknown key']);
  assert.ok(bad((c) => { c.limbs.parts.leg.motor.thigh = 0; }).some((e) => e.includes('leg.motor.thigh')), 'a motor strength of 0 would freeze the joint');
  assert.ok(bad((c) => { c.limbs.parts.leg.motor.thigh = 'x'; }).some((e) => e.includes('leg.motor.thigh')));
  assert.ok(bad((c) => { c.limbs.parts.leg.gait.periodS = null; }).some((e) => e.includes('gait.periodS')));
  assert.ok(bad((c) => { c.limbs.parts.leg.sim.speedMult = NaN; }).some((e) => e.includes('sim.speedMult')));
  assert.ok(bad((c) => { c.limbs.parts.arm_sword.drop.velocity = [1, 2]; }).some((e) => e.includes('drop.velocity')));
  assert.ok(bad((c) => { c.limbs.parts.arm_sword.drop.bounces = 1.5; }).some((e) => e.includes('drop.bounces')));
  assert.ok(bad((c) => { delete c.limbs.parts.head; }).some((e) => e.includes('parts.head: missing')));
  assert.ok(bad((c) => { c.limbs.parts.leg.blend.knee = 0.5; }).some((e) => e.includes('unknown role')));
  assert.ok(bad((c) => { c.limbs.parts.leg.sim.block = 1; }).some((e) => e.includes('may not block')));
  assert.ok(bad((c) => { c.events.limp = ''; }).some((e) => e.includes('events.limp')));
});

test('every role in a row is a part of the ragdoll the package builds (thigh + a side, spine, neck), so a motor key never misses', () => {
  const ids = 'hips spine spine1 spine2 neck head armLeft armRight forearmLeft forearmRight handLeft handRight thighLeft thighRight shinLeft shinRight footLeft footRight toeLeft toeRight'.split(' ');
  const ragdollBones = Object.keys(read('../data/physics.json').bones);
  assert.deepEqual([...ids].sort(), [...ragdollBones].sort());
  const P = ROWS.limbs.parts;
  for (const [key, row] of Object.entries(P)) for (const role of Object.keys(row.motor)) {
    for (const side of row.sided ? ['left', 'right'] : [null]) assert.ok(ids.includes(partOf(row, role, side)), `${key}.${role} -> ${partOf(row, role, side)}`);
  }
  assert.equal(partOf(P.leg, 'thigh', 'left'), 'thighLeft'); assert.equal(partOf(P.torso, 'spine', null), 'spine');
});

test('?feel=limbs is the only way on: no query, another feel, or the rows off is today\'s fight', () => {
  assert.equal(ROWS.on, true);
  assert.equal(feelLimbsOn(ROWS, ''), false);
  assert.equal(feelLimbsOn(ROWS, '?feel=hitreact'), false);
  assert.equal(feelLimbsOn(ROWS, '?feel=limbs'), true);
  assert.equal(feelLimbsOn(ROWS, '?rules=m4&feel=hitreact,limbs'), true);
  assert.equal(feelLimbsOn({ ...ROWS, on: false }, '?feel=limbs'), false);
  assert.ok(FEEL_NAMES.includes('limbs'), 'listed in feel-modules.ts');
  assert.deepEqual(Object.keys(chunk.limbs).sort(), ['frame', 'hit', 'kill'], 'the feel chunk exports its hooks');
  assert.equal(ROWS.needs.query, RULES.query); assert.equal(ROWS.needs.value, RULES.m4);
});

test('level: none above startFrac, 1 at no budget, linear between; a bad number is 0', () => {
  assert.equal(levelOf(0.5, 1, 1), 0); assert.equal(levelOf(0.5, 0.5, 1), 0); assert.equal(levelOf(0.5, 0, 1), 1); assert.ok(Math.abs(levelOf(0.5, 0.25, 1) - 0.5) < 1e-9);
  assert.equal(levelOf(0.5, -3, 1), 1); assert.equal(levelOf(0.5, NaN, 1), 0); assert.equal(levelOf(0.5, 1, 0), 0);
  assert.equal(hurtParts(ROWS, whole()).length, 0, 'a whole man shows nothing');
});

test('the sword arm and the off arm follow the sword side; legs and head and torso have their rows', () => {
  assert.deepEqual(rowOf('arm_right', 'right'), { key: 'arm_sword', side: 'right' });
  assert.deepEqual(rowOf('arm_left', 'right'), { key: 'arm_off', side: 'left' });
  assert.deepEqual(rowOf('arm_left', 'left'), { key: 'arm_sword', side: 'left' });
  assert.deepEqual(rowOf('leg_left', 'right'), { key: 'leg', side: 'left' });
  assert.deepEqual(rowOf('head', 'right'), { key: 'head', side: null }); assert.equal(rowOf('hand_left', 'right'), null);
});

test('a leg at 0: the bad leg\'s motors sag and dip once a stride, the good leg dips in antiphase, nothing else is touched', () => {
  const f = whole({ leg_left: 0 }), g = ROWS.limbs.parts.leg.gait;
  assert.ok(gaitDepth(g, 0) < 1e-9 && gaitDepth(g, g.periodS * g.dipFrac / 2) > 0.99 && gaitDepth(g, g.periodS * (g.dipFrac + 0.1)) === 0);
  const dipAt = g.periodS * g.dipFrac / 2, up = g.periodS * 0.9;
  const dip = planOf(ROWS, f, dipAt, -1), rest = planOf(ROWS, f, up, -1);
  assert.ok(Math.abs(dip.strength.thighLeft - g.dipTo) < 1e-9, 'the thigh is at the dip');
  assert.ok(Math.abs(rest.strength.thighLeft - ROWS.limbs.parts.leg.motor.thigh) < 1e-9, 'between dips it holds the row\'s sag');
  assert.ok(dip.strength.shinLeft <= dip.strength.thighLeft + 1e-9 || dip.strength.shinLeft < 0.3);
  assert.equal(dip.strength.thighRight, 1, 'the good leg is full while the bad one dips');
  assert.ok(planOf(ROWS, f, up - 0.0, -1).strength.thighRight <= 1);
  const antiphase = planOf(ROWS, f, g.periodS * (0.5 + g.dipFrac / 2), -1);
  assert.ok(antiphase.strength.thighRight < 1 && antiphase.strength.thighRight >= g.goodDipTo - 1e-9, 'the good leg takes the weight half a stride later');
  assert.ok(dip.share.thighLeft > 0.5 && !('thighRight' in dip.share && dip.share.thighRight > 0), 'the bones follow the ragdoll on the bad leg only');
  for (const id of Object.keys(dip.strength)) assert.ok(/Left$|Right$/.test(id) && /thigh|shin|foot|toe/.test(id), `${id} is a leg part`);
  for (const v of [...Object.values(dip.strength), ...Object.values(dip.share)]) assert.ok(Number.isFinite(v) && v >= 0 && v <= 1);
  for (const v of Object.values(dip.strength)) assert.ok(v >= 0.01, 'never below the package\'s limp floor');
});

test('the pelvis: sunk and rolled toward the bad leg, more on each dip, more again under a stumble, nothing for a whole man', () => {
  const g = ROWS.limbs.parts.leg.gait, st = ROWS.limbs.parts.leg.stumble, f = whole({ leg_right: 0 });
  assert.equal(planOf(ROWS, whole(), 0.3, -1).hips, null);
  const rest = planOf(ROWS, f, g.periodS * 0.9, -1).hips, dip = planOf(ROWS, f, g.periodS * g.dipFrac / 2, -1).hips, stumble = planOf(ROWS, f, g.periodS * 0.9, st.inS + 0.1).hips;
  assert.equal(rest.side, 'right');
  assert.ok(Math.abs(rest.drop - g.hipsBaseFrac * g.hipsDropM) < 1e-9 && Math.abs(rest.tilt - g.hipsBaseFrac * g.hipsTiltRad) < 1e-9, 'between dips the held share');
  assert.ok(Math.abs(dip.drop - g.hipsDropM) < 1e-9 && Math.abs(dip.tilt - g.hipsTiltRad) < 1e-9, 'on the dip all of it');
  assert.ok(stumble.drop > rest.drop + st.hipsDropM * 0.99 && stumble.tilt > rest.tilt);
  assert.ok(planOf(ROWS, whole({ leg_right: 0.25 }), g.periodS * g.dipFrac / 2, -1).hips.drop < dip.drop, 'half hurt, half the sink');
  assert.equal(planOf(ROWS, whole({ arm_right: 0 }), 0, -1).hips, null, 'an arm does not sink the pelvis');
});

test('the effect grows with the damage: half-way hurt is half the sag', () => {
  const half = planOf(ROWS, whole({ leg_left: 0.25 }), 0.7, -1), full = planOf(ROWS, whole({ leg_left: 0 }), 0.7, -1);
  assert.ok(half.strength.thighLeft > full.strength.thighLeft && half.strength.thighLeft < 1);
  assert.ok(half.share.thighLeft < full.share.thighLeft);
  assert.deepEqual(planOf(ROWS, whole({ leg_left: 0.9 }), 0.7, -1).strength, {}, 'a scratch changes nothing');
});

test('a stumble: only a heavy blow, only with the leg hurt to the row\'s level, never twice inside the cooldown; both legs give, then recover', () => {
  const st = ROWS.limbs.parts.leg.stumble, f = whole({ leg_left: 0 }), ok = whole({ leg_left: 0.9 });
  assert.equal(stumbles(ROWS, f, true, 99), true);
  assert.equal(stumbles(ROWS, f, false, 99), false, 'a light blow limps, it does not stumble');
  assert.equal(stumbles(ROWS, ok, true, 99), false, 'a whole leg does not stumble');
  assert.equal(stumbles(ROWS, f, true, st.cooldownS - 0.01), false);
  assert.equal(stumbles(ROWS, f, true, st.cooldownS), true);
  assert.equal(stumbleDepth(st, -1), 0); assert.equal(stumbleDepth(st, st.inS + st.holdS / 2), 1); assert.equal(stumbleDepth(st, st.inS + st.holdS + st.upS), 0);
  const mid = planOf(ROWS, f, 0.7, st.inS + 0.1);
  assert.ok(mid.strength.thighRight <= st.dipTo + 1e-9 && mid.strength.thighLeft <= st.dipTo + 1e-9, 'both legs give');
  assert.ok(mid.share.thighRight >= st.blend - 1e-9);
  assert.equal(heavyHit({ move: 'heavy_overhead' }), true); assert.equal(heavyHit({ move: 'light_right', charged: true }), true); assert.equal(heavyHit({ move: 'light_right' }), false);
});

test('the sword arm at 0 hangs (motors and bones), the off arm, the torso and the head have their own rows', () => {
  const sword = planOf(ROWS, whole({ arm_right: 0 }), 0, -1);
  assert.deepEqual(Object.keys(sword.strength).sort(), ['armRight', 'forearmRight', 'handRight']);
  assert.ok(sword.strength.armRight <= 0.25 + 1e-9 && sword.share.armRight >= 0.79);
  const off = planOf(ROWS, whole({ arm_left: 0 }), 0, -1);
  assert.deepEqual(Object.keys(off.strength).sort(), ['armLeft', 'forearmLeft', 'handLeft']);
  assert.ok(Object.keys(planOf(ROWS, whole({ torso: 0 }), 0, -1).strength).every((k) => /^spine/.test(k)));
  assert.deepEqual(Object.keys(planOf(ROWS, whole({ head: 0 }), 0, -1).strength).sort(), ['head', 'neck']);
});

test('the dropped weapon falls under gravity, bounces, loses speed and lies where it lands', () => {
  const d = ROWS.limbs.parts.arm_sword.drop;
  let s = { p: [0, 1.2, 0], v: [d.velocity[0], d.velocity[1], d.velocity[2]], floor: 0, bounces: 0, landedFor: 0, landed: false }, ys = [];
  for (let i = 0; i < 600 && !s.landed; i++) { stepFall(d, s, 1 / 60); ys.push(s.p[1]); assert.ok(s.p[1] >= d.restHeightM - 1e-9, 'never through the floor'); }
  assert.equal(s.landed, true); assert.ok(s.bounces >= 1 && s.bounces <= d.bounces); assert.deepEqual(s.v, [0, 0, 0]);
  assert.ok(s.p[2] > 0 && s.p[0] > 0, 'it flew forward and out');
  const at = [...s.p]; stepFall(d, s, 1); assert.deepEqual(s.p, at, 'and stays'); assert.ok(s.landedFor >= 1);
});

test('flatQuaternion lays a tilted long weapon flat, keeping its heading', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.2, 0.05)), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.5);
  mesh.quaternion.copy(q); mesh.updateMatrixWorld(true);
  const flat = flatQuaternion(mesh, q), along = new THREE.Vector3(0, 1, 0).applyQuaternion(flat);
  assert.ok(Math.abs(along.y) < 0.15, `the blade is horizontal (y ${along.y.toFixed(3)})`);
});

// ---- the live part: a fake ragdoll, the events and the weapon ---------------------------------------------------------------------------------------
function rig(limbs, rows = ROWS) {
  const scene = new THREE.Scene(), group = new THREE.Group(), weapon = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.2, 0.05)), events = [], motors = [], blends = [], hipsCalls = [];
  weapon.name = 'WeaponDrawn'; group.add(weapon); scene.add(group); group.position.set(2, 0, 3);
  const state = { alive: true }, fractions = { ...limbs };
  const env = {
    fighter: () => fighterOf(fractions, 'right'), active: () => state.alive, rd: () => ({ setMotorStrength: (r) => motors.push(r) }), blend: (s) => blends.push(s), hips: (h) => hipsCalls.push(h),
    weapon: () => weapon, group: () => group, emit: (n, p) => events.push([n, p]),
  };
  return { scene, group, weapon, events, motors, blends, hipsCalls, fractions, state, limbs: createLimbs(rows, env) };
}

test('a leg walking down to 0 says feel:limp at each step; every frame sets the motors and asks for the bone blend', () => {
  const r = rig({ leg_left: 1 });
  r.limbs.frame(1 / 60); assert.equal(r.events.length, 0); assert.equal(r.blends.length, 0, 'whole: no bone work'); assert.equal(r.motors.length, 0, 'whole: no motor call'); assert.equal(r.hipsCalls.length, 0);
  r.fractions.leg_left = 0.3; r.limbs.frame(1 / 60);
  r.fractions.leg_left = 0.1; r.limbs.frame(1 / 60);
  r.fractions.leg_left = 0; r.limbs.frame(1 / 60); r.limbs.frame(1 / 60);
  const limps = r.events.filter(([n]) => n === 'feel:limp');
  assert.ok(limps.length >= 2 && limps.every(([, p]) => p.part === 'leg_left'), JSON.stringify(r.events));
  assert.equal(limps.at(-1)[1].level, 1);
  assert.deepEqual(limps.map(([, p]) => p.level), [...limps.map(([, p]) => p.level)].sort((a, b) => a - b), 'the level only goes up');
  assert.equal(r.events.filter(([n]) => n === 'feel:guard_drop').length, 0);
  assert.ok(r.motors.every((m) => !('all' in m)), 'never every part: clash\'s and hitreact\'s dips are not undone each frame');
  assert.ok(r.motors.at(-1).thighLeft < 0.31);
  assert.equal(r.hipsCalls.at(-1).side, 'left'); assert.ok(r.hipsCalls.at(-1).drop > 0);
});

test('the sword arm at 0: feel:guard_drop once, then the weapon leaves the hand (feel:weapon_drop once), falls and lies; a reset puts it back', () => {
  const r = rig({ arm_right: 0 });
  r.limbs.frame(1 / 60);
  assert.deepEqual(r.events.map(([n, p]) => [n, p.side]), [['feel:guard_drop', 'right']]);
  assert.equal(r.weapon.visible, true, 'not yet: the arm hangs first');
  for (let i = 0; i < 60; i++) r.limbs.frame(1 / 60);
  assert.equal(r.limbs.dropped, true); assert.equal(r.weapon.visible, false, 'out of his hand');
  assert.equal(r.events.filter(([n]) => n === 'feel:weapon_drop').length, 1); assert.equal(r.events.filter(([n]) => n === 'feel:guard_drop').length, 1);
  const lying = r.scene.children.find((o) => o !== r.group);
  assert.ok(lying, 'a copy is in the scene');
  for (let i = 0; i < 180; i++) r.limbs.frame(1 / 60);
  const at = lying.position.clone();
  r.group.position.set(10, 0, 10);   // he walks on
  for (let i = 0; i < 30; i++) r.limbs.frame(1 / 60);
  assert.ok(lying.position.distanceTo(at) < 1e-9, 'it stays where it fell');
  assert.ok(lying.position.y < 0.1 && lying.position.y >= 0, 'on the floor');
  r.fractions.arm_right = 1; r.limbs.frame(1 / 60);
  assert.equal(r.limbs.dropped, false); assert.equal(r.weapon.visible, true); assert.equal(lying.parent, null);
});

test('not alive (down, dead): the motors and the bones are left to the ragdoll', () => {
  const r = rig({ leg_left: 0 });
  r.state.alive = false; r.limbs.frame(1 / 60);
  assert.equal(r.motors.length, 0); assert.equal(r.blends.length, 0); assert.equal(r.hipsCalls.length, 0);
});

test('whole again: the parts it dipped go back to 1 once, then nothing is called; never `all`', () => {
  const r = rig({ leg_left: 0 });
  r.limbs.frame(1 / 60);
  const dipped = Object.keys(r.motors.at(-1)); assert.ok(dipped.length > 0);
  r.fractions.leg_left = 1; r.limbs.frame(1 / 60);
  for (const p of dipped) assert.equal(r.motors.at(-1)[p], 1, `${p} back to 1`);
  const n = r.motors.length, b = r.blends.length;
  r.limbs.frame(1 / 60); r.limbs.frame(1 / 60);
  assert.equal(r.motors.length, n); assert.equal(r.blends.length, b);
  assert.ok(r.motors.every((m) => !('all' in m)));
});

test('rows off (`on: false`) is today\'s fight: no motor, bone or pelvis call, no event, the weapon stays', () => {
  const r = rig({ leg_left: 0, arm_right: 0 }, { ...ROWS, on: false });
  for (let i = 0; i < 120; i++) r.limbs.frame(1 / 60);
  r.limbs.hit({ charged: true }); r.limbs.settle(1 / 60);
  assert.equal(r.motors.length + r.blends.length + r.hipsCalls.length + r.events.length, 0); assert.equal(r.weapon.visible, true); assert.equal(r.limbs.cost.stumbles, 0);
});

test('a heavy blow on the bad leg starts a stumble, and a frame of dt 0 right after it (a hit-stop) does not end it', () => {
  const r = rig({ leg_left: 0 });
  r.limbs.frame(1 / 60);
  r.limbs.hit({ charged: true });
  assert.equal(r.limbs.cost.stumbles, 1);
  r.limbs.frame(0);
  r.limbs.frame(ROWS.limbs.parts.leg.stumble.inS);
  assert.ok(r.motors.at(-1).thighRight < 0.5, 'the good leg gives too (the gait alone never takes it below goodDipTo): the stumble is on');
});

test('a leg that is whole again (a renewal) announces its next injury', () => {
  const r = rig({ leg_left: 1 });
  r.fractions.leg_left = 0; r.limbs.frame(1 / 60);
  const first = r.events.filter(([n]) => n === 'feel:limp').length; assert.ok(first >= 1);
  r.fractions.leg_left = 1; r.limbs.frame(1 / 60);
  r.fractions.leg_left = 0; r.limbs.frame(1 / 60);
  assert.ok(r.events.filter(([n]) => n === 'feel:limp').length > first, 'limp again');
});

test('he dies with the weapon in the air: settle() lets it land and lie, and emits nothing', () => {
  const r = rig({ arm_right: 0 });
  for (let i = 0; i < 20; i++) r.limbs.frame(1 / 60);   // past drop.afterS: the weapon is in the air
  assert.equal(r.limbs.dropped, true);
  const lying = r.scene.children.find((o) => o !== r.group);
  r.state.alive = false; const n = r.events.length;
  for (let i = 0; i < 300; i++) r.limbs.settle(1 / 60);
  assert.ok(lying.position.y >= 0 && lying.position.y < 0.1, 'on the floor'); assert.equal(r.events.length, n);
  const at = lying.position.clone(); r.limbs.settle(1 / 60); assert.ok(lying.position.distanceTo(at) < 1e-9, 'and still');
});

test('the rows tie `sided` to the part: legs and arms are sided, head and torso are not', () => {
  const bad = (f) => { const c = structuredClone(ROWS); f(c); return validateFile('feel-limbs', c); };
  assert.ok(bad((c) => { c.limbs.parts.leg.sided = false; }).some((e) => e.includes('leg.sided')));
  assert.ok(bad((c) => { c.limbs.parts.torso.sided = true; }).some((e) => e.includes('torso.sided')));
});

test('the evaluator\'s setPartHp hook (the stills): a sword arm at 0 is the dropped weapon, a leg at 0 the limp, as a landed blow would leave them', () => {
  const ev = createEvaluator(loadRules()), body = read('../node_modules/@frankendom/physics/data/bodies/minotaur-106.measure.json');
  const st = createFighterState(ev.rules, body, { sword_side: 'right', leg_hp: 60, hp_scale: 190 / 150, budgets: RULES.budgets });
  assert.equal(setPartHp(st, 'arm_right', 0, 0.5), true);
  assert.equal(st.weapon_dropped, true); assert.equal(st.outgoing_damage_mult, 0.5); assert.equal(st.parts.arm_right.gone, true);
  assert.equal(st.limp, false); setPartHp(st, 'leg_left', 0); assert.equal(st.limp, true);
  setPartHp(st, 'torso', 10); assert.equal(st.parts.torso.hp, 10); assert.equal(st.parts.torso.gone, false);
  assert.equal(setPartHp(st, 'nope', 0), false); assert.equal(setPartHp(st, 'head', NaN), false);
  assert.equal(hurtParts(ROWS, { sword_side: 'right', parts: st.parts }).some((h) => h.key === 'arm_sword' && h.level === 1), true, 'the evaluator\'s own state feeds the plan');
});

test('the sim-facing numbers are rows with names the sim can read, and nothing in the module reaches the sim', () => {
  for (const [key, row] of Object.entries(ROWS.limbs.parts)) assert.ok(Object.keys(row.sim).length > 0, `${key} has sim numbers`);
  assert.equal(ROWS.limbs.parts.leg.sim.speedMult < 1, true); assert.equal(ROWS.limbs.parts.arm_sword.sim.guardArcMult, 0);
  assert.deepEqual(Object.values(ROWS.events), ['feel:limp', 'feel:guard_drop', 'feel:weapon_drop']);
  const src = readFileSync(new URL('../src/fight/feel-limbs.ts', import.meta.url), 'utf8');
  assert.ok(!/from '\.\/duel\.ts'/.test(src.replace(/import type[^\n]*duel\.ts'/g, '')), 'duel.ts is imported as a type only');
});
