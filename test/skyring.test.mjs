// The sky ring (src/fight/skyring.ts, data/stage.json skyline.ring; Dom 2026-10-28): rows validate, a plate is chosen by the view's bearing, a plate is fetched only when the camera turns to it
// (never on the first visit), ?skyring=v1 is today's single plate that follows the view, and the baked pictures ship at the sizes the rows say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { validateFile } from '../src/sim/validate.js';
import { SKYLINE, createSkyline } from '../src/fight/skyline.ts';
import { angularGap, bearingOf, bearingTheta, createSkyRing, facingPlate, platesToLoad, ringAlpha, ringFileFor, ringGeometry, ringOn, ringSize } from '../src/fight/skyring.ts';

const STAGE = JSON.parse(readFileSync(new URL('../data/stage.json', import.meta.url), 'utf8'));
const R = SKYLINE.ring, plate = (id) => R.plates.find((p) => p.id === id);
const bad = (mut) => { const s = structuredClone(STAGE); mut(s.skyline.ring); return validateFile('stage', s); };
const tex = (w = 1888, h = 722) => { const t = new THREE.Texture(); t.image = { width: w, height: h }; return t; };
const camAt = (yaw) => { const c = new THREE.PerspectiveCamera(); c.rotation.y = yaw; c.updateMatrixWorld(true); return c; };
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test('the shipped ring row validates and bad rows are refused', () => {
  assert.deepEqual(validateFile('stage', STAGE), []);
  assert.deepEqual(R.plates.map((p) => [p.id, p.compassDegrees]), [['east', 90], ['south', 180], ['west', 270]]);
  assert.equal(R.query, 'skyring'); assert.equal(R.v1, 'v1'); assert.equal(R.spanDegrees, 90 + R.overlapDegrees);
  const cases = [(r) => { r.extra = 1; }, (r) => { r.on = 'yes'; }, (r) => { r.query = 'skyplate'; }, (r) => { r.query = 'sky'; }, (r) => { r.spanDegrees = 120; }, (r) => { r.overlapDegrees = 3; }, (r) => { r.plates[0].dropMetres = -1; }, (r) => { r.plates[1].dropMetres = 'low'; }, (r) => { delete r.plates[2].dropMetres; },
    (r) => { r.orderOffset = 40; }, (r) => { r.orderOffset = 59; }, (r) => { r.lazy.loadWithinDegrees = 95; }, (r) => { r.lazy = null; }, (r) => { r.desktop.minViewportWidth = 'wide'; },
    (r) => { r.bakedAspect = 3; }, (r) => { r.bake.cropLeftPx = -1; }, (r) => { r.plates = []; }, (r) => { r.plates[0].id = 'north'; }, (r) => { r.plates[1].id = 'east'; },
    (r) => { r.plates[1].compassDegrees = 90; }, (r) => { r.plates[0].compassDegrees = 360; }, (r) => { r.plates[0].mobile = '../x.webp'; }, (r) => { r.plates[0].desktop = r.plates[0].mobile; },
    (r) => { r.plates[0].rampLeftDegrees = 40; }, (r) => { r.plates[2].grade.tint = 'orange'; }, (r) => { r.plates[2].grade.brightness = 0; }, (r) => { r.plates[0].grade = null; },
    (r) => { r.plates[0].extra = 1; }, (r) => { r.plates[0].on = 1; }, (r) => { r.plates[0].bake.layers = ['../x.png']; }, (r) => { delete r.plates[0].bake; }];
  for (const [i, m] of cases.entries()) assert.ok(bad(m).length >= 1, `bad ring row #${i} is refused`);
  const none = structuredClone(STAGE); delete none.skyline.ring; assert.ok(validateFile('stage', none).length >= 1);
});

test('the view bearing and the plate it faces: north 0, east 90, south 180, west 270 (clockwise), by the camera heading', () => {
  assert.ok(Math.abs(bearingOf(0)) < 1e-9);
  assert.ok(Math.abs(bearingOf(-Math.PI / 2) - 90) < 1e-9);   // a right turn (negative heading) is toward east
  assert.ok(Math.abs(bearingOf(Math.PI / 2) - 270) < 1e-9);
  assert.ok(Math.abs(bearingOf(Math.PI) - 180) < 1e-9);
  for (const [deg, want] of [[0, 'north'], [20, 'north'], [44, 'north'], [46, 'east'], [90, 'east'], [134, 'east'], [136, 'south'], [180, 'south'], [224, 'south'], [226, 'west'], [270, 'west'], [314, 'west'], [316, 'north'], [359, 'north']]) assert.equal(facingPlate(deg, R), want, `${deg}`);
  assert.equal(angularGap(350, 10), 20); assert.equal(angularGap(0, 180), 180); assert.equal(angularGap(90, 270), 180);
  const off = structuredClone(R); off.plates[2].on = false; assert.notEqual(facingPlate(270, off), 'west');   // a plate that is off is never faced
  assert.equal(bearingTheta(0), Math.PI); assert.ok(Math.abs(bearingTheta(90) - Math.PI / 2) < 1e-9);   // east is +X, north -Z
});

