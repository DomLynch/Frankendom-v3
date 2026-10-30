// The skyline backdrop (src/fight/skyline.ts, data/stage.json `skyline`): the row validates, ?sky=v1 builds nothing, the fetch waits for the first frame, the sand floor is untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import * as THREE from 'three';
import { validateFile } from '../src/sim/validate.js';
import { createSkyline, skylineOn, centreOffsetY, SKYLINE } from '../src/fight/skyline.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const STAGE = JSON.parse(read('../data/stage.json'));

test('the shipped row is pinned and the stage file validates', () => {
  assert.equal(SKYLINE.on, true);
  assert.equal(SKYLINE.query, 'sky'); assert.equal(SKYLINE.v1, 'v1');
  assert.equal(SKYLINE.file, 'skyline-alien.webp');
  assert.deepEqual(validateFile('stage', STAGE), []);
});

test('the validator refuses bad skyline rows', () => {
  const bad = (patch) => { const s = structuredClone(STAGE); Object.assign(s.skyline, patch); return validateFile('stage', s).join('\n'); };
  assert.match(bad({ radius: 500 }), /skyline\.radius/);
  assert.match(bad({ radius: 160, heightMetres: 400 }), /far plane/);
  assert.match(bad({ brightness: NaN }), /skyline\.brightness/);
  assert.match(bad({ file: '../x.webp' }), /skyline\.file/);
  assert.match(bad({ file: 'x.png' }), /skyline\.file/);
  assert.match(bad({ horizonFraction: 1.2 }), /skyline\.horizonFraction/);
  assert.match(bad({ fadeSeconds: -1 }), /skyline\.fadeSeconds/);
  assert.match(bad({ seamOverlapPx: 1.5 }), /skyline\.seamOverlapPx/);
  assert.match(bad({ extra: 1 }), /skyline\.extra: unknown key/);
  const none = structuredClone(STAGE); delete none.skyline;
  assert.match(validateFile('stage', none).join('\n'), /stage\.skyline: must be an object/);
});

test('the sand floor, ground colour, grid, fog and flat sky rows are as they were', () => {
  assert.equal(STAGE.sky, '#9db7d6');
  assert.deepEqual(STAGE.fog, { near: 40, far: 120 });
  assert.deepEqual(STAGE.ground, { size: 400, color: '#6b655f' });
  assert.deepEqual(STAGE.grid, { size: 80, divisions: 80, center: '#857d75', lines: '#7a736c' });
  assert.equal(STAGE.duel.floor, 'sand'); assert.equal(STAGE.duel.fogDensity, 0.006);
});

test('?sky=v1 (and on:false) builds the old flat sky: no mesh, no fetch', () => {
  assert.equal(skylineOn('?sky=v1'), false);
  assert.equal(skylineOn('?foo=1&sky=v1'), false);
  assert.equal(skylineOn(''), true);
  assert.equal(skylineOn('?sky=other'), true);
  assert.equal(skylineOn('', { ...SKYLINE, on: false }), false);
  const scene = new THREE.Scene(); let fetched = 0;
  assert.equal(createSkyline(scene, '?sky=v1', SKYLINE, () => { fetched++; return Promise.reject(Error('no')); }), null);
  assert.equal(scene.children.length, 0); assert.equal(fetched, 0);
});

test('the horizon of the strip sits at the camera eye level', () => {
  const row = { ...SKYLINE, heightMetres: 100, horizonFraction: 0.9 };
  assert.equal(centreOffsetY(row), 40);   // the centre is 40 m above the eye: the horizon (10 m up from the bottom) is level with it
  assert.equal(centreOffsetY({ ...row, horizonFraction: 0.5 }), 0);
});

test('the build ships the baked file, the wrap is cross-faded, and it is lighter than the 500 KB ceiling', () => {
  const size = statSync(new URL(`../src/assets/skyline/${SKYLINE.file}`, import.meta.url)).size;
  assert.ok(size > 50_000 && size < 500_000, String(size));
  const buf = readFileSync(new URL(`../src/assets/skyline/${SKYLINE.file}`, import.meta.url));
  assert.equal(buf.toString('latin1', 0, 4), 'RIFF'); assert.equal(buf.toString('latin1', 8, 12), 'WEBP');
  assert.ok(SKYLINE.seamOverlapPx > 0);
});

test('no literals: the whole strip (?skyplate=v1) is built from the row; each knob moves the thing it names', () => {
  const mk = (patch) => createSkyline(new THREE.Scene(), '?skyplate=v1', { ...SKYLINE, ...patch }, () => new Promise(() => {}));
  const base = mk({}), g = base.mesh.geometry.parameters;
  const moved = mk({ radius: g.radiusTop + 7, heightMetres: g.height + 5, brightness: 0.37, yawDegrees: SKYLINE.yawDegrees + 11 });
  assert.equal(moved.mesh.geometry.parameters.radiusTop, g.radiusTop + 7, 'radius');
  assert.equal(moved.mesh.geometry.parameters.height, g.height + 5, 'heightMetres');
  assert.equal(moved.mesh.material.color.r, 0.37, 'brightness');
  assert.ok(Math.abs(moved.mesh.rotation.y - THREE.MathUtils.degToRad(SKYLINE.yawDegrees + 11)) < 1e-12, 'yawDegrees');
  for (const horizonFraction of [0.3, 0.8]) {
    const row = { ...SKYLINE, horizonFraction }, sky = mk({ horizonFraction });
    sky.update(new THREE.Vector3(0, 0, 0), 0);
    assert.equal(sky.mesh.position.y, centreOffsetY(row), `horizonFraction ${horizonFraction} sets the strip's height`);
  }
  assert.notEqual(centreOffsetY({ ...SKYLINE, horizonFraction: 0.3 }), centreOffsetY({ ...SKYLINE, horizonFraction: 0.8 }));
});

test('a landed strip fades in over the row time; a failed fetch leaves the flat sky', async () => {
  const lateArt = await import('../src/late-art.ts');
  const scene = new THREE.Scene();
  const row = { ...SKYLINE, loadAfterFirstFrameMs: 0, fadeSeconds: 1 };
  const sky = createSkyline(scene, '?skyplate=v1', row, () => Promise.resolve(new THREE.Texture()));   // the whole strip; the plate has its own tests (skyplate.test.mjs)
  assert.equal(sky.state, 'idle'); assert.equal(sky.mesh.visible, false);
  lateArt.firstFrameDrawn(() => {});
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(sky.state, 'fading'); assert.equal(sky.mesh.visible, true);
  sky.update(new THREE.Vector3(3, 2, 5), 0.5);
  assert.equal(sky.opacity, 0.5);
  assert.equal(sky.mesh.position.x, 3); assert.equal(sky.mesh.position.y, 2 + centreOffsetY(row));
  sky.update(new THREE.Vector3(3, 2, 5), 0.6);
  assert.equal(sky.state, 'on'); assert.equal(sky.opacity, 1);
  const failed = createSkyline(scene, '', row, () => Promise.reject(Error('offline')));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(failed.state, 'failed'); assert.equal(failed.mesh.visible, false);
});
