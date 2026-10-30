// Hands and feet are severable (Dom 2026-10-30, six parts: head, body, arms, legs, feet, hands; docs/six-parts-plan.md step 2): the cut rows, the ?hands=1 flag (data/physics.json cut.hands,
// DEFAULT OFF), the thirteen bodies' hf cut files (Physics tools/cut-batch.mjs --hands-feet, pin 31e1ac9), the package's order rule (a unit carries what is still attached) and Sir Reginald's
// lost limb taking its hand or foot with it. Presentation only; the off path is the six old units, the same objects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPhysics } from '@frankendom/physics';
import { cutRowsFor, handsOn, hintUnitsFor, HANDS } from '../src/fight/hands-flag.ts';
import { PICKUP, pickupRowsFor } from '../src/fight/pickup.ts';
import { blowImpulse, unitOfBone } from '../src/fight/ragdoll.ts';
import { nextUnit } from '../src/fight/cut-strike.ts';
import { applyLimbs, hungUnits, limbManifestProblems, lostUnits, ROW } from '../src/fight/mechanics/reginald-limb-loss.ts';
import { VISUAL_UNITS } from '../src/fight/finisher-cuts.ts';
import { unpackMeshopt } from '../scripts/cut-glb-pack.mjs';
import { validateFile } from '../src/sim/validate.js';

const url = (p) => new URL(p, import.meta.url);
const json = (p) => JSON.parse(readFileSync(url(p), 'utf8'));
const ROWS = json('../data/physics.json'), C = ROWS.cut, PARTS = json('../data/parts.json'), RIG = json('../data/rig.json');
const NEW = ['hand_left', 'hand_right', 'foot_left', 'foot_right'], SIX = ['head', 'arm_left', 'arm_right', 'leg_left', 'leg_right', 'torso_waist'];
const clone = (x) => JSON.parse(JSON.stringify(x));
const measure = (row) => json(`../node_modules/@frankendom/physics/data/bodies/${row.measure['106'].split('/').pop()}`);
const frozen = async () => {
  const physics = await createPhysics({ seed: ROWS.seed, states: ROWS.states }), row = ROWS.opponents[0];
  const rd = physics.createRagdoll(measure(row), { id: row.id, motorTuning: ROWS.motorTuning, solveHinges: ROWS.solveHinges });
  for (let i = 0; i < 30; i++) physics.step(1 / ROWS.tickHz);
  rd.kill(blowImpulse(ROWS.kill, 'torso', 0, 0));
  for (let i = 0; i < ROWS.tickHz * 8 && rd.state !== 'frozen'; i++) physics.step(1 / ROWS.tickHz);
  assert.equal(rd.state, 'frozen');
  return { physics, rd };
};

test('the rows: cut.units is the package\'s severable list, cut.hands is OFF by default and lists the ten units hands and feet first, and the validator accepts them', async () => {
  const physics = await createPhysics({ seed: ROWS.seed, states: ROWS.states }), rd = physics.createRagdoll(measure(ROWS.opponents[0]), { id: 'x', motorTuning: ROWS.motorTuning, solveHinges: ROWS.solveHinges });
  const real = rd.row.severable.filter((s) => !s.visual_only).map((s) => s.id), visual = rd.row.severable.filter((s) => s.visual_only).map((s) => s.id);
  assert.deepEqual([...C.units.real].sort(), [...real].sort(), 'cut.units.real = the package\'s detaching units (src/sim/validate.js reads them, nothing re-states the names)');
  assert.deepEqual([...C.units.visual].sort(), [...visual].sort());
  assert.deepEqual([...VISUAL_UNITS].sort(), [...C.units.visual].sort());
  assert.equal(C.hands.on, false, 'Dom 2026-10-30: player-visible, so DEFAULT OFF');
  assert.deepEqual([C.hands.query, C.hands.value], ['hands', '1']);
  assert.deepEqual(C.hands.units, NEW);
  assert.deepEqual(C.hands.order, ['head', 'hand_left', 'hand_right', 'foot_left', 'foot_right', 'arm_left', 'arm_right', 'leg_left', 'leg_right', 'torso_waist']);
  assert.deepEqual(C.tap.order, SIX, 'the base rows are the six old units, untouched');
  assert.deepEqual(C.cue.units, SIX); assert.deepEqual(PICKUP.units, SIX);
  assert.deepEqual(validateFile('physics', ROWS), []);
  for (const bad of [(r) => { r.cut.hands.order.pop(); }, (r) => { r.cut.hands.units.push('tail'); }, (r) => { delete r.cut.hands.labels.foot_left; }, (r) => { r.cut.hands.on = 'no'; }, (r) => { r.cut.units.real.push('head_split'); }, (r) => { delete r.cut.units; }]) {
    const r = clone(ROWS); bad(r);
    assert.ok(validateFile('physics', r).length > 0, 'a bad cut.hands / cut.units row is named');
  }
  physics.destroy();
});

