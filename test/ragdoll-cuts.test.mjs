// The Minotaur's cuts (data/physics.json `cut`, src/fight/ragdoll.ts + cut-pieces.ts, @frankendom/physics f38dba0 'Cuts (M5)'). Presentation only: these pin the rows
// against the package's six severable units and gear slots, the cut event, the corpse tap's bone -> unit rule, the package's cut on a frozen corpse (the piece wakes,
// the rest sleeps), and the skinned-body split (a piece takes its triangles, the body keeps the rest, restore() puts it back).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createPhysics } from '@frankendom/physics';
import { blowImpulse, cutEvent, unitOfBone } from '../src/fight/ragdoll.ts';
import { createPieceCutter, isUnder } from '../src/fight/cut-pieces.ts';
import { validateFile } from '../src/sim/validate.js';

const ROWS = JSON.parse(readFileSync(new URL('../data/physics.json', import.meta.url), 'utf8'));
const measure = (row, rig = '106') => JSON.parse(readFileSync(new URL(`../node_modules/@frankendom/physics/data/bodies/${row.measure[rig].split('/').pop()}`, import.meta.url), 'utf8'));
const standing = async () => {
  const physics = await createPhysics({ seed: ROWS.seed, states: ROWS.states }), row = ROWS.opponents[0];
  const rd = physics.createRagdoll(measure(row), { id: row.id, motorTuning: ROWS.motorTuning, solveHinges: ROWS.solveHinges });
  for (let i = 0; i < 30; i++) physics.step(1 / ROWS.tickHz);
  return { physics, rd, row };
};
const frozen = async () => {
  const s = await standing();
  s.rd.kill(blowImpulse(ROWS.kill, 'torso', 0, 0));
  for (let i = 0; i < ROWS.tickHz * 8 && s.rd.state !== 'frozen'; i++) s.physics.step(1 / ROWS.tickHz);
  assert.equal(s.rd.state, 'frozen');
  return s;
};

test('the cut rows name the package\'s units, parts and gear slots, and the validator accepts them', async () => {
  const { physics, rd, row } = await standing(), C = ROWS.cut, units = rd.row.severable.map((s) => s.id), slots = new Set(rd.row.severable.flatMap((s) => s.gear_slots));
  assert.deepEqual([...units].sort(), [...C.tap.order].sort(), 'the tap order lists each of the six units once');
  for (const [location, unit] of Object.entries(C.onKill)) { assert.ok(['head', 'torso', 'legs'].includes(location), `${location} is a sim hit location`); assert.ok(units.includes(unit), `onKill.${location} = ${unit} is a unit`); }
  assert.ok(C.kill.impulse > 0 && C.kill.lift >= 0);
  assert.ok(units.includes(C.sever));
  assert.equal(typeof row.helmet, 'boolean');
  for (const [slot, ids] of Object.entries(row.gear)) { assert.ok(slots.has(slot), `gear slot ${slot} is one of the package's: ${[...slots]}`); assert.ok(Array.isArray(ids)); }
  assert.equal(row.helmet, false, 'the Minotaur wears no helmet (no armour until beta)');
  for (const k of ['piece', 'bodyKeepBelow']) assert.ok(C.seam[k] > 0 && C.seam[k] <= 1);
  assert.ok(C.settleS > 0 && C.tap.maxMovePx > 0 && C.tap.maxMs > 0 && C.tap.needs === 'frozen');
  assert.deepEqual(validateFile('physics', ROWS), []);
  physics.destroy();
});

test('the package cuts a frozen corpse: the piece wakes and moves, the rest stays asleep, and the cut says what went with it', async () => {
  const { physics, rd } = await frozen(), pose = () => Float32Array.from(rd.readPose()), at = (p, id) => p.subarray(rd.partIds.indexOf(id) * 10, rd.partIds.indexOf(id) * 10 + 3);
  const before = pose(), r = rd.cut('arm_left', { impulse: [0, 3, 6] });
  assert.equal(r.unit, 'arm_left');
  assert.deepEqual(r.carries_roles, ['armLeft', 'forearmLeft', 'handLeft']);
  assert.deepEqual(r.gear_slots, ['arms', 'hands']);
  assert.equal(r.cap.part, 'armLeft');
  assert.equal(r.cap.position.length, 3);
  assert.deepEqual(r.props, [], 'no helmet prop without helmet: true');
  assert.equal(rd.state, 'frozen', 'the corpse is still frozen');
  for (let i = 0; i < ROWS.tickHz * ROWS.cut.settleS; i++) physics.step(1 / ROWS.tickHz);
  const after = pose(), moved = (id) => Math.hypot(...[0, 1, 2].map((k) => at(after, id)[k] - at(before, id)[k]));
  assert.ok(moved('handLeft') > 0.3, `the hand moved ${moved('handLeft').toFixed(2)} m`);
  for (const id of ['head', 'spine2', 'thighRight', 'armRight']) assert.ok(moved(id) < 0.01, `${id} stayed asleep (${moved(id).toFixed(4)} m)`);
  assert.equal(rd.cut('arm_left'), null, 'a unit already cut is gone');
  physics.destroy();
});

