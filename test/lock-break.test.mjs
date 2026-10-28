// The lock is a camera (Dom 2026-10-28: free looking, run any way; "if somebody is going to hit you, you can walk away"). Pure rules (src/fight/lock-break.ts), the rows, the camera hand-over, the page wiring,
// the look with no clamp, and the TRACE: a stick sequence fed frame by frame at 60 fps, printing the lock state and the time to break in ms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { awayAngleDeg, freshLock, lockBreakFor, stepLock, stickWorld, validateLockBreak } from '../src/fight/lock-break.ts';
import { wantsFreeCamera, freeCameraFor } from '../src/fight/free-camera.ts';
import { createCameraRig } from '../src/fight/camera.ts';
import { validateFile } from '../src/sim/validate.js';
import * as THREE from 'three';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ROWS = JSON.parse(read('../data/respawn.json')), R = ROWS.lockBreak, LIM = ROWS.limits.lockBreak;
const DT = 1 / 60;
// hero at the origin, foe 3 m along +z; at yaw 0 the stick's z maps straight to world z, so z = -1 points away from him
const frame = (o = {}) => ({ dt: DT, fighting: true, stick: { x: 0, z: 0 }, yaw: 0, hero: { x: 0, z: 0 }, foe: { x: 0, z: 3 }, action: null, ...o });
const AWAY = { x: 0, z: -1 }, TOWARD = { x: 0, z: 1 };
const run = (s, n, f) => { for (let i = 0; i < n; i++) s = stepLock(R, s, f).state; return s; };
const fresh = freshLock();

test('the row is pinned, the schema knows it, bad rows are refused', () => {
  assert.deepEqual({ ...R, about: undefined }, { about: undefined, on: true, query: 'lock', off: 'v1', breakAngleDeg: 120, minPush: 0.5, commitSeconds: 0.25, relockAngleDeg: 60, relockSeconds: 0.5 });
  assert.deepEqual(validateFile('respawn', ROWS), []);
  assert.ok(validateFile('respawn', { ...ROWS, lockBreak: { ...R, extra: 1 } }).length > 0);
  for (const k of Object.keys(LIM)) for (const v of [NaN, LIM[k][1] + 1, LIM[k][0] - 1]) assert.throws(() => validateLockBreak({ ...R, [k]: v }, LIM), new RegExp(k), `${k}=${v}`);
  assert.throws(() => validateLockBreak({ ...R, relockAngleDeg: 100, breakAngleDeg: 90 }, LIM), /smaller/);
  assert.throws(() => validateLockBreak({ ...R, on: 'yes' }, LIM), /true or false/);
  for (const gone of ['staminaCost', 'minEngageSeconds']) assert.equal(gone in R, false, `no artificial gate row: ${gone}`);
});

test('flags: ?lock=v1, ?postkill=v1 (no zone) and on:false keep the old hard lock', () => {
  assert.ok(lockBreakFor(true, ''));
  assert.equal(lockBreakFor(true, '?lock=v1'), null);
  assert.equal(lockBreakFor(false, ''), null);
  assert.equal(lockBreakFor(true, '', { lockBreak: { ...R, on: false }, limits: ROWS.limits }), null);
});

test('stick maths: world direction under a yaw, and the angle from the foe', () => {
  assert.equal(stickWorld({ x: 0, z: 0 }, 0), null);
  const d = stickWorld({ x: 0, z: -1 }, Math.PI / 2);
  assert.ok(Math.abs(d.x + 1) < 1e-9 && Math.abs(d.z) < 1e-9);
  assert.ok(awayAngleDeg({ x: 0, z: 1 }, { x: 0, z: 0 }, { x: 0, z: 3 }) < 1e-9);
  assert.ok(Math.abs(awayAngleDeg({ x: 0, z: -1 }, { x: 0, z: 0 }, { x: 0, z: 3 }) - 180) < 1e-9);
  assert.ok(Math.abs(awayAngleDeg({ x: 1, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 3 }) - 90) < 1e-9);
});

