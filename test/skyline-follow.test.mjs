// The skyline yaw follow (src/fight/skyline.ts, data/stage.json skyline.yawFollow): the strip turns by yawFollow x the camera's yaw so the alien stays in the sky; ?skyfollow=v1 = fixed in world yaw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { validateFile } from '../src/sim/validate.js';
import { createSkyline, skyFollowOn, headingOf, unwrapYaw, stripYaw, SKYLINE } from '../src/fight/skyline.ts';

const STAGE = JSON.parse(readFileSync(new URL('../data/stage.json', import.meta.url), 'utf8'));
const never = () => new Promise(() => {});   // the texture never lands: only the rotation is under test
const camAt = (yaw) => { const c = new THREE.PerspectiveCamera(); c.rotation.y = yaw; c.updateMatrixWorld(true); return c; };

test('the shipped follow row is pinned and the stage file validates', () => {
  assert.ok(SKYLINE.yawFollow > 0 && SKYLINE.yawFollow <= 1);
  assert.equal(SKYLINE.followQuery, 'skyfollow'); assert.equal(SKYLINE.followV1, 'v1');
  assert.deepEqual(validateFile('stage', STAGE), []);
});

test('the validator refuses bad follow rows', () => {
  const bad = (patch) => { const s = structuredClone(STAGE); Object.assign(s.skyline, patch); return validateFile('stage', s).join('\n'); };
  assert.match(bad({ yawFollow: 1.5 }), /skyline\.yawFollow/);
  assert.match(bad({ yawFollow: -0.1 }), /skyline\.yawFollow/);
  assert.match(bad({ yawFollow: NaN }), /skyline\.yawFollow/);
  assert.match(bad({ yawFollow: '0.5' }), /skyline\.yawFollow/);
  assert.match(bad({ yawFollowSeconds: -1 }), /skyline\.yawFollowSeconds/);
  assert.match(bad({ yawFollowSeconds: 99 }), /skyline\.yawFollowSeconds/);
  assert.match(bad({ followQuery: 'no way' }), /skyline\.followQuery/);
  assert.match(bad({ followQuery: 'sky' }), /skyline\.followQuery/);
  assert.match(bad({ followQuery: 'skyview' }), /skyline\.followQuery/);
  assert.match(bad({ followV1: '' }), /skyline\.followV1/);
  const none = structuredClone(STAGE); delete none.skyline.yawFollow;
  assert.match(validateFile('stage', none).join('\n'), /yawFollow/);
});

test('the heading of a camera is its rotation about the vertical', () => {
  for (const yaw of [0, 0.5, -1.2, 3, -3]) {
    const d = camAt(yaw).getWorldDirection(new THREE.Vector3());
    assert.ok(Math.abs(headingOf(d.x, d.z) - yaw) < 1e-9, String(yaw));
  }
});

test('unwrapYaw takes the shortest turn, so crossing +-pi never jumps', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(near(unwrapYaw(3.1, -3.1), 2 * Math.PI - 3.1));   // +pi side to -pi side: keeps counting up
  assert.ok(near(unwrapYaw(-3.1, 3.1), 3.1 - 2 * Math.PI));
  assert.ok(near(unwrapYaw(0.2, 0.3), 0.3));
  let run = 0, prev = 0;
  for (let i = 1; i <= 400; i++) {   // two and a bit full turns
    const h = Math.atan2(Math.sin(i * 0.05), Math.cos(i * 0.05));   // wrapped heading, as the camera reports it
    run = unwrapYaw(run, h);
    assert.ok(Math.abs(run - prev) < 0.06, `step ${i}`);
    prev = run;
  }
  assert.ok(Math.abs(run - 400 * 0.05) < 1e-9);
});

test('stripYaw is the fixed yaw plus yawFollow x the camera yaw', () => {
  const row = { ...SKYLINE, yawDegrees: 90, yawFollow: 0.5 };
  assert.ok(Math.abs(stripYaw(row, 2) - (Math.PI / 2 + 1)) < 1e-12);
  assert.equal(stripYaw({ ...row, yawFollow: 0 }, 5), Math.PI / 2);
});

