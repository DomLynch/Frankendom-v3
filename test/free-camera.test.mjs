// The zone's free follow camera (data/respawn.json freeCamera, src/fight/free-camera.ts, camera.ts, Dom 2026-10-27 on his phone: "after the kill shot the camera should go into the normal free mode
// so I can move around freely"). Pure rules, the rows and their refusals, the camera rig through its real class, and the page wiring pinned on comment-stripped source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createCameraRig, setFreeCamera, setArenaClamp, setCameraPitch } from '../src/fight/camera.ts';
import { freeCameraFor, handsOver, stepShare, swingAround, validateFreeCamera, virtualFoe, wantsFreeCamera, yawBehind } from '../src/fight/free-camera.ts';
import { validateFile } from '../src/sim/validate.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ROWS = JSON.parse(read('../data/respawn.json')), FREE = ROWS.freeCamera, LIMITS = { gapMetres: ROWS.limits.freeCamGapMetres, handOverSeconds: ROWS.limits.handOverSeconds, swingTailSeconds: ROWS.limits.swingTailSeconds, swingRate: ROWS.limits.swingRate };
const patch = (f) => { const d = structuredClone(ROWS); f(d.freeCamera); return d; };

test('the row is pinned: on, the pit\'s start gap, a 1.2 s swing, the stick ends the ceremony, a fight is framed as a pair; the schema knows it', () => {
  assert.deepEqual({ ...FREE, about: undefined }, { about: undefined, on: true, query: 'freecam', off: 'v1', gapMetres: 3.25, handOverSeconds: 1.2, swingTailSeconds: 0.5, swingRate: 3, stickEndsCeremony: true, fight: 'pair' });
  assert.equal(FREE.gapMetres, ROWS.spawn.minDistance, 'the camera\'s virtual foe stands at the gap a fight starts at: the fight camera\'s own frame');
  assert.deepEqual(validateFile('respawn', ROWS), [], 'the respawn schema accepts the row');
  assert.ok(validateFile('respawn', { ...ROWS, freeCamera: { ...FREE, extra: 1 } }).length > 0, 'a stray key in the row is refused');
  assert.equal(ROWS.postKill.startAfterSeconds, 4, 'the ceremony still holds him no longer than this');
});

test('bad rows are refused', () => {
  for (const [what, f, re] of [
    ['gap 0', (r) => { r.gapMetres = 0; }, /gapMetres/], ['gap NaN', (r) => { r.gapMetres = NaN; }, /gapMetres/], ['gap 99', (r) => { r.gapMetres = 99; }, /gapMetres/],
    ['swing 0', (r) => { r.handOverSeconds = 0; }, /handOverSeconds/], ['swing 60', (r) => { r.handOverSeconds = 60; }, /handOverSeconds/],
    ['tail -1', (r) => { r.swingTailSeconds = -1; }, /swingTailSeconds/], ['rate 0', (r) => { r.swingRate = 0; }, /swingRate/], ['rate NaN', (r) => { r.swingRate = NaN; }, /swingRate/],
    ['fight "lock"', (r) => { r.fight = 'lock'; }, /fight/], ['on "yes"', (r) => { r.on = 'yes'; }, /true or false/], ['stick "yes"', (r) => { r.stickEndsCeremony = 'yes'; }, /true or false/],
    ['no query', (r) => { r.query = ''; }, /words/],
  ]) assert.throws(() => freeCameraFor(true, '', patch(f)), re, what);
  assert.doesNotThrow(() => validateFreeCamera(FREE, LIMITS));
});

test('the flags: the zone plays the rows; ?postkill=v1 (no zone), ?freecam=v1 and the row off keep the lock camera exactly', () => {
  assert.deepEqual(freeCameraFor(true, ''), FREE);
  assert.equal(freeCameraFor(false, ''), null, '?postkill=v1 has no zone: no free camera');
  assert.equal(freeCameraFor(true, '?freecam=v1'), null);
  assert.deepEqual(freeCameraFor(true, '?freecam=1'), FREE, 'any other value is not the off word');
  assert.equal(freeCameraFor(true, '', patch((r) => { r.on = false; })), null);
});