test('the flag: off, every list is the same object as today\'s; ?hands=1 (or on) makes the tap, the strike, the cue and the hint count the ten units', () => {
  assert.equal(handsOn('') , false); assert.equal(handsOn('?hands=0'), false); assert.equal(handsOn('?hands=1'), true); assert.equal(handsOn('?x=1&hands=1'), true);
  assert.equal(handsOn('', { ...HANDS, on: true }), true, 'on true = everyone (the rollback is on false)');
  assert.equal(cutRowsFor(C, ''), C, 'off: the very same cut row');
  assert.equal(cutRowsFor(C, '?hands=0'), C);
  assert.equal(cutRowsFor({ tap: C.tap }, '?hands=1').tap, C.tap, 'a row without a hands block is left alone');
  const on = cutRowsFor(C, '?hands=1');
  assert.deepEqual(on.tap.order, C.hands.order); assert.deepEqual(on.cue.units, C.hands.order);
  assert.deepEqual(NEW.map((u) => on.cue.labels[u]), ['hand', 'hand', 'foot', 'foot']); assert.equal(on.cue.labels.head, C.cue.labels.head);
  assert.deepEqual({ ...on, tap: 0, cue: 0 }, { ...C, tap: 0, cue: 0 }, 'nothing else of the row changes');
  assert.deepEqual(C.tap.order, SIX, 'and the shipped row itself is not touched');
  assert.equal(hintUnitsFor(PICKUP.units, ''), PICKUP.units); assert.deepEqual(hintUnitsFor(PICKUP.units, '?hands=1'), C.hands.order);
  assert.equal(pickupRowsFor(''), PICKUP, 'off: the hint\'s row is PICKUP itself'); assert.equal(pickupRowsFor('?hands=1').units.length, 10); assert.equal(pickupRowsFor('?hands=1').delayS, PICKUP.delayS);
  assert.ok(NEW.every((u) => C.units.real.includes(u)) && C.hands.order.every((u) => C.units.real.includes(u)));
});

test('the tap order: a hand or foot comes off before the limb it hangs from, and the strike walks the ten in order', () => {
  const o = C.hands.order, at = (u) => o.indexOf(u);
  for (const [piece, limb] of [['hand_left', 'arm_left'], ['hand_right', 'arm_right'], ['foot_left', 'leg_left'], ['foot_right', 'leg_right']]) assert.ok(at(piece) < at(limb), `${piece} before ${limb}`);
  const done = new Set(), seq = [];
  for (let u = nextUnit(o, done); u; u = nextUnit(o, done)) { seq.push(u); done.add(u); }
  assert.deepEqual(seq, o);
  // a tap on a finger or a toe is under the hand or the foot bone, which hangs under the forearm or shin: the first unit of the order that holds the bone wins
  const mk = (parent) => ({ parent }), root = mk(null), arm = mk(root), hand = mk(arm), finger = mk(hand), leg = mk(root), foot = mk(leg), toe = mk(foot);
  const of = { hand_left: hand, arm_left: arm, foot_left: foot, leg_left: leg };
  assert.equal(unitOfBone(finger, o, (u) => of[u]), 'hand_left'); assert.equal(unitOfBone(toe, o, (u) => of[u]), 'foot_left');
  assert.equal(unitOfBone(arm, o, (u) => of[u]), 'arm_left'); assert.equal(unitOfBone(leg, o, (u) => of[u]), 'leg_left');
  assert.equal(unitOfBone(finger, SIX, (u) => of[u]), 'arm_left', 'off: a finger is the arm\'s, as before');
});

