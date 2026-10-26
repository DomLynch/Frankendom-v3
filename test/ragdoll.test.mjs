// The opponent's presentation ragdoll (data/physics.json, src/fight/ragdoll.ts, @frankendom/physics). Presentation only: nothing here touches
// the sim (Gate 0's own tests guard that). These pin the rows against the package and the rig, the ?physics=v1 switch, the stagger shape and the
// blow's direction, and that the package's ragdoll built from the row falls and sleeps in Node, as it will in the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPhysics } from '@frankendom/physics';
import { blowImpulse, ragdollRowFor, staggerDepth, staggerStrengths } from '../src/fight/ragdoll.ts';
import { fightOpponent } from '../src/fight/foe-pick.ts';
import { foeBodyFile, chooseFoeBody } from '../src/fight/foe-body.ts';

const ROWS = JSON.parse(readFileSync(new URL('../data/physics.json', import.meta.url), 'utf8'));
const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));
const measure = (row) => JSON.parse(readFileSync(new URL(`../node_modules/@frankendom/physics/data/bodies/${row.measure.split('/').pop()}`, import.meta.url), 'utf8'));
const glbNodes = (file) => { const b = readFileSync(new URL(`../src/assets/${file}.glb`, import.meta.url)); return new Set(JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()).nodes.map((n) => n.name)); };

test('on by default for the fight the page plays, off under ?physics=v1 and for a foe without a row', () => {
  const id = fightOpponent(FIGHT, '');
  assert.equal(ragdollRowFor(ROWS, '', id)?.id, id);
  assert.equal(ragdollRowFor(ROWS, '?physics=v1', id), null);
  assert.equal(ragdollRowFor(ROWS, '', fightOpponent(FIGHT, '?pitborn=v1')), null);   // the Centurion's fight keeps today's death
  assert.equal(ragdollRowFor({ ...ROWS, on: false }, '', id), null);
});

test('every ragdoll row names a body the opponent is drawn in, a rig map with the package\'s 20 parts, and bones that exist in that body', async () => {
  const physics = await createPhysics({ seed: ROWS.seed });
  for (const row of ROWS.opponents) {
    chooseFoeBody('');
    assert.equal(foeBodyFile(row.id, row.id), row.body, `${row.id} is drawn as ${row.body}`);
    const rd = physics.createRagdoll(measure(row), { id: row.id }), map = ROWS.rigs[row.rig];
    assert.deepEqual(Object.keys(map).sort(), [...rd.partIds].sort(), `rig ${row.rig}: one bone per part`);
    const nodes = glbNodes(row.body);
    for (const [part, bone] of Object.entries(map)) assert.ok(nodes.has(bone), `${row.body}.glb has ${bone} (${part})`);
    for (const which of ['hit', 'kill']) for (const [location, part] of Object.entries(ROWS[which].parts)) assert.ok(rd.partIds.includes(part), `${which}.parts.${location} = ${part} is a part`);
    for (const role of Object.keys(ROWS.hit.targets)) assert.ok(rd.row.roles.some((r) => r.role === role), `stagger target ${role} is a role`);
    rd.destroy();
  }
  physics.destroy();
});

test('the stagger: eased in, held at the targets, back up, then over', () => {
  const h = ROWS.hit;
  assert.deepEqual(staggerStrengths(h, 0), Object.fromEntries(Object.keys(h.targets).map((r) => [r, 1])));
  const held = staggerStrengths(h, h.easeInS + h.holdS / 2);
  for (const [role, target] of Object.entries(h.targets)) assert.ok(Math.abs(held[role] - target) < 1e-9, role);
  assert.equal(staggerDepth(h, h.easeInS + h.holdS / 2), 1);
  assert.ok(Math.abs(staggerDepth(h, h.easeInS + h.holdS + h.upS / 2) - 0.5) < 1e-9);
  assert.equal(staggerStrengths(h, h.easeInS + h.holdS + h.upS), null);
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
  const physics = await createPhysics({ seed: ROWS.seed }), row = ROWS.opponents[0];
  const rd = physics.createRagdoll(measure(row), { id: row.id }), head = rd.partIds.indexOf('head');
  for (let i = 0; i < ROWS.tickHz / 2; i++) physics.step(1 / ROWS.tickHz);
  const standing = rd.readPose()[head * 10 + 1];
  rd.kill(blowImpulse(ROWS.kill, 'torso', 0, 0));
  for (let i = 0; i < ROWS.tickHz * 6 && rd.state !== 'frozen'; i++) physics.step(1 / ROWS.tickHz);
  assert.equal(rd.state, 'frozen');
  assert.ok(rd.readPose()[head * 10 + 1] < standing / 3, `head from ${standing.toFixed(2)} m to ${rd.readPose()[head * 10 + 1].toFixed(2)} m`);
  physics.destroy();
});