test('when the camera is free: after a kill once the ceremony is over or he moves, while nobody fights him; never in his own death; a fight is the lock unless the row says follow', () => {
  const w = (o) => ({ finished: false, heroStands: false, ceremonyOver: false, roaming: false, engaged: false, ...o });
  assert.equal(wantsFreeCamera(FREE, w({})), true, 'walking, nobody engaged: free');
  assert.equal(wantsFreeCamera(FREE, w({ engaged: true })), false, 'a fight: the pair frame');
  assert.equal(wantsFreeCamera({ ...FREE, fight: 'follow' }, w({ engaged: true })), true, 'the row can keep it free in a fight too');
  assert.equal(wantsFreeCamera(FREE, w({ finished: true, heroStands: true })), false, 'the kill shot plays as the finisher camera for the ceremony');
  assert.equal(wantsFreeCamera(FREE, w({ finished: true, heroStands: true, ceremonyOver: true })), true, 'the ceremony is over: free, with no stick needed');
  assert.equal(wantsFreeCamera(FREE, w({ finished: true, heroStands: true, roaming: true })), true, 'he moved: free at once');
  assert.equal(wantsFreeCamera(FREE, w({ finished: true, heroStands: false, ceremonyOver: true, roaming: true })), false, 'his own death keeps its camera');
  assert.equal(wantsFreeCamera({ ...FREE, fight: 'follow' }, w({ finished: true, heroStands: false })), false, 'and a follow row does not free it either');
  assert.equal(wantsFreeCamera(null, w({})), false, 'no rows (?postkill=v1, ?freecam=v1): never');
});

test('any stick input ends the ceremony at once when the row says so; without the row it waits as before; no input never hands over', () => {
  assert.equal(handsOver(FREE, false, true), true);
  assert.equal(handsOver({ ...FREE, stickEndsCeremony: false }, false, true), false, 'row off: the ceremony holds him');
  assert.equal(handsOver({ ...FREE, stickEndsCeremony: false }, true, true), true);
  assert.equal(handsOver(null, false, true), false, 'no rows: as before');
  assert.equal(handsOver(null, true, true), true);
  assert.equal(handsOver(FREE, true, false), false, 'no stick, no walk');
});

test('the pure pieces: the share runs over the row\'s seconds and snaps on the first frame; the virtual foe is exactly where the lock would aim; the swing goes round the hero', () => {
  assert.equal(stepShare(0, true, 0.6, 1.2, false), 0.5);
  assert.equal(stepShare(0.5, true, 9, 1.2, false), 1);
  assert.equal(stepShare(0.5, false, 0.6, 1.2, false), 0);
  assert.equal(stepShare(0, true, 0.01, 1.2, true), 1);
  assert.equal(stepShare(1, false, 0.01, 1.2, true), 0);
  const hero = { x: 12, z: -7 };
  for (const yaw of [0, 1, -2.5, 3.1]) {
    const f = virtualFoe(hero, yaw, 3.25);
    assert.ok(Math.abs(Math.hypot(hero.x - f.x, hero.z - f.z) - 3.25) < 1e-9);
    assert.ok(Math.abs(Math.atan2(hero.x - f.x, hero.z - f.z) - yaw) < 1e-9 || Math.abs(Math.abs(Math.atan2(hero.x - f.x, hero.z - f.z) - yaw) - 2 * Math.PI) < 1e-9, 'the lock yaw of the virtual foe is the view yaw: nothing pulls it');
  }
  assert.ok(Math.abs(yawBehind(0) - Math.PI) < 1e-9 || Math.abs(yawBehind(0) + Math.PI) < 1e-9);
  const from = { x: 6, y: 3, z: 0 }, to = { x: -6, y: 3, z: 0 }, about = { x: 0, z: 0 };   // the far side of the hero: a straight line goes through him
  let nearest = Infinity;
  for (let k = 0; k <= 1.0001; k += 0.05) { const p = swingAround(from, to, about, k); nearest = Math.min(nearest, Math.hypot(p.x - about.x, p.z - about.z)); }
  assert.ok(nearest > 5.9, `the swing keeps its radius round the hero (nearest ${nearest.toFixed(2)} m)`);
  const mid = swingAround(from, to, { x: 0, z: 0 }, 1); assert.ok(Math.abs(mid.x - to.x) < 1e-9 && Math.abs(mid.z - to.z) < 1e-9, 'it arrives');
});

