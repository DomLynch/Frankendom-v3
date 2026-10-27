// The skyline plate (src/fight/skyplate.ts, data/stage.json skyline.plate) and the portrait pitch lift (data/fight.json camera.pitch.portrait): rows validate, the plate keeps the picture's native
// aspect, the old strip is one query away, and a portrait screen sees more sky with the hero where he was while landscape is untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { validateFile } from '../src/sim/validate.js';
import { createSkyline, SKYLINE } from '../src/fight/skyline.ts';
import { plateOn, plateWindow, plateSize, plateCentreY, plateGeometry, plateAlpha, skyGradient } from '../src/fight/skyplate.ts';
import { pitchChoice, portraitPitch } from '../src/fight/camera-pitch.ts';
import { createCameraRig, setCameraPitch, setLockFrame } from '../src/fight/camera.ts';
import { fovForZoom } from '../src/fight/camera-zoom.ts';

const STAGE = JSON.parse(readFileSync(new URL('../data/stage.json', import.meta.url), 'utf8'));
const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));
const P = SKYLINE.plate, R = SKYLINE.radius;
const bad = (mut) => { const s = structuredClone(STAGE); mut(s.skyline.plate); return validateFile('stage', s); };

test('the shipped plate row validates; bad rows are refused', () => {
  assert.deepEqual(validateFile('stage', STAGE), []);
  const cases = [(p) => { p.extra = 1; }, (p) => { p.on = 'yes'; }, (p) => { p.query = 'sky'; }, (p) => { p.query = 'skyfold'; }, (p) => { p.file = '../x.webp'; }, (p) => { p.spanDegrees = 5; }, (p) => { p.spanDegrees = 300; },
    (p) => { p.cropAspect = 0.5; }, (p) => { p.cropAspect = NaN; }, (p) => { p.face.u = 2; }, (p) => { p.face = null; }, (p) => { p.horizonFraction = 0.1; }, (p) => { p.edgeFadeFraction = 0.9; },
    (p) => { p.segments = 3; }, (p) => { p.segments = 12.5; }, (p) => { p.sky.topColor = 'blue'; }, (p) => { p.sky.halfHeightMetres = 400; }, (p) => { p.sky = null; }, (p) => { p.spanDegrees = 180; p.cropAspect = 1.2; },
    (p) => { delete p.fixedYawDegrees; }];
  for (const [i, m] of cases.entries()) assert.ok(bad(m).length >= 1, `bad plate row #${i} is refused`);
  const none = structuredClone(STAGE); delete none.skyline.plate;
  assert.ok(validateFile('stage', none).length >= 1);
});

test('the shipped numbers: about 100 degrees, 4:1 window, the swap is rows only (file, cropAspect, horizonFraction, face)', () => {
  assert.equal(P.on, true); assert.equal(P.spanDegrees, 100); assert.equal(P.cropAspect, 4); assert.equal(P.query, 'skyplate'); assert.equal(P.v1, 'v1');
  assert.match(P.file, /\.webp$/);
  const src = readFileSync(new URL('../src/fight/skyplate.ts', import.meta.url), 'utf8') + readFileSync(new URL('../src/fight/skyline.ts', import.meta.url), 'utf8');
  for (const k of ['spanDegrees', 'cropAspect', 'faceElevationDegrees', 'edgeFadeFraction', 'fixedYawDegrees', 'horizonFraction', 'file']) assert.match(src, new RegExp(`\\.${k}\\b`), k);
});

test('?skyplate=v1 is the old strip; ?sky=v1 and the row off draw neither', () => {
  assert.equal(plateOn('', P), true); assert.equal(plateOn('?skyplate=v1', P), false); assert.equal(plateOn('?skyplate=1', P), true); assert.equal(plateOn('', { ...P, on: false }), false);
  const scene = new THREE.Scene();
  const old = createSkyline(scene, '?skyplate=v1', SKYLINE, () => new Promise(() => {}));
  assert.ok(old); assert.equal(old.mesh.geometry.parameters.thetaLength, Math.PI * 2);
  const plate = createSkyline(scene, '', SKYLINE, () => new Promise(() => {}));
  assert.ok(plate); assert.ok(Math.abs(plate.mesh.geometry.parameters.thetaLength - THREE.MathUtils.degToRad(100)) < 1e-9);
  assert.equal(createSkyline(scene, '?sky=v1', SKYLINE), null);
});

test('native aspect: the window is cropAspect for a wider picture (the current 10:1), the whole picture for a narrower one; the arc keeps that aspect and is never stretched', () => {
  const cur = plateWindow(P, 7782, 820);
  assert.ok(Math.abs(cur.aspect - 4) < 1e-9); assert.ok(Math.abs(cur.w * 7782 - 3280) < 1e-6); assert.ok(cur.u0 >= 0 && cur.u0 + cur.w <= 1 + 1e-12);
  assert.ok(Math.abs(cur.u0 + cur.w / 2 - P.face.u) < 1e-9, 'centred on the face');
  const next = plateWindow(P, 4096, 1024);
  assert.equal(next.w, 1); assert.equal(next.u0, 0); assert.equal(next.aspect, 4);
  const sq = plateWindow(P, 2000, 1000); assert.equal(sq.w, 1); assert.equal(sq.aspect, 2);
  for (const win of [cur, next, sq]) { const s = plateSize(P, R, win.aspect); assert.ok(Math.abs(s.width / s.height - win.aspect) < 1e-9); }
  const g = plateGeometry(P, R, 7782, 820), s = plateSize(P, R, 4), uv = g.getAttribute('uv');
  assert.ok(Math.abs(g.parameters.height - s.height) < 1e-9);
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < uv.count; i++) { lo = Math.min(lo, uv.getX(i)); hi = Math.max(hi, uv.getX(i)); }
  assert.ok(Math.abs(lo - cur.u0) < 1e-9 && Math.abs(hi - (cur.u0 + cur.w)) < 1e-9);
});

