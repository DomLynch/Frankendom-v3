// The skyline yaw follow (src/fight/skyline.ts, data/stage.json skyline.yawFollow): the strip turns by yawFollow x the camera's yaw so the alien stays in the sky; ?skyfollow=v1 = fixed in world yaw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { validateFile } from '../src/sim/validate.js';
import { createSkyline, skyFollowOn, headingOf, shortestTurn, stripYaw, SKYLINE } from '../src/fight/skyline.ts';

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
  assert.match(bad({ followOffsetDegrees: 900 }), /skyline\.followOffsetDegrees/);
  assert.match(bad({ followOffsetDegrees: 'x' }), /skyline\.followOffsetDegrees/);
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

test('shortestTurn folds a difference into -pi..pi (the wrap-around from +pi to -pi is a small turn, not a lap)', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(near(shortestTurn(-3.1 - 3.1), 2 * Math.PI - 6.2));   // +3.1 -> -3.1 is 0.083 round the back, not -6.2
  assert.ok(near(shortestTurn(3.1 + 3.1), 6.2 - 2 * Math.PI));
  assert.ok(near(shortestTurn(0.3), 0.3)); assert.ok(near(shortestTurn(-0.3), -0.3));
  assert.ok(near(shortestTurn(4 * Math.PI + 0.2), 0.2));
  assert.ok(Math.abs(shortestTurn(Math.PI)) <= Math.PI + 1e-12);
});

test('stripYaw is the fixed yaw plus yawFollow x the camera yaw', () => {
  const row = { ...SKYLINE, yawDegrees: 90, followOffsetDegrees: 0, yawFollow: 0.5 };
  assert.ok(Math.abs(stripYaw(row, 2) - (Math.PI / 2 + 1)) < 1e-12);
  assert.equal(stripYaw({ ...row, yawFollow: 0 }, 5), Math.PI / 2);
  assert.ok(Math.abs(stripYaw({ ...row, followOffsetDegrees: -90 }, 2) - 1) < 1e-12);   // the follow-only offset adds to the fixed yaw
  assert.equal(SKYLINE.yawDegrees, 0);   // ?skyfollow=v1 is the look before: fixed at 0
});

test('the strip turns after the camera, smoothly through +-pi, and never builds up an offset from lapping', () => {
  const F = 0.97, row = { ...SKYLINE, yawDegrees: 0, followOffsetDegrees: 0, yawFollow: F, yawFollowSeconds: 0.3 };
  const sky = createSkyline(new THREE.Scene(), '', row, never);
  let last = 0;
  for (let i = 0; i <= 600; i++) {   // three lots of a full turn, the camera's heading wrapping at +-pi each lap
    sky.heading(camAt(i * 0.03)); sky.update(new THREE.Vector3(), 1 / 60);
    if (i > 0) assert.ok(Math.abs(sky.mesh.rotation.y - last) < 0.03 + 0.02, `frame ${i}: ${Math.abs(sky.mesh.rotation.y - last)}`);   // no jump at the wrap: the 0.03 x 2pi step is eased
    last = sky.mesh.rotation.y;
  }
  const hold = camAt(600 * 0.03);   // stopped, 18 rad (about 2.9 laps) on
  for (let i = 0; i < 1200; i++) { sky.heading(hold); sky.update(new THREE.Vector3(), 1 / 60); }
  const d = hold.getWorldDirection(new THREE.Vector3()), h = headingOf(d.x, d.z);
  assert.ok(Math.abs(shortestTurn(sky.mesh.rotation.y - h)) <= (1 - F) * Math.PI + 1e-6, 'at most (1 - yawFollow) x 180 degrees off the view, however many laps');
  assert.ok(Math.abs(sky.yaw - sky.mesh.rotation.y) < 1e-12);
});

test('the follow starts on target and then eases (yawFollowSeconds), never snapping', () => {
  const row = { ...SKYLINE, yawDegrees: 0, followOffsetDegrees: 0, yawFollow: 1, yawFollowSeconds: 1 };
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
  const sky = createSkyline(new THREE.Scene(), '?skyfollow=v1&skyplate=v1', { ...SKYLINE, yawDegrees: 30 }, never);
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
