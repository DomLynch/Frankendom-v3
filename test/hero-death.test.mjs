// The hero's death and respawn loop (data/hero-death.json, src/fight/hero-death.ts; Dom 2026-10-28): the default flow is pinned, bad rows are refused, ?herodeath=v1 / ?postkill=v1 / the row off
// are the death as it was, and the pure steps (the Respawn gate, the death camera's share and pose) do what the rows say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deathCamPose, deathCamStep, heroDeathFor, respawnKey, respawnReady, standUpDue, validateHeroDeath, wantsRagdoll } from '../src/fight/hero-death.ts';
import { zoneFor } from '../src/zone/zone-rows.ts';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const ROWS = read('../data/hero-death.json'), ZONE = zoneFor(''), RESPAWN = read('../data/respawn.json');
const patch = (f) => { const d = structuredClone(ROWS); f(d); return d; };
test('the default flow is pinned: ragdoll, a 2.5 s pull-back, "You fell" and Respawn from 1.2 s, an automatic stand-up at 12 s', () => {
  const d = heroDeathFor(true, '');
  assert.ok(d, 'on in the zone');
  assert.deepEqual({ on: d.on, ragdoll: d.ragdoll, line: d.line, button: d.button, keys: d.keys }, { on: true, ragdoll: true, line: 'You fell', button: 'Respawn', keys: ['Enter', 'Space'] });
  assert.deepEqual(d.respawn, { minSeconds: 1.2, autoSeconds: 12 });
  assert.deepEqual(d.cam, { seconds: 2.5, pullBackMetres: 2.2, riseMetres: 0.9, orbitDegrees: 35, releaseSeconds: 0.8, lookY: 0.5 });
  assert.deepEqual([ROWS.query, ROWS.off], ['herodeath', 'v1']);
  assert.equal(wantsRagdoll(d), true);
  assert.ok(d.cam.seconds >= 2 && d.cam.seconds <= 3, 'a short death camera (2 to 3 s)');
  assert.ok(RESPAWN.heroDeath.fallSeconds <= ZONE.respawn.downSeconds, 'the v1 beat is untouched: the fall inside downSeconds');
  assert.equal(ZONE.respawn.died, 'You died', '?herodeath=v1 keeps the zone row\'s own line');
});

test('?herodeath=v1, ?postkill=v1 (no zone) and the row off are the death as it was', () => {
  assert.equal(heroDeathFor(true, '?herodeath=v1'), null);
  assert.equal(heroDeathFor(false, ''), null);
  assert.equal(heroDeathFor(true, '', patch((d) => { d.on = false; })), null);
  assert.notEqual(heroDeathFor(true, '?herodeath=v2'), null);
  assert.equal(wantsRagdoll(null), false);
  assert.equal(wantsRagdoll(heroDeathFor(true, '', patch((d) => { d.ragdoll = false; }))), false);
});

test('bad rows are refused', () => {
  for (const [path, bad] of [['respawn.minSeconds', -1], ['respawn.minSeconds', 11], ['respawn.autoSeconds', 1], ['respawn.autoSeconds', NaN], ['cam.seconds', 0], ['cam.seconds', 7], ['cam.pullBackMetres', 9], ['cam.riseMetres', -1], ['cam.orbitDegrees', 200], ['cam.releaseSeconds', 0], ['cam.lookY', '0.5']]) {
    const [a, b] = path.split('.');
    assert.throws(() => validateHeroDeath(patch((d) => { d[a][b] = bad; })), new RegExp(path.replace('.', '\\.')), `${path} = ${bad}`);
  }
  assert.throws(() => validateHeroDeath(patch((d) => { d.respawn.minSeconds = 10; d.respawn.autoSeconds = 5; })), /longer than autoSeconds/);
  assert.throws(() => validateHeroDeath(patch((d) => { d.respawn.autoSeconds = 2; d.cam.seconds = 3; })), /longer than respawn\.autoSeconds/);
  assert.throws(() => validateHeroDeath(patch((d) => { d.on = 'yes'; })), /true or false/);
  assert.throws(() => validateHeroDeath(patch((d) => { d.line = ''; })), /words/);
  assert.throws(() => validateHeroDeath(patch((d) => { d.keys = [1]; })), /KeyboardEvent codes/);
  assert.throws(() => heroDeathFor(true, '', patch((d) => { d.cam.seconds = 99; })), /cam\.seconds/);
});

test('the Respawn gate: not before minSeconds, a tap stands him up, nobody asking stands him up at autoSeconds', () => {
  const d = heroDeathFor(true, '');
  assert.equal(respawnReady(d, 1.19), false); assert.equal(respawnReady(d, 1.2), true);
  assert.equal(standUpDue(d, 0.5, true), false, 'a tap during the fall does nothing');
  assert.equal(standUpDue(d, 1.2, true), true);
  assert.equal(standUpDue(d, 5, false), false, 'he waits on the line');
  assert.equal(standUpDue(d, 11.99, false), false); assert.equal(standUpDue(d, 12, false), true, 'but nobody is stuck on it');
  assert.equal(respawnKey(d, 'Enter'), true); assert.equal(respawnKey(d, 'Space'), true); assert.equal(respawnKey(d, 'KeyF'), false, 'the attack keys are not Respawn');
});

test('the death camera rises over cam.seconds while he lies, holds, and eases away over releaseSeconds once he stands', () => {
  const { cam } = heroDeathFor(true, '');
  let s = 0; for (let i = 0; i < 60; i++) s = deathCamStep(cam, s, true, 1 / 60);
  assert.ok(s > 0.39 && s < 0.41, `1 s of 2.5 s: ${s}`);
  for (let i = 0; i < 300; i++) s = deathCamStep(cam, s, true, 1 / 60);
  assert.equal(s, 1, 'held');
  for (let i = 0; i < 30; i++) s = deathCamStep(cam, s, false, 1 / 60);
  assert.ok(s < 1 && s > 0, 'easing away');
  for (let i = 0; i < 120; i++) s = deathCamStep(cam, s, false, 1 / 60);
  assert.equal(s, 0, 'gone: the camera is the lock / free camera again');
});

test('the death camera pose: share 0 is the camera as it was; share 1 is pulled back, raised and turned round the hero', () => {
  const { cam } = heroDeathFor(true, ''), at = { x: 3, z: -2 }, from = { x: 3, y: 2.4, z: 4 };   // 6 m behind, 2.4 m up
  const none = deathCamPose(cam, 0, from, at);
  assert.ok(Math.abs(none.x - from.x) < 1e-9 && Math.abs(none.y - from.y) < 1e-9 && Math.abs(none.z - from.z) < 1e-9);
  const full = deathCamPose(cam, 1, from, at);
  assert.ok(Math.abs(Math.hypot(full.x - at.x, full.z - at.z) - (6 + cam.pullBackMetres)) < 1e-9, 'further from him by pullBackMetres');
  assert.ok(Math.abs(full.y - (from.y + cam.riseMetres)) < 1e-9, 'higher by riseMetres');
  const turn = Math.abs(Math.atan2(full.x - at.x, full.z - at.z) - Math.atan2(from.x - at.x, from.z - at.z)) * 180 / Math.PI;
  assert.ok(Math.abs(turn - cam.orbitDegrees) < 1e-6, `turned ${cam.orbitDegrees} degrees round him: ${turn}`);
  assert.equal(full.lookY, cam.lookY);
  const half = deathCamPose(cam, 0.5, from, at);
  assert.ok(Math.abs(half.y - (from.y + cam.riseMetres / 2)) < 1e-9, 'smoothstep: half is half');
});
