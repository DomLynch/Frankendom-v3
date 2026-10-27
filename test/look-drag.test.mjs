// The zone's look thumb (data/respawn.json look, src/fight/look-drag.ts; Dom 2026-10-27: "the right thumb to be able to look left/right, rotate, while the left thumb is walking and moving,
// outside of combat"). Pure drag maths, the dead zone and the glide, the routing of two thumbs at once through the real stick code, the combat gate, the rows and their refusals, the page wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLook, lookFor, startsLook, turnOf, validateLook } from '../src/fight/look-drag.ts';
import { createInput } from '../src/fight/input.ts';
import { createCameraRig } from '../src/fight/camera.ts';
import { initialPractice } from '../src/fight/combat.ts';
import { roamStep } from '../src/fight/zone-loop.ts';
import { validateFile } from '../src/sim/validate.js';
import * as THREE from 'three';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ROWS = JSON.parse(read('../data/respawn.json')), LOOK = ROWS.look, L = ROWS.limits;
const LIMITS = { sensitivityDegPerPx: L.lookSensitivityDegPerPx, deadzonePx: L.lookDeadzonePx, minXShare: L.lookMinXShare, inertiaSeconds: L.lookInertiaSeconds, flingWindowMs: L.lookFlingWindowMs };
const patch = (f) => { const d = structuredClone(ROWS); f(d.look); return d; };
const W = 400;   // a phone-wide screen

test('the row is pinned: on, 0.3 deg a pixel (the old drag), a 6 px dead zone, touch right of 40%, a quarter-second glide; the schema knows it', () => {
  assert.deepEqual({ ...LOOK, about: undefined }, { about: undefined, on: true, query: 'look', off: 'off', sensitivityDegPerPx: 0.3, deadzonePx: 6, minXShare: 0.4, inertiaSeconds: 0.25, flingWindowMs: 80 });
  assert.deepEqual(validateFile('respawn', ROWS), [], 'the respawn schema accepts the row and its limits');
  assert.ok(validateFile('respawn', { ...ROWS, look: { ...LOOK, extra: 1 } }).length > 0, 'a stray key in the row is refused');
  const old = 0.005 * 180 / Math.PI;
  assert.ok(Math.abs(LOOK.sensitivityDegPerPx - old) < 0.02, 'the shipped sensitivity is the old hard-coded drag, to a rounding');
});

test('bad rows are refused', () => {
  for (const [what, f, re] of [
    ['sensitivity 0', (r) => { r.sensitivityDegPerPx = 0; }, /sensitivityDegPerPx/], ['sensitivity NaN', (r) => { r.sensitivityDegPerPx = NaN; }, /sensitivityDegPerPx/], ['sensitivity 90', (r) => { r.sensitivityDegPerPx = 90; }, /sensitivityDegPerPx/],
    ['dead zone -1', (r) => { r.deadzonePx = -1; }, /deadzonePx/], ['dead zone 999', (r) => { r.deadzonePx = 999; }, /deadzonePx/],
    ['minXShare 1', (r) => { r.minXShare = 1; }, /minXShare/], ['minXShare -0.1', (r) => { r.minXShare = -0.1; }, /minXShare/],
    ['inertia 60', (r) => { r.inertiaSeconds = 60; }, /inertiaSeconds/], ['inertia "x"', (r) => { r.inertiaSeconds = 'x'; }, /inertiaSeconds/],
    ['fling window 9999', (r) => { r.flingWindowMs = 9999; }, /flingWindowMs/],
    ['on "yes"', (r) => { r.on = 'yes'; }, /true or false/], ['no query', (r) => { r.query = ''; }, /words/],
  ]) assert.throws(() => lookFor(true, '', patch(f)), re, what);
  assert.doesNotThrow(() => validateLook(LOOK, LIMITS));
});

test('the flags: the zone plays the row; no free camera, ?look=off and the row off give none', () => {
  assert.deepEqual(lookFor(true, ''), LOOK);
  assert.equal(lookFor(false, ''), null, 'no free camera (?postkill=v1, ?freecam=v1): no look');
  assert.equal(lookFor(true, '?look=off'), null);
  assert.deepEqual(lookFor(true, '?look=1'), LOOK, 'any other value is not the off word');
  assert.equal(lookFor(true, '', patch((r) => { r.on = false; })), null);
});