test('the strip turns after the camera, with no jump when the camera wraps through +-pi', () => {
  const row = { ...SKYLINE, yawDegrees: 0, yawFollow: 0.9, yawFollowSeconds: 0 };   // no ease: the rotation is the exact follow
  const sky = createSkyline(new THREE.Scene(), '', row, never);
  let last = 0;
  for (let i = 0; i <= 300; i++) {
    const yaw = i * 0.03;   // spinning past +pi (the camera's own Euler wraps; the direction does)
    sky.heading(camAt(yaw)); sky.update(new THREE.Vector3(), 1 / 60);
    if (i > 0) assert.ok(Math.abs(sky.mesh.rotation.y - last) < 0.03 * 0.9 + 1e-9, `frame ${i}`);
    last = sky.mesh.rotation.y;
  }
  assert.ok(Math.abs(last - 0.9 * 300 * 0.03) < 1e-9);   // 0.9 of 9 radians, not folded back into -pi..pi
});

test('the follow starts on target and then eases (yawFollowSeconds), never snapping', () => {
  const row = { ...SKYLINE, yawDegrees: 0, yawFollow: 1, yawFollowSeconds: 1 };
  const sky = createSkyline(new THREE.Scene(), '', row, never);
  sky.heading(camAt(2)); sky.update(new THREE.Vector3(), 0.016);
  assert.ok(Math.abs(sky.mesh.rotation.y - 2) < 1e-9);   // the first frame: no spin up from zero
  sky.heading(camAt(2.5)); sky.update(new THREE.Vector3(), 0.1);
  const r = sky.mesh.rotation.y;
  assert.ok(r > 2 && r < 2.5, String(r));   // moved toward, not onto
  for (let i = 0; i < 600; i++) { sky.heading(camAt(2.5)); sky.update(new THREE.Vector3(), 0.016); }
  assert.ok(Math.abs(sky.mesh.rotation.y - 2.5) < 1e-3);   // settled after ~10 time constants
});

test('?skyfollow=v1 (and yawFollow 0) keeps the strip fixed in world yaw', () => {
  assert.equal(skyFollowOn('', SKYLINE), true);
  assert.equal(skyFollowOn('?skyfollow=v1', SKYLINE), false);
  assert.equal(skyFollowOn('?foo=1&skyfollow=v1'), false);
  assert.equal(skyFollowOn('', { ...SKYLINE, yawFollow: 0 }), false);
  const sky = createSkyline(new THREE.Scene(), '?skyfollow=v1', { ...SKYLINE, yawDegrees: 30 }, never);
  for (const yaw of [0, 1, 2, 3]) { sky.heading(camAt(yaw)); sky.update(new THREE.Vector3(), 1 / 60); assert.ok(Math.abs(sky.mesh.rotation.y - Math.PI / 6) < 1e-9); }
});

test('scene.ts feeds the camera heading before the strip update, on its own line (source pin)', () => {
  const scene = readFileSync(new URL('../src/fight/scene.ts', import.meta.url), 'utf8');
  assert.match(scene, /skyline\?\.heading\(camera\);\n\s*skyline\?\.update\(camera\.position, dt\);/);
});

test('the face row validates, and under B the face centre sits in the clear sky band above the HUD at 375 (stills: screen top +4.3 deg, HUD to -4, sand melt from -9 deg)', () => {
  const bad = (patch) => { const s = structuredClone(STAGE); Object.assign(s.skyline.face, patch); return validateFile('stage', s).join('\n'); };
  assert.match(bad({ u: 1.5 }), /face\.u/); assert.match(bad({ v: -0.1 }), /face\.v/); assert.match(bad({ w: 1 }), /face\.w: unknown key/);
  const none = structuredClone(STAGE); delete none.skyline.face;
  assert.match(validateFile('stage', none).join('\n'), /skyline\.face/);
  const b = STAGE.skyline.views.variants.b, h = b.heightMetres > 0 ? b.heightMetres : SKYLINE.heightMetres;
  const deg = (m) => Math.atan(m / SKYLINE.radius) * 180 / Math.PI;
  const face = deg((SKYLINE.horizonFraction - SKYLINE.face.v) * h - b.dropMetres);   // elevation of the face centre from the eye
  assert.ok(face <= -4 && face >= -9, `face centre at ${face.toFixed(1)} deg`);
  assert.ok(deg(SKYLINE.horizonFraction * h - b.dropMetres) >= 5, 'the strip top stays above the top of the phone screen (no flat-sky edge behind the bars)');
});
