// The soft lock (Dom 2026-10-28: free looking, run any way, but the combat lock stays and is breakable, not too easy). Pure rules (src/fight/lock-break.ts), the rows, the camera hand-over, the page wiring, the look with no clamp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { awayAngleDeg, freshLock, lockBreakFor, mayBreak, spendStamina, stepLock, stickWorld, validateLockBreak } from '../src/fight/lock-break.ts';
import { wantsFreeCamera, freeCameraFor } from '../src/fight/free-camera.ts';
import { createCameraRig } from '../src/fight/camera.ts';
import { validateFile } from '../src/sim/validate.js';
import * as THREE from 'three';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ROWS = JSON.parse(read('../data/respawn.json')), R = ROWS.lockBreak, LIM = ROWS.limits.lockBreak;
const DT = 1 / 60;
// hero at the origin, foe 3 m ahead along +z; yaw 0 puts stick z=+1 (down) toward +z? advance: dz = z cos(yaw), so stick z +1 = world +z = toward the foe here; the page's lock view makes "up" (z -1) run toward him in the real camera frame, the maths is the world angle
const frame = (o = {}) => ({ dt: DT, fighting: true, stick: { x: 0, z: 0 }, yaw: 0, hero: { x: 0, z: 0 }, foe: { x: 0, z: 3 }, action: null, heroPhase: 'ready', heroDown: false, foePhase: 'ready', stamina: 100, ...o });
const AWAY = { x: 0, z: -1 }, TOWARD = { x: 0, z: 1 };
const run = (s, n, f) => { let cost = 0; for (let i = 0; i < n; i++) { const r = stepLock(R, s, f); s = r.state; cost += r.cost; } return { s, cost }; };
const aged = { ...freshLock(), engagedFor: 5 };

test('the row is pinned, the schema knows it, bad rows are refused', () => {
  assert.deepEqual({ ...R, about: undefined }, { about: undefined, on: true, query: 'lock', off: 'v1', breakAngleDeg: 120, minPush: 0.5, commitSeconds: 0.35, staminaCost: 15, minEngageSeconds: 1, relockAngleDeg: 60, relockSeconds: 0.5 });
  assert.deepEqual(validateFile('respawn', ROWS), []);
  assert.ok(validateFile('respawn', { ...ROWS, lockBreak: { ...R, extra: 1 } }).length > 0);
  for (const k of Object.keys(LIM)) for (const v of [NaN, LIM[k][1] + 1, LIM[k][0] - 1]) assert.throws(() => validateLockBreak({ ...R, [k]: v }, LIM), new RegExp(k), `${k}=${v}`);
  assert.throws(() => validateLockBreak({ ...R, relockAngleDeg: 130, breakAngleDeg: 120 }, LIM), /smaller/);
  assert.throws(() => validateLockBreak({ ...R, on: 'yes' }, LIM), /true or false/);
});

test('flags: ?lock=v1, ?postkill=v1 (no zone) and on:false keep the old hard lock', () => {
  assert.ok(lockBreakFor(true, ''));
  assert.equal(lockBreakFor(true, '?lock=v1'), null);
  assert.equal(lockBreakFor(false, ''), null);
  assert.equal(lockBreakFor(true, '', { lockBreak: { ...R, on: false }, limits: ROWS.limits }), null);
});

test('stick maths: world direction under a yaw, and the angle from the foe', () => {
  assert.equal(stickWorld({ x: 0, z: 0 }, 0), null);
  const d = stickWorld({ x: 0, z: -1 }, Math.PI / 2);   // yawed a quarter turn
  assert.ok(Math.abs(d.x + 1) < 1e-9 && Math.abs(d.z) < 1e-9);
  assert.ok(Math.abs(awayAngleDeg({ x: 0, z: 1 }, { x: 0, z: 0 }, { x: 0, z: 3 })) < 1e-9);
  assert.ok(Math.abs(awayAngleDeg({ x: 0, z: -1 }, { x: 0, z: 0 }, { x: 0, z: 3 }) - 180) < 1e-9);
  assert.ok(Math.abs(awayAngleDeg({ x: 1, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 3 }) - 90) < 1e-9);
});

test('holding the stick away for the commit time breaks the lock once and costs stamina; a tap, a drift or a strafe does not', () => {
  const held = run(aged, Math.ceil(R.commitSeconds / DT) + 2, frame({ stick: AWAY }));
  assert.equal(held.s.broken, true);
  assert.equal(held.cost, R.staminaCost);
  assert.equal(run(aged, 10, frame({ stick: AWAY })).s.broken, false, 'a 10-tick tap (0.17 s) is not enough');
  assert.equal(run(aged, 60, frame({ stick: { x: 0, z: -0.3 } })).s.broken, false, 'a drift under minPush is not');
  assert.equal(run(aged, 60, frame({ stick: { x: 1, z: 0 } })).s.broken, false, 'a pure strafe (90 deg) is not');
  assert.equal(run(aged, 60, frame({ stick: { x: 0.9, z: -0.3 } })).s.broken, false, 'a back-sidestep (about 108 deg) is not');
  const tapTwice = run(run(aged, 15, frame({ stick: AWAY })).s, 15, frame({ stick: { x: 0, z: 0 } }));   // the timer resets on release
  assert.equal(run(tapTwice.s, 15, frame({ stick: AWAY })).s.broken, false);
});