test('the drag maths: pixels to radians by the row, right is positive, linear', () => {
  assert.equal(turnOf(LOOK, 0), 0);
  assert.ok(Math.abs(turnOf(LOOK, 100) - (100 * 0.3 * Math.PI) / 180) < 1e-12);
  assert.ok(Math.abs(turnOf(LOOK, -40) + turnOf(LOOK, 40)) < 1e-12);
  assert.ok(Math.abs(turnOf({ ...LOOK, sensitivityDegPerPx: 0.6 }, 50) - 2 * turnOf(LOOK, 50)) < 1e-12, 'twice the row, twice the turn');
});

test('who may start it: a touch only right of the share; a mouse anywhere', () => {
  assert.equal(startsLook(LOOK, W * 0.4, W, 'touch'), true);
  assert.equal(startsLook(LOOK, W * 0.39, W, 'touch'), false);
  assert.equal(startsLook(LOOK, 5, W, 'mouse'), true);
  assert.equal(startsLook(LOOK, 5, W, 'pen'), true);
  assert.equal(startsLook(LOOK, 300, 0, 'touch'), false, 'no width, no look');
});

test('a tap turns nothing; the dead zone ends without a jump; the drag then follows the finger', () => {
  const l = createLook({ ...LOOK, inertiaSeconds: 0 });
  assert.equal(l.down(7, 300, W, 'touch', 0), true);
  assert.equal(l.move(7, 300 + LOOK.deadzonePx - 1, 16), 0, 'inside the dead zone');
  assert.equal(l.move(7, 300 + LOOK.deadzonePx + 4, 32), 0, 'the move that crosses it turns nothing (no jump)');
  assert.ok(Math.abs(l.move(7, 300 + LOOK.deadzonePx + 14, 48) - turnOf(LOOK, 10)) < 1e-12, 'then 10 px is 10 px of turn');
  assert.ok(l.move(7, 300 + LOOK.deadzonePx + 4, 64) < 0, 'back the other way turns the other way');
  l.up(7, 70);
  assert.equal(l.active, null);
  const tap = createLook(LOOK);
  tap.down(1, 300, W, 'touch', 0); tap.up(1, 40);
  assert.equal(tap.step(0.016), 0, 'a tap leaves no glide');
});

test('one look finger at a time; other pointers are never its business', () => {
  const l = createLook({ ...LOOK, deadzonePx: 0, inertiaSeconds: 0 });
  assert.equal(l.down(2, 300, W, 'touch', 0), true);
  assert.equal(l.down(3, 350, W, 'touch', 0), false, 'a second finger on the right does not take it');
  assert.equal(l.move(3, 380, 10), 0);
  l.move(2, 310, 10);
  assert.ok(l.move(2, 330, 20) > 0);
  assert.equal(l.move(1, 99, 30), 0, 'the stick thumb\'s id moves nothing here');
  l.up(1, 30);
  assert.equal(l.active, 2, 'and its release does not end the look');
  l.up(2, 40);
  assert.equal(l.active, null);
});

test('the glide: a fling carries on and decays; a resting finger or a zero row stops dead; a new press stops it', () => {
  const run = (rows, lift) => {
    const l = createLook(rows);
    l.down(1, 300, W, 'touch', 0);
    l.move(1, 320, 10); l.move(1, 340, 26); l.move(1, 360, 42);
    l.up(1, lift);
    return l;
  };
  const l = run({ ...LOOK, deadzonePx: 0 }, 42 + 10);
  assert.equal(l.gliding, true);
  const first = l.step(0.016), later = (() => { for (let i = 0; i < 5; i++) l.step(0.016); return l.step(0.016); })();
  assert.ok(first > 0 && later > 0 && later < first, 'it decays');
  let spent = 0; for (let i = 0; i < 600; i++) spent += l.step(0.016);
  assert.equal(l.gliding, false, 'and ends');
  assert.ok(spent > 0 && spent < Math.PI, 'a short fling turns a little, not a lap');
  assert.equal(run({ ...LOOK, deadzonePx: 0 }, 42 + LOOK.flingWindowMs + 1).gliding, false, 'a finger that rested before lifting does not fling');
  assert.equal(run({ ...LOOK, deadzonePx: 0, inertiaSeconds: 0 }, 50).gliding, false, 'inertia 0 stops dead');
  const g = run({ ...LOOK, deadzonePx: 0 }, 50);
  g.down(4, 300, W, 'touch', 60);
  assert.equal(g.step(0.016), 0, 'a new press holds the view still');
});