test('a head cut carries the helmet prop only when asked, and a rematch (reset) refuses after a cut so the page builds a new ragdoll', async () => {
  const { physics, rd } = await frozen();
  const r = rd.cut('head', { helmet: true, impulse: [0, 2, 4] });
  assert.equal(r.props.length, 1);
  assert.equal(r.props[0].readPose().length, 10);
  assert.equal(r.cap.part, 'head');
  assert.equal(rd.row.roles.find((x) => x.id === 'head').parent, 'neck', 'the stump cap follows the neck');
  assert.equal(rd.reset(), false);
  r.props[0].destroy();
  physics.destroy();
});

test('the cut event lists the ids on the slots that went with the piece (none for a foe in no gear)', () => {
  const result = { unit: 'arm_left', gear_slots: ['arms', 'hands'] };
  assert.deepEqual(cutEvent({ gear: {} }, result, 'tap'), { type: 'cut', unit: 'arm_left', gear: [], source: 'tap' });
  assert.deepEqual(cutEvent({ gear: { arms: ['vambrace'], hands: ['gauntlet', 'ring'], head: ['helm'] } }, result, 'tap').gear, ['vambrace', 'gauntlet', 'ring']);
  assert.deepEqual(cutEvent(ROWS.opponents[0], { unit: 'head', gear_slots: ['head'] }, 'kill'), { type: 'cut', unit: 'head', gear: [], source: 'kill' });
});

// a rig as a strip: hips > spine > (arm, head), the tap's bones
const rig = () => {
  const mk = (name, parent, y) => { const b = new THREE.Bone(); b.name = name; b.position.set(0, y, 0); parent?.add(b); return b; };
  const hips = mk('hips', null, 0), spine = mk('spine', hips, 1), arm = mk('arm', spine, 1), hand = mk('hand', arm, 1), head = mk('head', spine, 1);
  return { hips, spine, arm, hand, head, bones: [hips, spine, arm, hand, head] };
};

test('the corpse tap picks the first unit whose cut bone the struck bone hangs under, and nothing for the pelvis', () => {
  const r = rig(), roots = { head: r.head, arm_left: r.arm, torso_waist: r.spine }, order = ['head', 'arm_left', 'torso_waist'], of = (u) => roots[u];
  assert.equal(unitOfBone(r.head, order, of), 'head');
  assert.equal(unitOfBone(r.hand, order, of), 'arm_left');
  assert.equal(unitOfBone(r.spine, order, of), 'torso_waist');
  assert.equal(unitOfBone(r.hips, order, of), null);
  assert.ok(isUnder(r.hand, r.arm) && !isUnder(r.head, r.arm));
});

// four rings of two vertices up the rig's arm: weights on the arm's bone 0, 0, 1, 1 (the third ring is the cut's far side)
const strip = () => {
  const r = rig(), bones = [r.hips, r.spine, r.arm, r.hand];
  const geometry = new THREE.BufferGeometry(), positions = [], skinIndex = [], skinWeight = [];
  for (let ring = 0; ring < 4; ring++) for (const x of [-0.5, 0.5]) { positions.push(x, ring, 0); skinIndex.push(ring >= 2 ? 2 : 1, 0, 0, 0); skinWeight.push(1, 0, 0, 0); }
  const index = [];
  for (let ring = 0; ring < 3; ring++) { const a = ring * 2, c = a + 2; index.push(a, a + 1, c, a + 1, c + 1, c); }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  geometry.setIndex(index);
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), anchor = new THREE.Group();
  anchor.add(r.hips, mesh); anchor.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  return { ...r, mesh, anchor, geometry };
};

test('a cut splits the skinned body: the piece takes the triangles the cut bone holds, the body keeps the rest, the seam belongs to neither; restore() puts it back', () => {
  const s = strip(), cutter = createPieceCutter(s.anchor), triangles = (g) => (g.drawRange.count === Infinity ? g.index.count : g.drawRange.count) / 3;
  assert.equal(triangles(s.geometry), 6);
  const made = cutter.carve(s.arm, { piece: 0.5, bodyKeepBelow: 0.5 });
  assert.equal(made.length, 1);
  assert.equal(triangles(made[0].geometry), 3, 'the far ring pair and the seam triangle the arm holds most of');
  assert.equal(triangles(s.mesh.geometry), 2, 'the near ring pair stays on the body; the seam triangle with one arm vertex of three is on neither (6 = 3 + 2 + 1)');
  assert.notEqual(s.mesh.geometry, s.geometry, 'the body draws its filtered twin');
  assert.equal(made[0].skeleton, s.mesh.skeleton, 'the piece follows the same bones');
  assert.equal(made[0].parent, s.mesh.parent);
  assert.equal(cutter.carve(s.arm, { piece: 0.5, bodyKeepBelow: 0.5 }).length, 0, 'a second cut of the same bone has nothing left to take');
  cutter.restore();
  assert.equal(s.mesh.geometry, s.geometry);
  assert.equal(triangles(s.geometry), 6);
  assert.equal(made[0].parent, null);
  assert.equal(cutter.pieces.length, 0);
});

test('a ray through the piece strikes the piece\'s bone; one through the body strikes the body\'s', () => {
  const s = strip(), cutter = createPieceCutter(s.anchor);
  cutter.carve(s.arm, { piece: 0.5, bodyKeepBelow: 0.5 });
  const ray = (y) => { const r = new THREE.Raycaster(new THREE.Vector3(0.1, y, 5), new THREE.Vector3(0, 0, -1)); return cutter.pick(r); };
  assert.equal(ray(2.6)?.bone, s.arm, 'the arm piece');
  assert.equal(ray(0.5)?.bone, s.spine, 'the body');
  assert.equal(ray(9), null, 'a miss');
});
