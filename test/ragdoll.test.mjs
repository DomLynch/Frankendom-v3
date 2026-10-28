// The opponent's presentation ragdoll (data/physics.json, src/fight/ragdoll.ts, @frankendom/physics). Presentation only: nothing here touches
// the sim (Gate 0's own tests guard that). These pin the rows against the package and the rig, the ?physics=v1 switch, the stagger shape and the
// blow's direction, and that the package's ragdoll built from the row falls and sleeps in Node, as it will in the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPhysics } from '@frankendom/physics';
import { blowImpulse, finisherModeFor, ragdollRowFor, staggerDepth } from '../src/fight/ragdoll.ts';
import { fightOpponent } from '../src/fight/foe-pick.ts';
import { foeBodyFile, chooseFoeBody } from '../src/fight/foe-body.ts';

const ROWS = JSON.parse(readFileSync(new URL('../data/physics.json', import.meta.url), 'utf8'));
const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));
const measure = (row, rig = '65') => JSON.parse(readFileSync(new URL(`../node_modules/@frankendom/physics/data/bodies/${row.measure[rig].split('/').pop()}`, import.meta.url), 'utf8'));
const glbNodes = (file) => { const b = readFileSync(new URL(`../src/assets/${file}.glb`, import.meta.url)); return new Set(JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()).nodes.map((n) => n.name)); };

test('on by default for the fight the page plays, off under ?physics=v1 and for a foe without a row', () => {
  const id = fightOpponent(FIGHT, '');
  assert.equal(ragdollRowFor(ROWS, '', id)?.id, id);
  assert.equal(ragdollRowFor(ROWS, '?physics=v1', id), null);
  assert.equal(ragdollRowFor(ROWS, '', fightOpponent(FIGHT, '?pitborn=v1')), null);   // the Centurion's fight keeps today's death
  assert.equal(ragdollRowFor({ ...ROWS, on: false }, '', id), null);
});

test('each rig\'s measure row is the body V3 draws on that rig: its role joints are that GLB\'s bind pose (feet on the floor)', async () => {
  const THREE = await import('three'), RIG = JSON.parse(readFileSync(new URL('../data/rig.json', import.meta.url), 'utf8'));
  const MAP65 = { Hips: 'pelvis', Head: 'Head', LeftHand: 'hand_l', RightHand: 'hand_r', LeftFoot: 'foot_l', RightToeBase: 'ball_r' };
  for (const row of ROWS.opponents) for (const rig of Object.keys(row.measure)) {
    const file = rig === '106' ? RIG.files[row.body] : row.body, b = readFileSync(new URL(`../src/assets/${file}.glb`, import.meta.url));
    const gl = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()), parent = {};
    gl.nodes.forEach((n, i) => (n.children || []).forEach((c) => { parent[c] = i; }));
    const local = (n) => n.matrix ? new THREE.Matrix4().fromArray(n.matrix) : new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1])));
    const world = (i) => (parent[i] === undefined ? local(gl.nodes[i]) : world(parent[i]).multiply(local(gl.nodes[i])));
    const at = (name65) => { const name = rig === '106' ? RIG.bones[name65] : name65, i = gl.nodes.findIndex((n) => n.name === name); assert.ok(i >= 0, `${file}.glb has ${name}`); return new THREE.Vector3().setFromMatrixPosition(world(i)); };
    const m = measure(row, rig), floor = at(MAP65.RightToeBase).y - m.joints.RightToeBase[1];
    for (const [role, name65] of Object.entries(MAP65)) {
      const p = at(name65), q = m.joints[role];
      assert.ok(Math.hypot(p.x - q[0], p.y - floor - q[1], p.z - q[2]) < 0.005, `${file} ${role}: GLB ${p.toArray().map((x) => x.toFixed(3))} vs row ${q}`);
    }
  }
});