test('the face lands at the row elevation above the eye; the arc sits inside the far plane', () => {
  const h = plateSize(P, R, 4).height, cy = plateCentreY(P, R, h), faceY = cy + h / 2 - P.face.v * h;
  assert.ok(Math.abs(faceY - R * Math.tan(THREE.MathUtils.degToRad(P.faceElevationDegrees))) < 1e-9);
  assert.ok(Math.hypot(R, Math.abs(cy) + h / 2) <= 175);
});

test('a landed picture sizes the plate from its real shape and lays the sky gradient behind', async () => {
  const lateArt = await import('../src/late-art.ts');
  const scene = new THREE.Scene(), tex = new THREE.Texture({ width: 7782, height: 820 });
  const row = { ...SKYLINE, loadAfterFirstFrameMs: 0, fadeSeconds: 1 };
  const sky = createSkyline(scene, '', row, () => Promise.resolve(tex));
  lateArt.firstFrameDrawn(() => {});
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(sky.state, 'fading');
  const dome = sky.mesh.children.find((c) => c.name === 'skyplate-sky');
  assert.ok(dome); assert.ok(sky.mesh.material.alphaMap);
  assert.ok(Math.abs(sky.mesh.geometry.parameters.height - plateSize(P, R, 4).height) < 1e-6);
  sky.update(new THREE.Vector3(3, 2, 5), 0.5);
  assert.equal(dome.material.opacity, 0.5);
  assert.equal(tex.repeat.x, 1, 'the picture itself is untouched (the fold may share it)');
  sky.dispose();
});

test('edge fade: solid inside, nothing at the sides and the top; the gradient has a colour per vertex', () => {
  assert.equal(plateAlpha(P, 0.5, 0.5), 1); assert.equal(plateAlpha(P, 0, 0.5), 0); assert.equal(plateAlpha(P, 1, 0.5), 0); assert.equal(plateAlpha(P, 0.5, 1), 0);
  assert.ok(plateAlpha(P, P.edgeFadeFraction / 2, 0.5) > 0 && plateAlpha(P, P.edgeFadeFraction / 2, 0.5) < 1);
  const g = skyGradient(P, R, -10); assert.equal(g.getAttribute('color').count, g.getAttribute('position').count);
});

// the portrait lift
const ROWS = FIGHT.camera.pitch, FOV = fovForZoom(FIGHT.camera.zoom);
const hero = { x: 0, z: 2, heading: 0, distance: 0 }, boss = { x: 0, z: -1.25 };
const place = (aspect, portrait) => {
  setLockFrame(FIGHT.camera.lift, FIGHT.camera.side);
  setCameraPitch(pitchChoice(ROWS, ''), ROWS, portrait);
  const cam = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 400), rig = createCameraRig(cam, false);
  rig.update(1, hero, boss, true, null, 1, 0, 0, 1);
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  setCameraPitch(null, ROWS);
  return cam;
};
const horizonNdc = (cam) => { const f = new THREE.Vector3(); cam.getWorldDirection(f); return Math.tan(Math.atan2(-f.y, Math.hypot(f.x, f.z))) / Math.tan(FOV * Math.PI / 360); };

test('portrait pitch row: a preset, portrait only; ?pitch= (even off) wins; the page default stays off', () => {
  assert.equal(pitchChoice(ROWS, ''), null);
  const p = portraitPitch(ROWS, ''); assert.deepEqual(p, { degrees: ROWS.presets[ROWS.portrait.preset], belowAspect: ROWS.portrait.belowAspect });
  assert.equal(portraitPitch(ROWS, '?pitch=off'), null); assert.equal(portraitPitch(ROWS, '?pitch=flat'), null); assert.equal(portraitPitch(ROWS, '?pitch=16'), null);
  assert.deepEqual(portraitPitch(ROWS, '?pitch=bogus'), p);
  assert.equal(portraitPitch({ ...ROWS, portrait: undefined }, ''), null);
  const c = structuredClone(FIGHT); c.camera.pitch.portrait.preset = 'nope'; assert.ok(validateFile('fight', c).length >= 1);
  const d = structuredClone(FIGHT); d.camera.pitch.portrait.belowAspect = 1.5; assert.ok(validateFile('fight', d).length >= 1);
});

test('portrait: more sky (the horizon is higher on the screen), the hero stays where he stood; landscape is exactly the old camera', () => {
  const p = portraitPitch(ROWS, ''), A = 375 / 812;
  const before = place(A, null), after = place(A, p), ndc = (cam) => new THREE.Vector3(hero.x, ROWS.heroY, hero.z).project(cam).y;
  assert.ok(horizonNdc(after) > horizonNdc(before), 'the horizon rises');
  assert.ok(Math.abs(ndc(after) - ndc(before)) < 1e-6, 'the hero keeps his place on the screen');
  const wide = 812 / 375, a = place(wide, null), b = place(wide, p);
  assert.deepEqual(a.position.toArray(), b.position.toArray()); assert.deepEqual(a.quaternion.toArray(), b.quaternion.toArray());
});