test('the combat gate: cancel drops the finger and the glide at once; later moves of that finger turn nothing', () => {
  const l = createLook({ ...LOOK, deadzonePx: 0 });
  l.down(1, 300, W, 'touch', 0); l.move(1, 320, 10); assert.ok(l.move(1, 340, 20) > 0);
  l.cancel();
  assert.equal(l.active, null);
  assert.equal(l.move(1, 360, 30), 0, 'the fight started mid-drag: the same finger moving on turns nothing');
  l.up(1, 40);
  assert.equal(l.step(0.016), 0);
  const g = createLook({ ...LOOK, deadzonePx: 0 });
  g.down(1, 300, W, 'touch', 0); g.move(1, 320, 10); g.move(1, 340, 20); g.up(1, 25);
  assert.equal(g.gliding, true);
  g.cancel();
  assert.equal(g.gliding, false, 'a glide in progress is dropped when a fight starts');
});

// Two thumbs at once, through the real stick code: the left thumb holds the stick (pointer 1) while the right thumb drags the look (pointer 2) and a third press hits a button.
function fake() {
  const handlers = {};
  return {
    handlers, dataset: {}, style: {}, offsetWidth: 0,
    addEventListener: (t, f) => { (handlers[t] ??= []).push(f); },
    fire(t, e = {}) { for (const f of handlers[t] ?? []) f({ button: 0, pointerId: 1, preventDefault() {}, ...e }); },
    setPointerCapture() {}, setAttribute() {}, click() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 84, height: 84 }),
  };
}
function hands() {
  const els = {}, win = fake(), practice = initialPractice();
  const p = { ...practice, duel: { ...practice.duel, fighters: [{ ...practice.duel.fighters[0], phase: 'ready', stamina: 100 }, practice.duel.fighters[1]] } };
  const controls = createInput({ element: (id) => (els[id] ??= fake()), window: win, now: () => 0, matchMedia: () => ({ matches: true }), innerWidth: () => W, paused: () => false, ready: () => true, practice: () => p, quiet: () => {} });
  const canvas = fake(), look = createLook({ ...LOOK, deadzonePx: 0, inertiaSeconds: 0 });
  // the page's canvas wiring (src/client/main.ts), one for one
  canvas.addEventListener('pointerdown', (e) => { look.down(e.pointerId, e.clientX, W, e.pointerType, e.timeStamp); });
  let turned = 0;
  canvas.addEventListener('pointermove', (e) => { turned += look.move(e.pointerId, e.clientX, e.timeStamp); });
  for (const n of ['pointerup', 'pointercancel']) canvas.addEventListener(n, (e) => look.up(e.pointerId, e.timeStamp));
  return { controls, stick: els.joystick, strike: els['attack-button'], canvas, look, turned: () => turned, win };
}

test('two thumbs: the stick walks while the look turns, in either order, and neither touch disturbs the other', () => {
  const h = hands();
  h.stick.fire('pointerdown', { pointerId: 1, clientX: 42 + 30, clientY: 42 - 30, pointerType: 'touch' });   // left thumb up and right on the pad
  const walking = h.controls.intent();
  assert.ok(walking.x > 0 && walking.z < 0, 'the stick is held');
  h.canvas.fire('pointerdown', { pointerId: 2, clientX: 300, pointerType: 'touch', timeStamp: 0 });
  for (let i = 1; i <= 5; i++) h.canvas.fire('pointermove', { pointerId: 2, clientX: 300 + i * 20, pointerType: 'touch', timeStamp: i * 16 });
  assert.ok(h.turned() > 0, 'the view turned');
  const still = h.controls.intent();
  assert.equal(still.x, walking.x, 'while the stick did not change');
  assert.equal(still.z, walking.z);
  h.stick.fire('pointermove', { pointerId: 1, clientX: 42 - 30, clientY: 42, pointerType: 'touch' });
  const before = h.turned();
  h.canvas.fire('pointermove', { pointerId: 2, clientX: 420, pointerType: 'touch', timeStamp: 120 });
  assert.ok(h.controls.intent().x < 0, 'the stick moves on its own pointer');
  assert.ok(h.turned() > before, 'and the look carries on');
  h.canvas.fire('pointerup', { pointerId: 2, timeStamp: 140 });
  assert.ok(h.controls.intent().x < 0, 'lifting the right thumb leaves the walk');
  h.stick.fire('pointerup', { pointerId: 1 });
  assert.equal(h.controls.intent().x, 0);
  // the other order: look first, then the stick
  const k = hands();
  k.canvas.fire('pointerdown', { pointerId: 5, clientX: 320, pointerType: 'touch', timeStamp: 0 });
  k.stick.fire('pointerdown', { pointerId: 6, clientX: 42, clientY: 42 + 34, pointerType: 'touch' });
  k.canvas.fire('pointermove', { pointerId: 5, clientX: 340, pointerType: 'touch', timeStamp: 16 });
  k.canvas.fire('pointermove', { pointerId: 5, clientX: 360, pointerType: 'touch', timeStamp: 32 });
  assert.ok(k.controls.intent().z > 0, 'the stick answers');
  assert.ok(k.turned() > 0, 'and the look turns');
  k.stick.fire('pointerup', { pointerId: 6 });
  assert.equal(k.look.active, 5, 'the stick\'s release leaves the look finger');
});