test('the package\'s order rule on a frozen corpse: a unit carries what is still attached (hand then arm, arm then hand, foot then leg, leg then foot)', async () => {
  const { physics, rd } = await frozen();
  const hand = rd.cut('hand_left', { impulse: [0, 3, 6] }), arm = rd.cut('arm_left', { impulse: [0, 3, 6] });
  assert.ok(hand && arm);
  assert.deepEqual(hand.gear_slots, ['hands']); assert.ok(!arm.carries_roles.includes('handLeft') && !arm.gear_slots.includes('hands'), 'the arm cut after the hand carries no hand');
  const foot = rd.cut('foot_right', { impulse: [0, 3, 6] }), leg = rd.cut('leg_right', { impulse: [0, 3, 6] });
  assert.ok(foot && leg && !leg.carries_roles.includes('footRight') && !leg.carries_roles.includes('toeRight'));
  assert.equal(rd.cut('hand_left'), null, 'a unit already cut is null'); assert.equal(rd.cut('foot_right'), null);
  // the other order: the arm first takes the hand with it; the hand is then the flying arm's to lose
  const arm2 = rd.cut('arm_right'), hand2 = rd.cut('hand_right');
  assert.ok(arm2.carries_roles.includes('handRight') && arm2.gear_slots.includes('hands'), 'arm first: it carries the hand');
  assert.ok(hand2 === null || hand2.unit === 'hand_right', 'the hand cut off the flying arm is allowed');
  for (let i = 0; i < 60; i++) physics.step(1 / ROWS.tickHz);
  physics.destroy();
});

test('every finisher row and every cut event unit is one of the package\'s units, and a unit list never names a hand or foot a finisher needs first', () => {
  for (const [id, row] of Object.entries(ROWS.finisherCuts.rows)) {
    for (const u of [row.unit, ...(row.also ?? []), row.fallback].filter(Boolean)) assert.ok([...C.units.real, ...C.units.visual].includes(u), `${id}: ${u}`);
    assert.ok(!NEW.includes(row.unit), `${id}: a finisher cuts a limb, head or waist (the hand it holds goes with the limb, ordered by the package)`);
  }
  for (const u of Object.values(C.onKill).concat(C.sever)) assert.ok(C.units.real.includes(u));
  for (const s of PARTS.slots) for (const u of s.units) assert.ok(C.units.real.includes(u), `${s.id}: ${u} is a cut unit`);
  for (const u of NEW) assert.ok(PARTS.slots.some((s) => s.units.includes(u)), `${u} has a parts slot (collection is the corpse:cut payload's unit -> slotOfUnit, no code change)`);
});

const parse = async (raw) => { const n = raw.readUInt32LE(12); return unpackMeshopt(JSON.parse(raw.subarray(20, 20 + n)), raw.subarray(28 + n)); };
const STEMS = Object.values(RIG.files).filter((f) => f.endsWith('-106') && !/crowd/.test(f));
test('every body file is Physics\' hf cut: hand and foot pieces detached by their own unit, wrist and ankle caps shown with it, every mesh in the manifest and nothing else', async () => {
  assert.equal(STEMS.length, 13);
  for (const stem of STEMS) {
    const man = json(`../src/assets/${stem}.cut.manifest.json`), G = await parse(readFileSync(url(`../src/assets/${stem}.glb`)));
    assert.equal(man.schema, 'cut-pieces/1'); assert.equal(man.body, stem);
    for (const u of NEW) {
      assert.ok(man.regions.some((r) => r.id === u && r.mesh === `piece_${u}` && r.detached_by === u), `${stem}: region ${u}`);
      assert.ok(man.caps.some((c) => c.shown_when_cut === u && c.region === u), `${stem}: a cap on the ${u} piece`);
      assert.ok(man.caps.some((c) => c.shown_when_cut === u && c.region === (u.startsWith('hand') ? `arm_${u.split('_')[1]}` : `leg_${u.split('_')[1]}`)), `${stem}: a cap on the stump of ${u}`);
    }
    assert.deepEqual(G.d.meshes.map((m) => m.name).sort(), [...man.regions.map((r) => r.mesh), ...man.caps.map((c) => c.mesh)].sort(), `${stem}: the file holds exactly the manifest's meshes`);
    assert.equal(G.d.skins[0].joints.length, 106);
    for (const r of man.regions.filter((x) => x.detached_by)) assert.ok(man.caps.some((c) => c.shown_when_cut === r.detached_by), `${stem}: ${r.detached_by} shows something when cut`);
  }
});