const state = (x, z) => ({ x, z, heading: 0 });
const rigAt = (free) => { setFreeCamera(free); setArenaClamp(1e6); return createCameraRig(new THREE.PerspectiveCamera(51, 0.46, 0.1, 1000), true); };
const run = (rig, seconds, hero, foe, free, finish = null) => { for (let t = 0; t < seconds; t += 1 / 60) rig.update(1 / 60, hero, foe, true, finish, 1, 0, 0, 1, free); };

test('the rig: free, the camera does not turn back to the corpse as the hero walks away; the lock does (the live bug)', () => {
  const corpse = { x: 0, z: 0 };
  const lock = rigAt(null); run(lock, 2, state(0, 3.25), corpse, false);
  const free = rigAt(FREE); run(free, 2, state(0, 3.25), corpse, false);
  const yawLock0 = lock.yaw;
  run(free, 2, state(0, 3.25), corpse, true);   // the hand-over
  run(lock, 0.5, state(8, 12), corpse, false); run(free, 3, state(8, 12), corpse, true);   // he walks off to the side
  assert.ok(Math.abs(wrap(lock.yaw - yawLock0)) > 0.3, 'the lock swings round to keep the corpse in frame as he walks (the camera is not his)');
  assert.ok(Math.abs(wrap(free.yaw - yawLock0)) < 1e-6, 'the free camera keeps its yaw: the stick moves him, the camera follows behind');
  assert.equal(free.freeShare, 1);
  const behind = free.camera.position, back = Math.hypot(behind.x - 8, behind.z - 12);
  assert.ok(back > 3 && back < 12, `the free camera stands ${back.toFixed(1)} m from him: the fight camera's own distance`);
});

test('the rig: the camera follows a hero who has walked 500 m off, free, with the same height and distance as the fight camera at the start gap', () => {
  const fightRig = rigAt(null); run(fightRig, 3, state(0, 3.25), { x: 0, z: 0 }, false);
  const freeRig = rigAt(FREE); run(freeRig, 3, state(0, 3.25), { x: 0, z: 0 }, true);
  assert.ok(Math.abs(freeRig.camera.position.y - fightRig.camera.position.y) < 1e-6, 'the same height');
  assert.ok(Math.abs(freeRig.camera.position.z - fightRig.camera.position.z) < 1e-6 && Math.abs(freeRig.camera.position.x - fightRig.camera.position.x) < 1e-6, 'and, at the start gap, the same place');
  run(freeRig, 3, state(300, -400), { x: 0, z: 0 }, true);
  const p = freeRig.camera.position;
  assert.ok(Math.hypot(p.x - 300, p.z + 400) < 12, 'a hero 500 m away still has the camera behind him');
});

test('the rig: the hand-over swings round the hero and never through him, from every side of the corpse', () => {
  for (const angle of [0, Math.PI / 2, Math.PI, -2]) {
    const rig = rigAt(FREE), hero = state(0, 3.25), corpse = { x: 0, z: 0 };
    run(rig, 2, hero, corpse, false);
    rig.camera.position.set(Math.sin(angle) * 5.2, 1.6, 3.25 + Math.cos(angle) * 5.2);   // wherever the tour had left it
    let nearest = Infinity;
    for (let t = 0; t < 3; t += 1 / 60) { rig.update(1 / 60, hero, corpse, true, null, 1, 0, 0, 1, true); nearest = Math.min(nearest, Math.hypot(rig.camera.position.x - hero.x, rig.camera.position.z - hero.z)); }
    assert.ok(nearest > 2.5, `from ${angle.toFixed(1)} rad the camera came within ${nearest.toFixed(2)} m of him`);
  }
});

test('the camera pitch row (#133) still works in the free state: a flatter pitch lowers the free camera as it lowers the fight camera', () => {
  const eyeY = (pitch) => { setCameraPitch(pitch, { heroY: 0.4, minEyeY: 1.2 }); const r = rigAt(FREE); run(r, 3, state(0, 3.25), { x: 0, z: 0 }, true); return r.camera.position.y; };
  const off = eyeY(null), flat = eyeY(10);
  setCameraPitch(null, { heroY: 0.4, minEyeY: 1.2 });
  assert.ok(flat < off - 0.3, `pitch 10 lowers the free camera (${flat.toFixed(2)} m against ${off.toFixed(2)} m)`);
});