test('the stick stays camera-relative: the same push walks a different way once the view has turned', () => {
  const walk = (yaw) => { const s = roamStep({ x: 0, z: 0, heading: 0, distance: 0 }, { x: 0, z: -1, yaw, run: false }, { x: 0, z: -50 }, 100); return Math.atan2(s.x, s.z); };
  const a = walk(0), b = walk(Math.PI / 2), wrapped = Math.atan2(Math.sin(a - b), Math.cos(a - b));
  assert.ok(Math.abs(Math.abs(wrapped) - Math.PI / 2) < 1e-6, 'a quarter turn of the view is a quarter turn of the walk');
  // and the camera rig reports the yaw the page hands the walk
  const rig = createCameraRig(new THREE.PerspectiveCamera());
  const y0 = rig.yaw;
  rig.lookYaw(-turnOf(LOOK, 100));
  assert.ok(Math.abs(Math.abs(rig.yaw - y0) - turnOf(LOOK, 100)) < 1e-9, 'the rig turned by exactly the drag');
  rig.lookYaw(turnOf(LOOK, 100));
  assert.ok(Math.abs(rig.yaw - y0) < 1e-9, 'and back');
});

// Source pins for the page wiring that cannot run in Node. Comments are stripped first so a comment cannot satisfy a pin; no pinned line carries a trailing comment.
const code = (p) => read(p).replace(/(^|\s)\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');
const PINS = [
  ['../src/client/main.ts', 'the rows come from the free camera: none without it', /const LOOK = lookFor\(!!FREE, search\), look = LOOK \? createLook\(LOOK\) : null;/],
  ['../src/client/main.ts', 'a press starts the look only while the camera is free, on its own pointer id', /if \(e\.button !== 0 \|\| paused\(\) \|\| !freeNow \|\| !look\.down\(e\.pointerId, e\.clientX, window\.innerWidth, e\.pointerType, e\.timeStamp\)\) return;/],
  ['../src/client/main.ts', 'a move turns the view by the drag', /view\.lookYaw\(-look\.move\(e\.pointerId, e\.clientX, e\.timeStamp\)\);/],
  ['../src/client/main.ts', 'a lift ends it', /look\.up\(\(e as PointerEvent\)\.pointerId, \(e as PointerEvent\)\.timeStamp\);/],
  ['../src/client/main.ts', 'every frame: the glide while free, the cancel the moment a fight (or a pause) takes the camera', /if \(look\) \{ if \(freeNow && !paused\(\)\) view\.lookYaw\(-look\.step\(dt\)\); else look\.cancel\(\); \}/],
  ['../src/client/main.ts', '?look=off keeps the plain drag', /if \(freeNow\) view\.lookRound\(e\.clientX - drag\.x\);/],
  ['../src/fight/scene.ts', 'the scene turns the rig (#136\'s hook)', /lookYaw\(radians: number\) \{ rig\.lookYaw\(radians\); \}/],
];
test('the page wires the look thumb: its own pointer id, the free camera gate, the frame cancel, ?look=off', () => {
  for (const [file, what, re] of PINS) {
    const text = code(file);
    assert.match(text, re, what);
    assert.doesNotMatch(text.replace(re, ''), re, `${what} (once)`);
  }
  const main = code('../src/client/main.ts');
  assert.equal(main.match(/\{ x: intent\.x, z: intent\.z, yaw: view\.yaw, run: intent\.run \}/g)?.length, 2, 'both the duel move and the free walk read the view yaw: the stick is camera-relative');
});
test('each pin bites: without its wiring the text no longer matches', () => {
  for (const [file, what, re] of PINS) assert.doesNotMatch(code(file).replace(re, ''), re, what);
});
