// The zone follow camera's pitch (data/fight.json camera.pitch): off by default (today's camera exactly), named presets and ?pitch= to try a flatter view
// that shows a band of horizon under the HUD, the hero kept where he stands on the screen, the finish and the widen untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { pitchChoice, repitch } from '../src/fight/camera-pitch.ts';
import { createCameraRig, setCameraPitch, setLockFrame } from '../src/fight/camera.ts';
import { fovForZoom } from '../src/fight/camera-zoom.ts';
import { validateFile } from '../src/sim/validate.js';

const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ROWS = FIGHT.camera.pitch;
const errs = (mut) => { const c = structuredClone(FIGHT); mut(c.camera.pitch); return validateFile('fight', c); };

test('the shipped row: default off, presets 14 / 18 / 22 degrees, and the file validates', () => {
  assert.equal(ROWS.default, 'off');
  assert.deepEqual(ROWS.presets, { flat: 14, low: 18, soft: 22 });
  assert.equal(ROWS.query, 'pitch');
  assert.deepEqual(validateFile('fight', FIGHT), []);
});

test('the validator refuses a bad row: missing, unknown default, preset outside the limits, bad limits, off/preset collision, bad heights', () => {
  assert.equal(validateFile('fight', (() => { const c = structuredClone(FIGHT); delete c.camera.pitch; return c; })()).length, 1);
  const bad = [
    (p) => { p.default = 'nope'; }, (p) => { p.default = 3; }, (p) => { p.presets.flat = 7; }, (p) => { p.presets.flat = 31; }, (p) => { p.presets.flat = NaN; }, (p) => { p.presets.flat = '14'; },
    (p) => { p.presets = {}; }, (p) => { p.presets.off = 15; }, (p) => { p.presets.Bad = 15; }, (p) => { p.limits = [30, 8]; }, (p) => { p.limits = [8]; }, (p) => { p.limits = [1, 30]; },
    (p) => { p.off = []; }, (p) => { p.heroY = -1; }, (p) => { p.heroY = NaN; }, (p) => { p.minEyeY = 0; }, (p) => { p.minEyeY = 9; }, (p) => { p.query = ''; }, (p) => { p.extra = 1; },
  ];
  for (const [i, m] of bad.entries()) assert.ok(errs(m).length >= 1, `bad row #${i} is refused`);
  assert.deepEqual(errs((p) => { p.default = 'low'; }), [], 'a preset as the page default is allowed');
});

test('?pitch= picks a preset, off or a number inside the limits; the default is no pitch at all', () => {
  assert.equal(pitchChoice(ROWS, ''), null);
  assert.equal(pitchChoice(ROWS, '?pitch=off'), null); assert.equal(pitchChoice(ROWS, '?pitch=default'), null);
  assert.equal(pitchChoice(ROWS, '?pitch=flat'), 14); assert.equal(pitchChoice(ROWS, '?pitch=low'), 18); assert.equal(pitchChoice(ROWS, '?x=1&pitch=SOFT'), 22);
  assert.equal(pitchChoice(ROWS, '?pitch=16'), 16); assert.equal(pitchChoice(ROWS, '?pitch=8'), 8); assert.equal(pitchChoice(ROWS, '?pitch=30'), 30);
  for (const junk of ['?pitch=', '?pitch=bogus', '?pitch=7.9', '?pitch=30.1', '?pitch=-5', '?pitch=NaN', '?pitch=Infinity']) assert.equal(pitchChoice(ROWS, junk), null, junk);
  assert.equal(pitchChoice({ ...ROWS, default: 'low' }, ''), 18, 'a row that makes low the default');
  assert.equal(pitchChoice({ ...ROWS, default: 'low' }, '?pitch=off'), null);
});

test('wiring pin: the page reads the row for the zone only, never under ?cam=v1, and the default is OFF (the camera is today\'s)', () => {
  const main = read('../src/client/main.ts');
  assert.match(main, /if \(ZONE && !\/\[\?&\]cam=v1\\b\/\.test\(search\)\) setCameraPitch\(pitchChoice\(FIGHT\.camera\.pitch, search\), FIGHT\.camera\.pitch\);/);
  assert.equal(pitchChoice(FIGHT.camera.pitch, ''), null);
  const cam = read('../src/fight/camera.ts');
  assert.match(cam, /let PITCH: [^\n]*= null;/);   // module default: no pitch
  for (const f of ['../src/fight/combat.ts', '../src/fight/duel.ts', '../src/fight/moves.ts', '../src/fight/record.ts']) assert.doesNotMatch(read(f), /camera-pitch|camera\.pitch/, f);
});

