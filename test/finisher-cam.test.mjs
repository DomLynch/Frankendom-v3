// The finisher camera for the cut (src/fight/finisher-cam.json): pure plan functions, the rows, the revert flag. Presentation only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cutCamPose, cutCamProblems, cutCamRows, cutCamShare, finisherCamOn } from '../src/fight/finisher-cam.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ROWS = JSON.parse(read('../src/fight/finisher-cam.json')).rows;
const DEFS = JSON.parse(read('../src/fight/finisher-defs.json')).finishers;
const tanHalfH = (aspect, vfovDeg = 51 / 1.1) => Math.tan((vfovDeg * Math.PI) / 360) * aspect;

test('the flag: on by default, ?finishercam=v1 reverts', () => {
  assert.equal(finisherCamOn(''), true);
  assert.equal(finisherCamOn('?zoom=1'), true);
  assert.equal(finisherCamOn('?finishercam=v1'), false);
  assert.equal(cutCamRows('?finishercam=v1'), null);
  assert.deepEqual(Object.keys(cutCamRows('')).sort(), Object.keys(ROWS).sort());
});

test('the rows are sound and every id is a real finisher', () => {
  assert.deepEqual(cutCamProblems(ROWS), []);
  const ids = new Set(DEFS.map((f) => f.id));
  for (const id of ['decapitation', 'splitCrown', 'dismember', 'hamstringCut', 'hamstrung', 'opened', 'runThrough']) assert.ok(ROWS[id], id);
  for (const id of Object.keys(ROWS)) assert.ok(ids.has(id), `${id} is not in finisher-defs.json`);
  assert.ok(cutCamProblems({ x: { ...ROWS.opened, over: 0 } }).length > 0);
  assert.ok(cutCamProblems({ x: { ...ROWS.opened, from: 0.9, over: 0.3 } }).length > 0);
  assert.ok(cutCamProblems({ x: { ...ROWS.opened, blood: { burst: 0.5, pool: 1 } } }).length > 0);
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

test('the pose: aims at the cut, stands to the dolly side, hero is off the line of sight, span fits a phone', () => {
  const out = { x: 0, y: 0, z: 0, lookX: 0, lookY: 0, lookZ: 0 };
  for (const [id, r] of Object.entries(ROWS)) {
    const hero = { x: 0, z: 0 }, foe = { x: 0, z: 3 }, scale = 1.3;
    cutCamPose(r, hero, foe, scale, tanHalfH(375 / 812), null, out);   // no bone: the row's own spot
    assert.equal(out.lookX, foe.x); assert.equal(out.lookZ, foe.z);
    assert.ok(Math.abs(out.lookY - r.lookY * scale) < 1e-9, id);
    assert.ok(Math.abs(out.y - r.eyeY * scale) < 1e-9, id);
    // a followed bone: the aim IS the bone, the lens stands `rise` above it (never under the ground)
    const bone = { x: 0.2, y: 0.4, z: 2.5 };
    cutCamPose(r, hero, foe, scale, tanHalfH(375 / 812), bone, out);
    assert.deepEqual([out.lookX, out.lookY, out.lookZ], [bone.x, bone.y, bone.z], id);
    assert.ok(out.y >= 0.9 && Math.abs(out.y - Math.max(0.9, bone.y + r.rise * scale)) < 1e-9, id);
    cutCamPose(r, hero, foe, scale, tanHalfH(375 / 812), null, out);
    // the dolly's slide side is (-axisZ, axisX) = (-3, 0): the camera stands at negative x for this axis
    assert.ok(out.x < foe.x, `${id}: not on the slide side`);
    const dist = Math.hypot(out.x - foe.x, out.z - foe.z);
    assert.ok(dist >= r.dist * scale - 1e-9, id);
    assert.ok(2 * dist * tanHalfH(375 / 812) >= r.span * scale - 1e-9, `${id}: span does not fit the portrait width`);
    // the hero is not between the lens and the cut: the angle between (eye->foe) and (eye->hero) is wide
    const toFoe = [foe.x - out.x, foe.z - out.z], toHero = [hero.x - out.x, hero.z - out.z];
    const cos = (toFoe[0] * toHero[0] + toFoe[1] * toHero[1]) / (Math.hypot(...toFoe) * Math.hypot(...toHero));
    assert.ok(cos < Math.cos(0.35), `${id}: the hero stands in front of the cut (cos ${cos.toFixed(2)})`);
  }
});

test('a narrower screen stands further back; no pose is NaN with the hero on the foe', () => {
  const a = { x: 0, y: 0, z: 0, lookX: 0, lookY: 0, lookZ: 0 }, b = { ...a };
  cutCamPose(ROWS.dismember, { x: 0, z: 0 }, { x: 0, z: 3 }, 1, tanHalfH(0.4), null, a);
  cutCamPose(ROWS.dismember, { x: 0, z: 0 }, { x: 0, z: 3 }, 1, tanHalfH(1.8), null, b);
  assert.ok(Math.hypot(a.x, a.z - 3) > Math.hypot(b.x, b.z - 3));
  cutCamPose(ROWS.opened, { x: 1, z: 1 }, { x: 1, z: 1 }, 1, tanHalfH(0.46), { x: 1, y: 0.5, z: 1 }, a);
  for (const v of Object.values(a)) assert.ok(Number.isFinite(v));
});

test('wired: the camera and the blood read the rows, the flag reverts both, and no sim file knows them', () => {
  assert.match(read('../src/fight/camera.ts'), /cutCamRows\(/);
  assert.match(read('../src/fight/scene.ts'), /CUT_BLOOD\?\.\[finisher\]\?\.blood/);
  assert.match(read('../src/fight/scene.ts'), /focus: cutBone \? cutFocus : null/);
  for (const f of ['../src/fight/sim.ts', '../src/sim/validate.js']) assert.doesNotMatch(read(f), /finisher-cam|finishercam/);
});
