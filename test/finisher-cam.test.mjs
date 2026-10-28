// The finisher camera for the cut (src/fight/finisher-cam.json): pure plan functions, the rows, the revert flag, the stick rule. Presentation only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cutAim, cutBloodRows, cutCamPose, cutCamProblems, cutCamRows, cutCamShare, finisherCamOn, MIN_EYE, stickBeat } from '../src/fight/finisher-cam.ts';
import { handsOver } from '../src/fight/free-camera.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const CAM = JSON.parse(read('../src/fight/finisher-cam.json'));
const ROWS = CAM.rows;
const DEFS = JSON.parse(read('../src/fight/finisher-defs.json')).finishers;
const SIX = ['decapitation', 'splitCrown', 'dismember', 'hamstringCut', 'opened', 'runThrough'];
const tanHalfH = (aspect, vfovDeg = 51 / 1.1) => Math.tan((vfovDeg * Math.PI) / 360) * aspect;

test('the flag: NO finisher zoom by default (Dom 2026-10-28), ?finishercam=v1 restores it', () => {
  assert.equal(finisherCamOn(''), false);
  assert.equal(finisherCamOn('?zoom=1'), false);
  assert.equal(finisherCamOn('?finishercam=v2'), false);
  assert.equal(finisherCamOn('?finishercam=v1'), true);
  assert.equal(cutCamRows(''), null, 'default: no close view of the cut, no stick beat');
  assert.deepEqual(Object.keys(cutCamRows('?finishercam=v1')).sort(), Object.keys(ROWS).sort());
  assert.deepEqual(Object.keys(cutBloodRows('')).sort(), Object.keys(ROWS).sort(), 'blood is not a camera effect: on by default');
});