test('The Boss\'s foot cut: shoe and trouser collar caps (accessory_feet) on both ankles, all in the file, all shown by the foot unit', async () => {
  const man = json('../src/assets/the-boss-106.cut.manifest.json'), G = await parse(readFileSync(url('../src/assets/the-boss-106.glb'))), meshes = new Set(G.d.meshes.map((m) => m.name));
  for (const side of ['left', 'right']) {
    const shown = man.caps.filter((c) => c.shown_when_cut === `foot_${side}`).map((c) => c.id).sort();
    assert.deepEqual(shown, [`cap_ankle_${side}_foot`, `cap_ankle_${side}_foot_${side}`, `cap_ankle_${side}_leg`, `cap_ankle_${side}_root`].sort(), `foot_${side}: the foot piece cap, the leg stump, and the shoe and trouser-collar caps`);
    for (const id of shown) assert.ok(meshes.has(id), `${id} is in the file`);
  }
  assert.ok(man.rigid_accessories.length >= 1, 'trousers and shoes are rigid accessories kept whole on piece_root, which is why the foot cut needs the accessory caps');
});

test('Sir Reginald: a lost arm or leg takes its hand or foot with it (hidden, not cuttable on the corpse); the row names regions and meshes of his hf manifest', () => {
  const man = json('../src/assets/castle-guard-106.cut.manifest.json');
  assert.deepEqual(limbManifestProblems(ROW, man), []);
  assert.deepEqual(ROW.limbs.map((l) => l.hangs?.[0]?.region), ['hand_right', 'foot_right']);
  assert.deepEqual(lostUnits(['limb:arm_right', 'limb:leg_right']), ['arm_right', 'leg_right'], 'lostUnits is unchanged');
  assert.deepEqual(hungUnits(['limb:arm_right', 'limb:leg_right']), ['hand_right', 'foot_right']); assert.deepEqual(hungUnits(undefined), []);
  const nodes = {}; for (const n of ['piece_arm_right', 'piece_hand_right', 'piece_leg_right', 'piece_foot_right', 'cap_shoulder_right_torso', 'cap_hip_right_root', 'cap_wrist_right_arm']) nodes[n] = { visible: n.startsWith('piece_') };
  const root = { getObjectByName: (n) => nodes[n] };
  applyLimbs(root, ['limb:arm_right', 'limb:leg_right']);
  assert.ok(!nodes.piece_hand_right.visible && !nodes.piece_foot_right.visible && !nodes.piece_arm_right.visible && nodes.cap_shoulder_right_torso.visible && !nodes.cap_wrist_right_arm.visible, 'the hand and foot pieces go with their limb; no wrist cap floats');
  applyLimbs(root, undefined);
  assert.ok(nodes.piece_hand_right.visible && nodes.piece_foot_right.visible, 'whole again: back');
  const bad = clone(ROW); bad.limbs[0].hangs[0].piece = 'piece_nothing';
  assert.match(limbManifestProblems(bad, man).join('|'), /hangs: manifest has no region hand_right/);
});

test('the page wiring (static): the ragdoll reads the flag row, the hint takes its rows from it, the build lists the files, and the pin is the current physics main', () => {
  const src = (p) => readFileSync(url(`../src/${p}`), 'utf8');
  assert.match(src('fight/ragdoll.ts'), /const cutRows: CutRows = cutRowsFor\(rows\.cut, search\)/);
  assert.match(src('fight/scene.ts'), /pickupRowsFor\(location\.search\)/);
  assert.match(src('fight/scene.ts'), /mech\.hungUnits\?\.\(phases\)/);
  assert.match(readFileSync(url('../package.json'), 'utf8'), /tar\.gz\/31e1ac93b2841f24130c3192086e43a89a7ab0ef/);
});