test('the finishers are physics cuts by default (Dom 2026-10-27, test/defaults-on.test.mjs); ?ragdoll=v1 / always = the plain ragdoll death every time', () => {
  assert.equal(finisherModeFor(ROWS, ''), 'physics');
  assert.equal(finisherModeFor(ROWS, '?ragdoll=v1'), 'skip');
  assert.equal(finisherModeFor(ROWS, '?ragdoll=always'), 'skip');
  assert.equal(finisherModeFor(ROWS, '?ragdoll=finishers'), 'physics');   // V1's camera, blood and sound, the physics body (test/finisher-cuts.test.mjs)
  assert.equal(finisherModeFor(ROWS, '?ragdoll=clips'), 'keep');          // V1's finishers with V1's clips, no ragdoll body
  assert.equal(finisherModeFor(ROWS, '?ragdoll=sometimes'), 'physics');
});

test('every ragdoll row names a body the opponent is drawn in, the package\'s 20 parts, and bones that exist in that body on each rig (through data/rig.json)', async () => {
  const physics = await createPhysics({ seed: ROWS.seed }), RIG = JSON.parse(readFileSync(new URL('../data/rig.json', import.meta.url), 'utf8'));
  for (const row of ROWS.opponents) {
    chooseFoeBody('');
    // a held-spawn row (the page's id, another body: the boss bodies) is found by (id, body) in heldRagdollFor, never by the page's own lookup
    if (row.body !== foeBodyFile(row.id, row.id, true)) { assert.ok(row.measure['106'] && !row.measure['65'] && RIG.files[row.body], `${row.body}: a held-spawn row is 106 only and a data/rig.json files stem`); }
    else assert.equal(foeBodyFile(row.id, row.id, true), row.body, `${row.id} is drawn as ${row.body} (its 65 file: the row's body stem; its 106 file is data/rig.json files[${row.body}])`);
    const rd = physics.createRagdoll(measure(row, row.measure['65'] ? '65' : '106'), { id: row.id }), map = ROWS.bones;
    assert.deepEqual(Object.keys(map).sort(), [...rd.partIds].sort(), 'one bone per part');
    if (row.measure['65']) {   // the 65 file is checked for a row that has a 65 measure; the boss bodies are 106 only (no 65 file ships)
      const nodes = glbNodes(row.body);
      for (const [part, bone] of Object.entries(map)) assert.ok(nodes.has(bone), `${row.body}.glb has ${bone} (${part})`);
    }
    const nodes106 = glbNodes(RIG.files[row.body]);   // the 106 body: the same 65 names through the one map (data/rig.json bones)
    for (const [part, bone] of Object.entries(map)) assert.ok(nodes106.has(RIG.bones[bone]), `${RIG.files[row.body]}.glb has ${RIG.bones[bone]} (${part} = ${bone})`);
    for (const rig of Object.keys(row.measure)) assert.ok(['65', '106'].includes(rig), `measure keyed by rig: ${rig}`);
    for (const which of ['hit', 'kill']) for (const [location, part] of Object.entries(ROWS[which].parts)) assert.ok(rd.partIds.includes(part), `${which}.parts.${location} = ${part} is a part`);
    for (const [key, t] of Object.entries(ROWS.motorTuning)) {   // keys all < role < part id, as the package reads them
      assert.ok(key === 'all' || rd.partIds.includes(key) || rd.row.roles.some((r) => r.role === key), `motorTuning.${key} is all, a role or a part id`);
      assert.deepEqual(Object.keys(t).filter((k) => !['gain', 'damping'].includes(k)), [], `motorTuning.${key} names only gain and damping`);
    }
    assert.equal(typeof ROWS.solveHinges, 'boolean');
    for (const [part, w] of Object.entries(ROWS.hit.blend)) assert.ok(rd.partIds.includes(part) && w >= 0 && w <= 1, `hit.blend.${part} = ${w} is a part id with a share in 0..1`);
    for (const role of Object.keys(ROWS.states.stagger.targets)) assert.ok(rd.row.roles.some((r) => r.role === role), `stagger target ${role} is a role`);
    rd.destroy();
  }
  physics.destroy();
});