test('the camera rig gates the push-in, the side reveal and the close view on the flag; the default frames a finish like normal combat', () => {
  const cam = read('../src/fight/camera.ts');
  assert.match(cam, /const FINISH_ZOOM = finisherCamOn\(/);
  assert.match(cam, /if \(FINISH_ZOOM && finish && finish\.posed/, 'push-in gated');
  assert.match(cam, /if \(FINISH_ZOOM && locked && !still && finish\?\.victim === 1 && open\)/, 'side reveal gated');
  assert.match(cam, /const cutRow = CUT_CAM && finish/, 'close view gated by the null rows');
});

test('the rows are sound and every id is a real finisher', () => {
  assert.deepEqual(cutCamProblems(ROWS), []);
  const ids = new Set(DEFS.map((f) => f.id));
  assert.deepEqual(Object.keys(ROWS).sort(), [...SIX].sort(), 'one row per finisher the ragdoll cuts');
  for (const id of Object.keys(ROWS)) assert.ok(ids.has(id), `${id} is not in finisher-defs.json`);
  assert.ok(cutCamProblems({ x: { ...ROWS.opened, over: 0 } }).length > 0);
  assert.ok(cutCamProblems({ x: { ...ROWS.opened, from: 0.9, over: 0.3 } }).length > 0);
  assert.ok(cutCamProblems({ x: { ...ROWS.opened, blood: { burst: 0.5, pool: 1 } } }).length > 0);
  assert.ok(cutCamProblems({ x: { ...ROWS.opened, rise: 0.3 } }).length > 0, 'a lens along the floor is refused');
  assert.ok(cutCamProblems({ x: { ...ROWS.opened, mix: 2 } }).length > 0);
});

test('the share: 0 before the window, a smooth rise, 1 after, monotone', () => {
  const r = ROWS.decapitation;
  assert.equal(cutCamShare(r, 0), 0);
  assert.equal(cutCamShare(r, r.from), 0);
  assert.equal(cutCamShare(r, r.from + r.over), 1);
  assert.equal(cutCamShare(r, 1), 1);
  let last = -1;
  for (let c = 0; c <= 1.0001; c += 0.02) { const k = cutCamShare(r, c); assert.ok(k >= last && k >= 0 && k <= 1); last = k; }
  assert.ok(Math.abs(cutCamShare(r, r.from + r.over / 2) - 0.5) < 1e-9);
});

test('the aim: the cut bone pulled `mix` toward his middle; no middle bone = the cut itself', () => {
  const out = { x: 0, y: 0, z: 0 }, cut = { x: 0, y: 1, z: 0 }, mid = { x: 1, y: 0, z: 2 };
  cutAim({ ...ROWS.opened, mix: 0.25 }, cut, mid, out);
  assert.deepEqual([out.x, out.y, out.z], [0.25, 0.75, 0.5]);
  cutAim({ ...ROWS.opened, mix: 0.25 }, cut, null, out);
  assert.deepEqual([out.x, out.y, out.z], [0, 1, 0]);
});

test('the pose: aims at the focus, stands to the dolly side, looks DOWN on a lying foe, hero off the line of sight, span fits a phone', () => {
  const out = { x: 0, y: 0, z: 0, lookX: 0, lookY: 0, lookZ: 0 };
  for (const [id, r] of Object.entries(ROWS)) {
    const hero = { x: 0, z: 0 }, scale = 1.3, focus = { x: 0.2, y: 0.4, z: 2.5 };
    cutCamPose(r, hero, focus, scale, tanHalfH(375 / 812), out);
    assert.deepEqual([out.lookX, out.lookY, out.lookZ], [focus.x, focus.y, focus.z], id);
    assert.ok(out.y >= MIN_EYE && Math.abs(out.y - Math.max(MIN_EYE, focus.y + r.rise * scale)) < 1e-9, id);
    const horiz = Math.hypot(out.x - focus.x, out.z - focus.z);
    assert.ok(Math.atan2(out.y - focus.y, horiz) > 0.45, `${id}: the lens must look down at least 26 degrees, not along the floor`);
    // the dolly's slide side is (-axisZ, axisX) = (-2.5, 0.2): the camera stands at negative x for this axis
    assert.ok(out.x < focus.x, `${id}: not on the slide side`);
    assert.ok(horiz >= r.dist * scale - 1e-9, id);
    assert.ok(2 * horiz * tanHalfH(375 / 812) >= r.span * scale - 1e-9, `${id}: span does not fit the portrait width`);
    // the hero is not between the lens and the cut: the angle between (eye->aim) and (eye->hero) is wide
    const toFoe = [focus.x - out.x, focus.z - out.z], toHero = [hero.x - out.x, hero.z - out.z];
    const cos = (toFoe[0] * toHero[0] + toFoe[1] * toHero[1]) / (Math.hypot(...toFoe) * Math.hypot(...toHero));
    assert.ok(cos < Math.cos(0.35), `${id}: the hero stands in front of the cut (cos ${cos.toFixed(2)})`);
  }
});

test('the cut fills a third of a portrait frame at kill+1.5 s: a 1 m cut at the pose\'s distance is >= 1/3 of the frame height', () => {
  const out = { x: 0, y: 0, z: 0, lookX: 0, lookY: 0, lookZ: 0 }, vfov = (51 / 1.1) * Math.PI / 180;
  for (const [id, r] of Object.entries(ROWS)) {
    const focus = { x: 0, y: 0.4, z: 2.5 };
    cutCamPose(r, { x: 0, z: 0 }, focus, 1.3, tanHalfH(375 / 812), out);
    const d = Math.hypot(out.x - focus.x, out.y - focus.y, out.z - focus.z);
    assert.ok(1 / (2 * d * Math.tan(vfov / 2)) >= 1 / 3, `${id}: a metre of him is ${(100 / (2 * d * Math.tan(vfov / 2))).toFixed(0)}% of the frame at ${d.toFixed(1)} m`);
  }
});

test('a narrower screen stands further back; no pose is NaN with the hero on the foe', () => {
  const a = { x: 0, y: 0, z: 0, lookX: 0, lookY: 0, lookZ: 0 }, b = { ...a };
  cutCamPose(ROWS.dismember, { x: 0, z: 0 }, { x: 0, y: 0.4, z: 3 }, 1, tanHalfH(0.3), a);
  cutCamPose(ROWS.dismember, { x: 0, z: 0 }, { x: 0, y: 0.4, z: 3 }, 1, tanHalfH(1.8), b);
  assert.ok(Math.hypot(a.x, a.z - 3) > Math.hypot(b.x, b.z - 3));
  cutCamPose(ROWS.opened, { x: 1, z: 1 }, { x: 1, y: 0.5, z: 1 }, 1, tanHalfH(0.46), a);
  for (const v of Object.values(a)) assert.ok(Number.isFinite(v));
});

test('the stick beat: ?finishercam=v1 holds a stick through the whole ceremony of any of the six; the default (no zoom) and a plain death hand over at once', () => {
  const FREE = JSON.parse(read('../data/respawn.json')).freeCamera, on = cutCamRows('?finishercam=v1'), v1 = cutCamRows('');
  for (const id of SIX) assert.equal(handsOver(FREE, false, true, 0, stickBeat(v1, id)), true, `${id}: default hands over at once (free-look / stick as in normal combat)`);
  assert.equal(FREE.stickEndsCeremony, true);
  for (const id of SIX) {
    const secs = DEFS.find((f) => f.id === id).seconds ?? DEFS.find((f) => f.id === DEFS.find((g) => g.id === id).secondsFrom).seconds;
    assert.equal(stickBeat(on, id), secs, `${id}: the beat is the finisher's whole length`);
    assert.equal(handsOver(FREE, false, true, 0.2, stickBeat(on, id)), false, `${id}: held at 0.2 s, the finisher plays`);
    assert.equal(handsOver(FREE, false, true, secs - 0.1, stickBeat(on, id)), false, `${id}: held to the end`);
    assert.equal(handsOver(FREE, false, true, secs + 0.1, stickBeat(on, id)), true, `${id}: after it, a held stick ends it as today`);
  }
  assert.equal(stickBeat(on, 'plainDeath'), 0);
  assert.equal(stickBeat(on, null), 0);
  assert.equal(handsOver(FREE, false, false, 9, 3), false, 'no stick, no walk');
  assert.equal(handsOver(FREE, true, true, 0.2, 3), true, 'the ceremony\'s own end still hands him over');
  assert.equal(handsOver(FREE, false, true), true, 'no timing given: as before');
});

test('wired: the camera, the blood and the stick rule read the rows; no sim file knows them', () => {
  assert.match(read('../src/fight/camera.ts'), /cutCamRows\(/);
  assert.match(read('../src/fight/scene.ts'), /!CUT_STICK \? 0/, 'the stick beat follows the zoom flag');
  assert.match(read('../src/fight/camera.ts'), /cutRow && finish!\.focus/);
  assert.match(read('../src/fight/scene.ts'), /CUT_BLOOD\?\.\[finisher\]\?\.blood/);
  assert.match(read('../src/fight/scene.ts'), /focus: cutBone \? cutFocus : null/);
  assert.match(read('../src/fight/scene.ts'), /cutRigKey !== rigNow/);
  assert.match(read('../src/client/main.ts'), /phase\.stickBeat/);
  assert.match(read('../src/fight/scene.ts'), /: STICK_FIRST_FRAME;/, 'the killing frame holds a stick still down');
  for (const [id, r] of Object.entries(ROWS)) assert.ok(r.from + r.over <= 0.3 + 1e-9, `${id}: the close view is in place by kill+1 s (clock 0.3), so kill+1.5 s reads`);
  for (const f of ['../src/fight/sim.ts', '../src/sim/validate.js']) assert.doesNotMatch(read(f), /finisher-cam|finishercam/);
});