test('the rig: with no rows (?postkill=v1, ?freecam=v1) the free flag changes nothing', () => {
  const a = rigAt(null), b = rigAt(null);
  run(a, 3, state(4, 8), { x: 0, z: 0 }, false); run(b, 3, state(4, 8), { x: 0, z: 0 }, true);
  assert.equal(a.camera.position.x, b.camera.position.x); assert.equal(a.camera.position.y, b.camera.position.y); assert.equal(a.camera.position.z, b.camera.position.z);
  assert.equal(a.yaw, b.yaw); assert.equal(b.freeShare, 0);
});

test('the drag looks round and recenter stands behind him: the free camera keeps the new yaw', () => {
  const rig = rigAt(FREE); run(rig, 2, state(0, 3.25), { x: 0, z: 0 }, true);
  const y0 = rig.yaw; rig.orbit(100, 0); assert.ok(rig.yaw !== y0);
  run(rig, 2, state(0, 3.25), { x: 0, z: 0 }, true);
  assert.ok(Math.abs(wrap(rig.yaw - (y0 - 0.5))) < 1e-6, 'the lock does not pull the dragged view back');
  const y1 = rig.yaw; rig.lookYaw(0.4); assert.ok(Math.abs(wrap(rig.yaw - (y1 + 0.4))) < 1e-9, 'lookYaw turns the view by the given radians');
  run(rig, 1, state(0, 3.25), { x: 0, z: 0 }, true); assert.ok(Math.abs(wrap(rig.yaw - (y1 + 0.4))) < 1e-6, 'and the free camera keeps it');
  rig.faceBehind(0.7); assert.ok(Math.abs(wrap(rig.yaw - yawBehind(0.7))) < 1e-9);
});

// Source pins for the page wiring that cannot run in Node. Line comments are stripped first so a comment cannot satisfy a pin; no pinned line carries a trailing comment.
const code = (p) => read(p).replace(/(^|\s)\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');
const PINS = [
  ['../src/client/main.ts', 'the rows come from the zone: none without it', /const FREE = freeCameraFor\(!!ZONE, search\);/],
  ['../src/client/main.ts', 'the camera is given them', /setFreeCamera\(FREE\);/],
  ['../src/client/main.ts', 'the follow camera is decided every frame from the world', /freeNow = wantsFreeCamera\(FREE, \{ finished: !!practice\.finish, heroStands: heroStands\(\), ceremonyOver: freeAfterKill, roaming: roam !== null, engaged(, broken: lockState\.broken)? \}\);/],
  ['../src/client/main.ts', 'and handed to the draw', /roam !== null, freeNow,\s*\);/],
  ['../src/client/main.ts', 'the stick ends the ceremony through the row', /handsOver\(FREE, freeAfterKill \|\| phase\.complete \|\| killAge >= ZONE!\.startAfterSeconds, !!\(intent\.x \|\| intent\.z( \|\| intent\.guard \|\| isFreeAction\(duelIntent\.action\))?\), killAge, (intent\.guard \|\| isFreeAction\(duelIntent\.action\) \? 0 : )?phase\.stickBeat\)/],
  ['../src/client/main.ts', 'a drag looks round only when the camera is free', /if \(freeNow\) view\.lookRound\(e\.clientX - drag\.x\);/],
  ['../src/client/main.ts', 'recenter stands behind him', /if \(freeNow\) view\.faceBehind\(state\.heading\);/],
  ['../src/client/main.ts', 'the toast is timed from the kill, not from the rig\'s finish age', /toastOver\(ZONE_SOUND, killAge\)/],
  ['../src/fight/scene.ts', 'a free camera has no finisher camera', /practice\.finish && !roamed && !freeCamera \?/],
  ['../src/fight/scene.ts', 'and reaches the rig', /framingLow\(opponentId\), frameWiden, freeCamera\);/],
];
test('the page wires the free camera: the zone path decides it every frame, the stick and the drag use it, ?postkill=v1 builds none', () => {
  for (const [file, what, re] of PINS) {
    const text = code(file);
    assert.match(text, re, what);
    assert.doesNotMatch(text.replace(re, ''), re, `${what} (once)`);
  }
});
test('each pin bites: without its wiring the text no longer matches', () => {
  for (const [file, what, re] of PINS) assert.doesNotMatch(code(file).replace(re, ''), re, what);
  assert.doesNotMatch(code('../src/client/main.ts').replace(/setFreeCamera\(FREE\);/, ''), /setFreeCamera\(FREE\);/);
});

function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