test('holding the stick away breaks the lock; a tap, a drift, a strafe and a back-sidestep do not', () => {
  assert.equal(run(fresh, 20, frame({ stick: AWAY })).broken, true);
  assert.equal(run(fresh, 10, frame({ stick: AWAY })).broken, false, 'a 10-tick tap (0.17 s) is jitter');
  assert.equal(run(fresh, 60, frame({ stick: { x: 0, z: -0.3 } })).broken, false, 'a drift under minPush');
  assert.equal(run(fresh, 60, frame({ stick: { x: 1, z: 0 } })).broken, false, 'a pure strafe (90 deg)');
  assert.equal(run(fresh, 60, frame({ stick: { x: 0.9, z: -0.3 } })).broken, false, 'a back-sidestep (about 108 deg)');
  const s = run(run(fresh, 10, frame({ stick: AWAY })), 3, frame());   // release: the timer resets
  assert.equal(run(s, 10, frame({ stick: AWAY })).broken, false);
});

test('no artificial gates: the break does not look at the hero, the foe, the stamina or the fight age', () => {
  // the frame carries only the stick, the view, the two positions and the pressed action; nothing else can hold the lock
  assert.equal(stepLock(R, fresh, frame({ stick: AWAY, action: 'dodge' })).state.broken, true, 'a roll away breaks on the first tick of the fight');
  assert.equal(run(fresh, 20, frame({ stick: AWAY })).broken, true, 'so does a held stick');
  const src = read('../src/fight/lock-break.ts');
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ''), /stamina|hurt|windup|minEngage|cooldown/i);
});

test('a roll pointed away breaks at once; a roll toward, sideways or with no stick does not', () => {
  assert.equal(stepLock(R, fresh, frame({ stick: AWAY, action: 'dodge' })).state.broken, true);
  assert.equal(stepLock(R, fresh, frame({ stick: TOWARD, action: 'dodge' })).state.broken, false);
  assert.equal(stepLock(R, fresh, frame({ stick: { x: 1, z: 0 }, action: 'dodge' })).state.broken, false);
  assert.equal(stepLock(R, fresh, frame({ action: 'dodge' })).state.broken, false);
});

test('a broken lock re-locks on an attack press or by running back at the foe; it is gone when the fight ends', () => {
  const broken = { ...fresh, broken: true };
  assert.equal(stepLock(R, broken, frame({ stick: AWAY })).state.broken, true);
  assert.equal(stepLock(R, broken, frame({ action: 'light' })).state.broken, false);
  assert.equal(stepLock(R, broken, frame({ action: 'dodge', stick: AWAY })).state.broken, true);
  assert.equal(run(broken, 32, frame({ stick: TOWARD })).broken, false);
  assert.equal(run(broken, 10, frame({ stick: TOWARD })).broken, true);
  assert.deepEqual(stepLock(R, broken, frame({ fighting: false })).state, freshLock(), 'target died or leashed: the next fight starts locked');
});

test('the view yaw matters: the stick is judged in the world, so turning the camera round and pushing "up" runs away from a foe behind you', () => {
  // camera turned 180 degrees: stick up (z -1) now points world +z, toward the foe at +z; stick down points away
  assert.equal(run(fresh, 20, frame({ yaw: Math.PI, stick: { x: 0, z: -1 } })).broken, false);
  assert.equal(run(fresh, 20, frame({ yaw: Math.PI, stick: { x: 0, z: 1 } })).broken, true);
});

test('the camera: a broken lock hands it to the player even in a fight; without it a fight stays on the pair camera', () => {
  const free = freeCameraFor(true, '');
  const w = { finished: false, heroStands: false, ceremonyOver: false, roaming: false, engaged: true };
  assert.equal(wantsFreeCamera(free, w), false);
  assert.equal(wantsFreeCamera(free, { ...w, broken: true }), true);
  assert.equal(wantsFreeCamera(free, { ...w, broken: false }), false);
});