test('lazy trigger: nothing is earned at the first heading; a plate is earned within loadWithinDegrees of its bearing', () => {
  assert.deepEqual(platesToLoad(0, R), []); assert.deepEqual(platesToLoad(8, R), []); assert.deepEqual(platesToLoad(350, R), []);
  assert.ok(R.lazy.loadWithinDegrees < 90, 'the first heading is 90 degrees from east and west');
  assert.deepEqual(platesToLoad(R.lazy.loadWithinDegrees === 70 ? 20 : 90 - R.lazy.loadWithinDegrees, R).map((p) => p.id), ['east']);
  assert.deepEqual(platesToLoad(19, R).map((p) => p.id), []);
  assert.deepEqual(platesToLoad(180, R).map((p) => p.id), ['south']);
  assert.deepEqual(platesToLoad(135, R).map((p) => p.id).sort(), ['east', 'south']);
  assert.deepEqual(platesToLoad(340, R).map((p) => p.id), ['west']);
  const off = structuredClone(R); off.plates[0].on = false; assert.deepEqual(platesToLoad(90, off), []);
});

test('the ring fetches a plate once, only when asked, the phone picture on a phone and the desktop one on a wide screen', async () => {
  const calls = []; const load = (f) => { calls.push(f); return Promise.resolve(tex()); };
  const ring = createSkyRing({ row: R, radius: 150, horizonY: -24, shade: 0.85, viewportWidth: 375, load });
  ring.request(0); ring.request(8); ring.request(350); await wait(); assert.deepEqual(calls, []);
  ring.request(25); ring.request(25); await wait(); assert.deepEqual(calls, ['ring-east-m.webp']); assert.equal(ring.state('east'), 'fading'); assert.equal(ring.state('south'), 'idle');
  ring.request(180); await wait(); assert.deepEqual(calls, ['ring-east-m.webp', 'ring-south-m.webp']);
  for (let i = 0; i < 100; i++) ring.update(new THREE.Vector3(), 0.05);
  assert.equal(ring.state('east'), 'on'); assert.equal(ring.group.children.length, 2);
  const m = ring.group.getObjectByName('skyring-east'); assert.equal(m.material.opacity, 1); assert.ok(Math.abs(m.position.y - (-24 - plate('east').dropMetres + ringSize(R, 150, 1888, 722).height / 2)) < 1e-9, 'its bottom edge is dropMetres under the north horizon');
  ring.dispose();
  const wide = []; const r2 = createSkyRing({ row: R, radius: 150, horizonY: -24, shade: 1, viewportWidth: 1440, load: (f) => { wide.push(f); return Promise.resolve(tex(3776, 1443)); } });
  r2.request(180); await wait(); assert.deepEqual(wide, ['ring-south.webp']); r2.dispose();
  assert.equal(ringFileFor(plate('west'), R, 1023), 'ring-west-m.webp'); assert.equal(ringFileFor(plate('west'), R, 1024), 'ring-west.webp');
});

test('a failed fetch leaves the plate out and the page alone; a plate that is off is never fetched', async () => {
  const calls = []; const ring = createSkyRing({ row: { ...R, plates: R.plates.map((p) => (p.id === 'west' ? { ...p, on: false } : p)) }, radius: 150, horizonY: -24, shade: 1, viewportWidth: 375, load: (f) => { calls.push(f); return Promise.reject(new Error('404')); } });
  ring.request(270); ring.request(180); await wait(); assert.deepEqual(calls, ['ring-south-m.webp']); assert.equal(ring.state('south'), 'failed'); assert.equal(ring.state('west'), 'idle'); assert.equal(ring.group.children.length, 0);
});