const FOV = fovForZoom(FIGHT.camera.zoom), ASPECT = 375 / 812;
const hero = { x: 0, z: 2, heading: 0, distance: 0 }, boss = { x: 0, z: -1.25 };
const place = (pitch, { widen = 1, boss: b = boss, steps = 1, finish = null, dt = 1 } = {}) => {
  setLockFrame(FIGHT.camera.lift, FIGHT.camera.side);
  setCameraPitch(pitch, ROWS);
  const cam = new THREE.PerspectiveCamera(FOV, ASPECT, 0.1, 400), rig = createCameraRig(cam, false);
  for (let i = 0; i < steps; i++) rig.update(dt, hero, b, true, finish, 1, 0, 0, widen);
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  setCameraPitch(null, ROWS);
  return cam;
};
const ndc = (cam, x, y, z) => new THREE.Vector3(x, y, z).project(cam);
const horizonNdc = (cam) => { const f = new THREE.Vector3(); cam.getWorldDirection(f); const up = Math.atan2(-f.y, Math.hypot(f.x, f.z)); return Math.tan(up) / Math.tan(FOV * Math.PI / 360); };   // the horizon's height on the screen: +1 = the top edge

test('default == today\'s pitch: no pitch set is the lock camera as it was, and setting then clearing a pitch leaves nothing behind', () => {
  const a = place(null), b = (() => { place(18); return place(null); })();
  assert.deepEqual(a.position.toArray(), b.position.toArray()); assert.deepEqual(a.quaternion.toArray(), b.quaternion.toArray());
  const c = place(pitchChoice(ROWS, ''));   // the row's default
  assert.deepEqual(a.position.toArray(), c.position.toArray()); assert.deepEqual(a.quaternion.toArray(), c.quaternion.toArray());
});

test('every preset keeps the hero where he stands on the screen, and shows more horizon than the default', () => {
  const base = place(null), at = (cam) => ndc(cam, hero.x, 1, hero.z).y, baseHero = at(base), baseH = horizonNdc(base);
  const baseAxis = Math.atan(baseH * Math.tan(FOV * Math.PI / 360)) * 180 / Math.PI;   // the default's axis pitch at this gap (it varies with the gap, ~20 degrees at the pit's start marks)
  let last = -Infinity;
  for (const [name, deg] of Object.entries(ROWS.presets).sort((p, q) => p[1] - q[1])) {
    const cam = place(deg), h = horizonNdc(cam);
    assert.ok(Math.abs(at(cam) - baseHero) < 0.02, `${name}: hero chest ${at(cam).toFixed(3)} vs default ${baseHero.toFixed(3)}`);
    assert.ok(Math.abs(Math.atan(h * Math.tan(FOV * Math.PI / 360)) * 180 / Math.PI - deg) < 0.05, `${name}: the axis looks down ${deg} degrees`);
    assert.ok(h > last, `${name} (${deg}): a steeper preset puts the horizon higher on the screen`);
    if (deg < baseAxis) assert.ok(h > 0 && h < baseH - 0.005, `${name}: flatter than the default, so its horizon sits lower on the screen (more of the band under the HUD)`);
    assert.ok(cam.position.y >= ROWS.minEyeY - 1e-9, `${name}: the eye stays above minEyeY`);
    last = h;
  }
  assert.ok(baseH > 0.8, `the default horizon sits near the top edge (${baseH.toFixed(3)}), the reason for the row`);
});

test('hero and boss both stay in the 375 portrait frame at every preset, with one boss and with the multi-boss widen', () => {
  for (const deg of [null, ...Object.values(ROWS.presets)]) {
    for (const widen of [1, 1.8]) {
      const far = { x: 0, z: -1.25 - (widen - 1) * 3 }, cam = place(deg, { widen, boss: far });
      for (const [who, p] of [['hero', hero], ['boss', far]]) for (const y of [0, 1.8]) {
        const v = ndc(cam, p.x, y, p.z);
        assert.ok(Math.abs(v.x) <= 0.9 && Math.abs(v.y) <= 0.95 && v.z < 1, `pitch ${deg} widen ${widen}: ${who} at ${y} m is on screen (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
      }
    }
  }
});

test('a finish frames as it always did: the pitch eases out, and the finisher tour is the default camera\'s', () => {
  const finish = { finisher: null, posed: false, draw: false, victim: 1, clock: 0, head: null, big: false };
  const a = place(null, { finish, steps: 40, dt: 0.25 }), b = place(14, { finish, steps: 40, dt: 0.25 });
  assert.ok(a.position.distanceTo(b.position) < 1e-3, `positions converge (${a.position.distanceTo(b.position)})`);
  assert.ok(Math.abs(a.quaternion.angleTo(b.quaternion)) < 1e-3, 'and so does the aim');
});

test('repitch is the identity on a pose that already has the asked pitch, and never drops the eye under minEyeY', () => {
  const eye = { x: 0, y: 3.5, z: 8 }, look = { x: 0, y: 0.8, z: 0.4 }, h = { x: 0, z: 2 };
  const axis = Math.atan2(eye.y - look.y, Math.hypot(look.x - eye.x, look.z - eye.z)) * 180 / Math.PI;
  const same = repitch(eye, look, h, axis, ROWS);
  assert.ok(Math.abs(same.eyeY - eye.y) < 1e-9 && Math.abs(same.lookY - look.y) < 1e-9);
  assert.equal(repitch(eye, look, h, 8, { ...ROWS, minEyeY: 4 }).eyeY, 4);
  assert.deepEqual(repitch(eye, { ...eye }, h, 14, ROWS), { eyeY: eye.y, lookY: eye.y }, 'a degenerate look (on the eye) is left alone');
});