test('a roll pointed away breaks at once; a roll toward or sideways does not', () => {
  assert.equal(stepLock(R, aged, frame({ stick: AWAY, action: 'dodge' })).state.broken, true);
  assert.equal(stepLock(R, aged, frame({ stick: AWAY, action: 'dodge' })).cost, R.staminaCost);
  assert.equal(stepLock(R, aged, frame({ stick: TOWARD, action: 'dodge' })).state.broken, false);
  assert.equal(stepLock(R, aged, frame({ stick: { x: 1, z: 0 }, action: 'dodge' })).state.broken, false);
  assert.equal(stepLock(R, aged, frame({ action: 'dodge' })).state.broken, false, 'a roll with no stick has no direction');
});

test('the anti-easy gates: hurt, knocked down, the foe attacking, too early, too tired, and nobody fighting', () => {
  const long = Math.ceil(R.commitSeconds / DT) + 5, away = { stick: AWAY };
  for (const [what, o] of [['hurt', { heroPhase: 'hurt' }], ['down', { heroDown: true }], ['foe attack live', { foePhase: 'attack' }], ['tired', { stamina: R.staminaCost - 1 }], ['not fighting', { fighting: false }]]) {
    assert.equal(run(aged, long, frame({ ...away, ...o })).s.broken, false, what);
    assert.equal(stepLock(R, aged, frame({ ...away, ...o, action: 'dodge' })).state.broken, false, `${what} (roll)`);
  }
  assert.equal(run(freshLock(), Math.floor(R.minEngageSeconds / DT) - 5, frame(away)).s.broken, false, 'before minEngageSeconds');
  assert.equal(run(freshLock(), Math.ceil(R.minEngageSeconds / DT) + 25, frame(away)).s.broken, true, 'after it');
  assert.equal(mayBreak(R, aged, frame()), true);
  assert.equal(run(aged, long, frame({ ...away, stamina: R.staminaCost })).s.broken, true, 'exactly enough stamina breaks');
});

test('the break waits out the foe\'s swing: held through the attack, it breaks the moment the swing ends', () => {
  let s = aged; const away = { stick: AWAY };
  s = run(s, 40, frame({ ...away, foePhase: 'attack' })).s;
  assert.equal(s.broken, false);
  assert.equal(stepLock(R, s, frame(away)).state.broken, true, 'the hold kept counting through the swing, so the break lands the tick the swing is over');
});

test('a broken lock re-locks on an attack press or by running back at the foe; it is gone when the fight ends', () => {
  const broken = { ...aged, broken: true };
  assert.equal(stepLock(R, broken, frame({ stick: AWAY })).state.broken, true, 'running away stays free');
  assert.equal(stepLock(R, broken, frame({ action: 'light' })).state.broken, false, 'an attack press locks on');
  assert.equal(stepLock(R, broken, frame({ action: 'dodge', stick: AWAY })).state.broken, true, 'a roll does not');
  assert.equal(run(broken, Math.ceil(R.relockSeconds / DT) + 2, frame({ stick: TOWARD })).s.broken, false, 'running at him locks on after relockSeconds');
  assert.equal(run(broken, 10, frame({ stick: TOWARD })).s.broken, true, 'a flick toward him does not');
  assert.deepEqual(stepLock(R, broken, frame({ fighting: false })).state, freshLock(), 'target died or leashed: the next fight starts locked');
});

test('spendStamina is input side only: a new object, the hero only, never below zero, the same object for no cost', () => {
  const p = { duel: { fighters: [{ stamina: 20, x: 1 }, { stamina: 50 }] }, other: 1 };
  assert.equal(spendStamina(p, 0), p);
  const q = spendStamina(p, 15);
  assert.equal(q.duel.fighters[0].stamina, 5); assert.equal(q.duel.fighters[1].stamina, 50); assert.equal(p.duel.fighters[0].stamina, 20);
  assert.equal(spendStamina(p, 99).duel.fighters[0].stamina, 0);
});

test('the camera: a broken lock hands it to the player even in a fight; without the flag a fight stays locked', () => {
  const free = freeCameraFor(true, '');
  const w = { finished: false, heroStands: false, ceremonyOver: false, roaming: false, engaged: true };
  assert.equal(wantsFreeCamera(free, w), false, 'engaged, locked: the pair camera');
  assert.equal(wantsFreeCamera(free, { ...w, broken: true }), true);
  assert.equal(wantsFreeCamera(free, { ...w, broken: false }), false);
});

test('look has no clamp: a full 360 and more, in either direction, stays where it is put (no pull back behind the hero)', () => {
  const rig = createCameraRig(new THREE.PerspectiveCamera());
  for (let i = 0; i < 72; i++) rig.lookYaw(Math.PI / 18);   // 720 degrees in 10 degree steps
  assert.ok(Math.abs(rig.yaw) < 1e-6, 'two full turns land back at zero, nothing stopped it on the way');
  rig.lookYaw(Math.PI * 0.99);
  assert.ok(Math.abs(Math.abs(rig.yaw) - Math.PI * 0.99) < 1e-9, 'a 178 degree turn is kept (no 90 degree wall)');
});

test('page wiring: the soft lock feeds the sim lock flag and the camera; the sim files are untouched', () => {
  const main = read('../src/client/main.ts');
  assert.match(main, /lockBreakFor\(!!ZONE, search\)/);
  assert.match(main, /lock: lockOn/);
  assert.match(main, /broken: lockState\.broken/);
  assert.match(main, /spendStamina\(practice, stepped\.cost\)/);
});