test('the stagger on screen: eased in, held, back up, then over (the package\'s shape, from the same row)', () => {
  const s = ROWS.states.stagger;
  assert.equal(staggerDepth(s, 0), 0);
  assert.equal(staggerDepth(s, s.ease_in_s + s.hold_s / 2), 1);
  assert.ok(Math.abs(staggerDepth(s, s.ease_in_s + s.hold_s + s.up_s / 2) - 0.5) < 1e-9);
  assert.equal(staggerDepth(s, s.ease_in_s + s.hold_s + s.up_s), -1);
});

test('the rows drive the package: its stagger runs on states.stagger, the gain is accepted, a reset ragdoll stands again', async () => {
  const physics = await createPhysics({ seed: ROWS.seed, states: ROWS.states }), row = ROWS.opponents[0];
  const rd = physics.createRagdoll(measure(row), { id: row.id, motorTuning: ROWS.motorTuning, solveHinges: ROWS.solveHinges });
  for (let i = 0; i < 10; i++) physics.step(1 / ROWS.tickHz);
  rd.stagger(blowImpulse(ROWS.hit, 'torso', 0, 0));
  physics.step(1 / ROWS.tickHz);
  assert.equal(rd.state, 'stagger');
  const s = ROWS.states.stagger;
  for (let i = 0; i < Math.ceil((s.ease_in_s + s.hold_s + s.up_s) * ROWS.tickHz) + 2; i++) physics.step(1 / ROWS.tickHz);
  assert.equal(rd.state, 'alive');
  rd.kill(blowImpulse(ROWS.kill, 'torso', 0, 0));
  for (let i = 0; i < ROWS.tickHz; i++) physics.step(1 / ROWS.tickHz);
  assert.notEqual(rd.state, 'alive');
  assert.equal(rd.reset(), true);
  assert.equal(rd.state, 'alive');
  physics.destroy();
});

test('a blow pushes along the attacker\'s facing, in the struck body\'s own frame', () => {
  const k = ROWS.kill, at = (heading, yaw) => blowImpulse(k, 'torso', heading, yaw).impulse;
  const [x, y, z] = at(1, 1);   // facing the way the body does: straight down its own +z
  assert.ok(Math.abs(x) < 1e-9 && y === k.lift && Math.abs(z - k.impulse) < 1e-9);
  assert.ok(Math.abs(at(Math.PI, 0)[2] + k.impulse) < 1e-9);
  assert.equal(blowImpulse(k, 'elbow', 0, 0), null);
  assert.equal(blowImpulse(k, 'torso', undefined, 0), null);
});

test('killed by the row\'s blow, the package\'s ragdoll from the row falls and sleeps', async () => {
  const physics = await createPhysics({ seed: ROWS.seed, states: ROWS.states }), row = ROWS.opponents[0];
  const rd = physics.createRagdoll(measure(row), { id: row.id, motorTuning: ROWS.motorTuning, solveHinges: ROWS.solveHinges }), head = rd.partIds.indexOf('head');
  for (let i = 0; i < ROWS.tickHz / 2; i++) physics.step(1 / ROWS.tickHz);
  const standing = rd.readPose()[head * 10 + 1];
  rd.kill(blowImpulse(ROWS.kill, 'torso', 0, 0));
  for (let i = 0; i < ROWS.tickHz * 6 && rd.state !== 'frozen'; i++) physics.step(1 / ROWS.tickHz);
  assert.equal(rd.state, 'frozen');
  assert.ok(rd.readPose()[head * 10 + 1] < standing / 3, `head from ${standing.toFixed(2)} m to ${rd.readPose()[head * 10 + 1].toFixed(2)} m`);
  physics.destroy();
});
