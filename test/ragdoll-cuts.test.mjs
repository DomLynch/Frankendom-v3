// The Minotaur's cuts (data/physics.json `cut`, src/fight/ragdoll.ts + cut-pieces.ts, @frankendom/physics f38dba0 'Cuts (M5)'). Presentation only: these pin the rows
// against the package's six severable units and gear slots, the cut event, the corpse tap's bone -> unit rule, the package's cut on a frozen corpse (the piece wakes,
// the rest sleeps), and the skinned-body split (a piece takes its triangles, the body keeps the rest, restore() puts it back).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createPhysics } from '@frankendom/physics';
import { ageCorpses, blowImpulse, cutEvent, hideCutCaps, showPooled, snapshotRig, unitOfBone, WARM_SCALE } from '../src/fight/ragdoll.ts';
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

test('the cut rows name the package\'s units, parts and gear slots, and the validator accepts them (behaviour half; the source pins moved to test/source-pins/)', async () => {
  const { physics, rd, row } = await standing(), C = ROWS.cut, units = rd.row.severable.map((s) => s.id), slots = new Set(rd.row.severable.flatMap((s) => s.gear_slots));
  // M9a (physics 9056ef7): the package also lists two VISUAL-ONLY units (head_split, belly_open: no bone, no piece to tap or to put a button on). They are the finishers' (finisherCuts), never the tap's or the cue's.
  const visual = rd.row.severable.filter((s) => s.visual_only).map((s) => s.id), real = units.filter((u) => !visual.includes(u));
  assert.deepEqual(visual.sort(), ['belly_open', 'head_split']);
  // Physics 3bb5f80 (#102, deliberate): hands and feet are now severable units too. Re-pinned, not reverted: the tap order stays the six it lists today; wiring taps/cues to the four new units is a follow-up.
  const handsFeet = ['hand_left', 'hand_right', 'foot_left', 'foot_right'];
  assert.deepEqual(real.filter((u) => handsFeet.includes(u)).sort(), [...handsFeet].sort(), 'the package lists the four hand and foot units');
  assert.deepEqual(real.filter((u) => !handsFeet.includes(u)).sort(), [...C.tap.order].sort(), 'the tap order lists each of the six original real units once');
  assert.ok(!C.tap.order.some((u) => visual.includes(u)) && !C.cue.units.some((u) => visual.includes(u)), 'no tap or cue on a visual unit');
  for (const [location, unit] of Object.entries(C.onKill)) { assert.ok(['head', 'torso', 'legs'].includes(location), `${location} is a sim hit location`); assert.ok(units.includes(unit), `onKill.${location} = ${unit} is a unit`); }
  assert.ok(C.kill.impulse > 0 && C.kill.lift >= 0);
  assert.ok(units.includes(C.sever));
  assert.equal(typeof row.helmet, 'boolean');
  for (const [slot, ids] of Object.entries(row.gear)) { assert.ok(slots.has(slot), `gear slot ${slot} is one of the package's: ${[...slots]}`); assert.ok(Array.isArray(ids)); }
  assert.equal(row.helmet, false, 'the Minotaur wears no helmet (no armour until beta)');
  for (const k of ['piece', 'bodyKeepBelow']) assert.ok(C.seam[k] > 0 && C.seam[k] <= 1);
  assert.ok(C.tap.maxMovePx > 0 && C.tap.maxMs > 0 && C.tap.needs === 'frozen');
  // the cue (a "cut" button on each cuttable part of the frozen corpse): every unit it lists is one the tap can cut, and its numbers are real
  assert.ok(C.cue.on && C.cue.default === false && C.cue.query === 'cues' && C.cue.v1 === 'v1', 'Dom 2026-10-28: the cut buttons are hidden by default, ?cues=v1 brings them back');
  assert.ok(C.cue.units.length === C.tap.order.length && C.cue.units.every((u) => C.tap.order.includes(u)), 'the cue covers every tap unit, the head included');
  assert.ok(C.cue.units.every((u) => typeof C.cue.labels[u] === 'string' && C.cue.labels[u]) && /^#[0-9a-f]{6}$/i.test(C.cue.color), 'every cue unit has a label and the colour is #rrggbb');
  assert.ok(C.cue.units.includes('head') && C.cue.sizePx >= 32 && C.cue.pulseS > 0 && C.cue.delayS >= 0, 'a thumb-sized cue, on the head too');
  // Strategy 2026-10-27: a tapped limb piece flies sideways or toward the camera, never away from it (the player must see the flight): awayMult <= 0, sideMult > 0
  assert.ok(C.tap.awayMult <= 0 && C.tap.sideMult > 0 && C.tap.impulse > 0 && C.tap.lift >= 0, 'tap push rows: toward or sideways, not away from the camera');
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
  assert.equal(rd.awake, true, 'the piece the cut wakes is awake');
  for (let i = 0; i < ROWS.tickHz * 30 && rd.awake; i++) physics.step(1 / ROWS.tickHz);   // the page steps the world only while rd.awake
  assert.equal(rd.awake, false, 'the piece settles and the world stops being stepped');
  const after = pose(), moved = (id) => Math.hypot(...[0, 1, 2].map((k) => at(after, id)[k] - at(before, id)[k]));
  assert.ok(moved('handLeft') > 0.2, `the hand moved ${moved('handLeft').toFixed(2)} m`);
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
  // M9a: a visual unit (head_split, belly_open) carries no gear slot (physics 9056ef7), so its event never repeats the head's or the chest's gear that the head / waist cut already lists
  const worn = { gear: { head: ['helm'], chest: ['cuirass'] } };
  assert.deepEqual(cutEvent(worn, { unit: 'head_split', gear_slots: [] }, 'finisher'), { type: 'cut', unit: 'head_split', gear: [], source: 'finisher' });
  assert.deepEqual(cutEvent(worn, { unit: 'belly_open', gear_slots: [] }, 'finisher'), { type: 'cut', unit: 'belly_open', gear: [], source: 'finisher' });
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
  const s = strip(), cutter = createPieceCutter(s.anchor), triangles = (g) => { let n = 0; const a = g.index.array; for (let t = 0; t < (g.drawRange.count === Infinity ? a.length : g.drawRange.count); t += 3) if (!(a[t] === a[t + 1] && a[t + 1] === a[t + 2])) n++; return n; };   // a triangle that left the body is zeroed (degenerate: it draws nothing)
  cutter.prepare([s.arm]);
  assert.equal(triangles(s.geometry), 6);
  const made = cutter.carve(s.arm, { piece: 0.5, bodyKeepBelow: 0.5 });
  assert.equal(made.length, 1);
  assert.equal(triangles(made[0].geometry), 3, 'the far ring pair and the seam triangle the arm holds most of');
  assert.equal(triangles(s.mesh.geometry), 2, 'the near ring pair stays on the body; the seam triangle with one arm vertex of three is on neither (6 = 3 + 2 + 1)');
  assert.notEqual(s.mesh.geometry, s.geometry, 'the body draws its filtered twin');
  assert.equal(made[0].skeleton, s.mesh.skeleton, 'the piece follows the same bones');
  const influence = (g, bone) => { let w = 0; const i = g.getAttribute('skinIndex'), k = g.getAttribute('skinWeight'); for (let v = 0; v < i.count; v++) for (let j = 0; j < 4; j++) if (i.getComponent(v, j) === bone) w += k.getComponent(v, j); return w; };
  assert.ok(influence(made[0].geometry, 1) === 0 && influence(made[0].geometry, 2) > 0, 'the piece is skinned to the cut bones only (the spine, index 1, has none)');
  assert.ok(influence(s.mesh.geometry, 2) === 0 && influence(s.mesh.geometry, 1) > 0, 'the body has lost the cut bones\' influence');
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

test('corpses left behind (leaveCorpse): the rows are sane and a corpse ages, loses its pieces, and is dropped on the clock; the oldest go first past max', () => {
  const R = ROWS.corpse;
  assert.ok(R.keepSeconds > 0 && R.pieceSeconds > 0 && R.pieceSeconds <= R.keepSeconds && Number.isInteger(R.max) && R.max >= 1, 'corpse rows: pieces go no later than the body, at least one stands');
  assert.deepEqual(validateFile('physics', ROWS), [], 'the shipped rows validate (corpse keys and numbers)');
  const row = { keepSeconds: 90, pieceSeconds: 12, max: 2 }, mk = () => ({ age: 0, piecesHidden: false });
  const a = mk(), b = mk();
  let r = ageCorpses([a, b], 11.9, row);
  assert.deepEqual([r.hide.length, r.drop.length, r.keep.length], [0, 0, 2]);
  r = ageCorpses(r.keep, 0.2, row);   // 12.1 s: the pieces of both go
  assert.deepEqual([r.hide.length, r.drop.length, r.keep.length], [2, 0, 2]);
  r = ageCorpses(r.keep, 1, row);     // already hidden: not hidden twice
  assert.deepEqual([r.hide.length, r.drop.length], [0, 0]);
  r = ageCorpses(r.keep, 80, row);    // 93.1 s: both are over keepSeconds
  assert.deepEqual([r.drop.length, r.keep.length], [2, 0]);
  const c = mk(), d = mk(), e = mk();
  r = ageCorpses([c, d, e], 1, row);  // three stand with max 2: the first one (the oldest) is dropped
  assert.deepEqual([r.drop, r.keep], [[c], [d, e]]);
});

test('leaveCorpse snapshots a carved body: the copy keeps the cut and its pieces, and the rematch\'s restore() leaves the copy intact while the live body is whole again', () => {
  const s = strip(), cutter = createPieceCutter(s.anchor), triangles = (g) => { let n = 0; const a = g.index.array; for (let t = 0; t < a.length; t += 3) if (!(a[t] === a[t + 1] && a[t + 1] === a[t + 2])) n++; return n; };
  cutter.prepare([s.arm]);
  cutter.carve(s.arm, { piece: 0.5, bodyKeepBelow: 0.5 });
  const { copy, pieces, owned } = snapshotRig(s.anchor, true);   // the order leaveCorpse uses: copy first, then build() -> cutter.restore()
  const meshes = []; copy.traverse((o) => { if (o instanceof THREE.SkinnedMesh) meshes.push(o); });
  assert.equal(meshes.length, 2, 'the copy has the body and the piece');
  assert.equal(pieces.length, 1, 'the copy knows which mesh is the cut piece');
  assert.equal(owned.length, 2, 'it cloned the geometry of both');
  assert.ok(meshes.every((m) => !Object.values(s.anchor.children).includes(m)) && meshes.every((m) => m.geometry !== s.mesh.geometry), 'no copy mesh points at the live twin');
  cutter.restore();   // the rematch: the live body's geometry back, the pieces gone and their geometry released
  const [body] = meshes.filter((m) => m.userData.cutPiece === undefined), [piece] = meshes.filter((m) => m.userData.cutPiece !== undefined);
  assert.equal(triangles(body.geometry), 2, 'the copy still has the cut body (the far ring pair gone)');
  assert.equal(triangles(piece.geometry), 3, 'the cut piece is whole: its attributes were not released');
  assert.ok(piece.geometry.getAttribute('position') && piece.geometry.getAttribute('skinIndex'), 'the piece still has its vertex data');
  assert.equal(s.mesh.geometry, s.geometry, 'the live body draws its own whole geometry again');
  assert.equal(triangles(s.geometry), 6, 'and it is whole');
  for (const g of owned) g.dispose();
});

test('a pooled cap or helmet mesh taken for a cut leaves the warm-up speck behind (the helmet is as big as its row says)', () => {
  const warmed = () => { const m = new THREE.Mesh(); m.scale.setScalar(WARM_SCALE); m.visible = false; return m; };
  for (const scale of [1, 0.123]) { const m = warmed(); showPooled(m, scale); assert.equal(m.visible, true); assert.deepEqual(m.scale.toArray(), [scale, scale, scale]); }
});

test('the cut GLB\'s cap_* meshes ship visible and hideCutCaps hides every one at attach (Dom 2026-10-27: pink patches at the start), the body pieces untouched', () => {
  const root = new THREE.Group(), names = ['cap_neck_head', 'cap_shoulder_left_arm', 'cap_hip_right_leg', 'piece_root', 'piece_head'];
  for (const n of names) { const m = new THREE.Mesh(); m.name = n; root.add(m); }
  assert.equal(hideCutCaps(root), 3);
  for (const n of names) assert.equal(root.getObjectByName(n).visible, !n.startsWith('cap_'), n);
  assert.equal(hideCutCaps(root), 0);
  const group = new THREE.Group(); group.name = 'cap_belly_opening'; for (const n of ['cap_belly_opening_1', 'cap_belly_opening_2']) { const m = new THREE.Mesh(); m.name = n; group.add(m); }
  assert.equal(hideCutCaps(group), 1);   // the group alone: showing it (cutRig.update) shows both primitives
  assert.deepEqual(group.children.map((c) => c.visible), [true, true]);
  const b = readFileSync(new URL('../src/assets/minotaur-106.glb', import.meta.url)), gl = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  assert.equal(gl.nodes.filter((n) => n.name?.startsWith('cap_')).length, 16);   // the file carries them (12 stump caps + the head_split and belly_open faces, M9a) (glTF nodes are visible by default): hiding is the loader's job
});