test('geometry: each arc spans spanDegrees centred on its bearing, native aspect, picture left on the viewer left; edges ramp, the middle is solid', () => {
  for (const p of R.plates) {
    const g = ringGeometry(p, R, 150, 1888, 722), { width, height } = ringSize(R, 150, 1888, 722);
    assert.ok(Math.abs(g.parameters.thetaLength - THREE.MathUtils.degToRad(R.spanDegrees)) < 1e-9);
    assert.ok(Math.abs(g.parameters.thetaStart + g.parameters.thetaLength / 2 - bearingTheta(p.compassDegrees)) < 1e-9);
    assert.ok(Math.abs(width / height - 1888 / 722) < 1e-9); assert.ok(height < 2 * SKYLINE.plate.sky.halfHeightMetres);
    const uv = g.getAttribute('uv'), n = R.segments;   // seen from inside, a vertex further round (larger theta) is further left: the first column (smallest theta) is the picture's RIGHT edge (u 1), the last its left (u 0)
    assert.ok(Math.abs(uv.getX(0) - 1) < 1e-9 && Math.abs(uv.getX(n)) < 1e-9, `${p.id}: u runs against theta`);
    assert.equal(ringAlpha(p, R, 0.5, 0.5), 1);
  }
  const s = plate('south'); assert.equal(ringAlpha(s, R, 0, 0.5), 0); assert.ok(ringAlpha(s, R, 0.05, 0.5) > 0 && ringAlpha(s, R, 0.05, 0.5) < 1); assert.equal(ringAlpha(s, R, 1, 0.5), 1);   // south ramps in on its left, not its right
  assert.equal(ringAlpha(plate('west'), R, 1, 0.5), 0); assert.equal(ringAlpha(s, R, 0.5, 0), 0); assert.equal(ringAlpha(s, R, 0.5, 1), 0);
});

test('createSkyline: ?skyring=v1 is today (no ring, the plate follows the view); the default builds the ring but fetches nothing on the first visit', async () => {
  const lateArt = await import('../src/late-art.ts'); lateArt.firstFrameDrawn(() => {});
  const baseCalls = [], ringCalls = [], row = { ...SKYLINE, loadAfterFirstFrameMs: 0 };
  const mk = (search) => createSkyline(new THREE.Scene(), search, row, () => { baseCalls.push(search); return Promise.resolve(tex(4096, 1024)); }, null, (f) => { ringCalls.push(f); return Promise.resolve(tex()); }, 375);
  const frames = (s, yaw, n) => { for (let i = 0; i < n; i++) { s.heading(camAt(yaw)); s.update(new THREE.Vector3(), 1 / 60); } };
  assert.equal(ringOn('?skyring=v1', R), false); assert.equal(ringOn('', R), true); assert.equal(ringOn('', { ...R, on: false }), false);
  const old = mk('?skyring=v1'); assert.ok(old);
  frames(old, 0.14, 5); await wait(40); frames(old, 0.14, 600);
  const yawV1 = old.yaw; frames(old, 2.0, 600); assert.ok(Math.abs(old.yaw - yawV1) > 0.5, '?skyring=v1 still follows the view');
  assert.deepEqual(ringCalls, [], '?skyring=v1 fetches no ring plate'); assert.ok(!old.mesh.parent?.getObjectByName('skyring'));
  const sky = mk(''); assert.ok(sky);
  frames(sky, 0.14, 5); await wait(40); frames(sky, 0.14, 600);   // the first heading, about 8 degrees, held
  assert.equal(sky.state, 'on'); assert.deepEqual(ringCalls, [], 'no ring plate on the first visit'); assert.equal(baseCalls.length, 2);   // each skyline fetches its own north picture only
  const y0 = sky.yaw; frames(sky, -0.14 - Math.PI / 2, 600); assert.ok(Math.abs(sky.yaw - y0) < 1e-9, 'with the ring the sky is fixed in the world');
  await wait(40); assert.deepEqual(ringCalls, ['ring-east-m.webp'], 'turned right: east is fetched, and only east');
  frames(sky, Math.PI, 5); await wait(40); assert.deepEqual(ringCalls, ['ring-east-m.webp', 'ring-south-m.webp']);
  old.dispose(); sky.dispose();
});

test('the baked pictures ship: WebP at the sizes the rows say, the first visit fetches none of them, the weights are in the budget table', () => {
  const dim = (buf) => { const vp8x = buf.toString('latin1', 12, 16) === 'VP8X'; return vp8x ? [1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)), 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16))] : [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff]; };
  const B = R.bake, w = B.sourceWidthPx - B.cropLeftPx - B.cropRightPx, h = B.bottomPx - B.topPx;
  for (const p of R.plates) {
    for (const [file, ww, hh, cap] of [[p.mobile, Math.round(w * B.mobileScale), Math.round(h * B.mobileScale), 150_000], [p.desktop, w, h, 400_000]]) {
      const buf = readFileSync(new URL(`../src/assets/skyline/${file}`, import.meta.url));
      assert.equal(buf.toString('latin1', 0, 4), 'RIFF'); assert.equal(buf.toString('latin1', 8, 12), 'WEBP'); assert.ok(buf.length < cap, `${file} ${buf.length}`);
      assert.deepEqual(dim(buf), [ww, hh], file);
    }
  }
  const main = readFileSync(new URL('../src/fight/scene.ts', import.meta.url), 'utf8') + readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!/ring-(east|south|west)/.test(main), 'no ring file is named in the first-visit code');
});