test('look has no clamp: 720 degrees in either direction, and 178 degrees is kept (no 90 degree wall, no pull back behind the hero)', () => {
  const rig = createCameraRig(new THREE.PerspectiveCamera());
  for (let i = 0; i < 72; i++) rig.lookYaw(Math.PI / 18);
  assert.ok(Math.abs(rig.yaw) < 1e-6);
  rig.lookYaw(Math.PI * 0.99);
  assert.ok(Math.abs(Math.abs(rig.yaw) - Math.PI * 0.99) < 1e-9);
});

test('TRACE at 60 fps: push away, hold, release, jitter, roll; the time to break in ms (printed)', () => {
  const lines = [];
  let s = fresh, t = 0, pushedAt = null, brokeAt = null;
  const seq = [   // [label, frames, stick, action]
    ['rest', 6, { x: 0, z: 0 }, null], ['push away', 30, AWAY, null], ['release', 12, { x: 0, z: 0 }, null], ['jitter toward/away x4', 8, null, null],
    ['strafe', 12, { x: 1, z: 0 }, null], ['push away again', 20, AWAY, null],
  ];
  let k = 0;
  for (const [label, n, stick, action] of seq) for (let i = 0; i < n; i++, k++) {
    const st = stick ?? (i % 2 ? AWAY : TOWARD);   // the jitter flips every frame: far shorter than the debounce
    if (label.startsWith('push away') && i === 0 && !s.broken) { pushedAt = t; brokeAt = null; }
    const was = s.broken;
    s = stepLock(R, s, frame({ stick: st, action })).state; t += DT * 1000;
    if (!was && s.broken && pushedAt !== null && brokeAt === null) brokeAt = t - pushedAt;
    lines.push(`f${String(k).padStart(3)} t=${t.toFixed(0).padStart(4)}ms ${label.padEnd(22)} stick=(${st.x},${st.z}) away=${(s.away * 1000).toFixed(0).padStart(3)}ms lock=${s.broken ? 'BROKEN' : 'locked'}`);
    if (s.broken && label === 'push away again') break;
    if (s.broken && label === 'push away' && i >= 20) { s = { ...s, broken: false }; }   // re-arm after the first break so the trace shows the second push too
  }
  const first = lines.findIndex((l) => l.includes('BROKEN'));
  const firstMs = (first - 6) * (1000 / 60) + 1000 / 60;   // frames from the first push to the break, in ms
  console.log(['LOCK TRACE (breakAngleDeg ' + R.breakAngleDeg + ', commit ' + R.commitSeconds * 1000 + ' ms, 60 fps)', ...lines, `time-to-break from the first push: ${firstMs.toFixed(1)} ms (${Math.round(firstMs / (1000 / 60))} frames)`, `a roll away breaks on frame 1 (${(1000 / 60).toFixed(1)} ms)`].join('\n'));
  assert.ok(first >= 0, 'the held push broke the lock');
  assert.ok(firstMs <= R.commitSeconds * 1000 + 2 * (1000 / 60), 'time to break is the debounce plus at most two frames');
  assert.ok(firstMs >= R.commitSeconds * 1000 - 1000 / 60, 'and not sooner than the debounce');
  assert.ok(!lines.slice(6 + 30 + 12, 6 + 30 + 12 + 8).some((l) => l.includes('BROKEN')), 'frame-flipping jitter never breaks it');
});

test('page wiring: the soft lock feeds the sim lock flag and the camera; no stamina is touched', () => {
  const main = read('../src/client/main.ts');
  assert.match(main, /lockBreakFor\(!!ZONE, search\)/);
  assert.match(main, /lock: lockOn/);
  assert.match(main, /broken: lockState\.broken/);
  assert.doesNotMatch(main, /spendStamina/);
});
