// The duel camera's zoom (Dom 2026-10-27, "just add 10%"): data/fight.json camera.zoom 1.1, ?zoom=<n> to A/B on a phone, zoom 1 = today's lens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cameraZoom, fovForZoom, BASE_FOV, ZOOM_LIMITS } from '../src/fight/camera-zoom.ts';
import { validateFile } from '../src/sim/validate.js';

const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));
test('the shipped row is pinned: camera.zoom 1.1, limits 0.5..2, and the row validates', () => {
  assert.equal(FIGHT.camera.zoom, 1.1);
  assert.deepEqual([...ZOOM_LIMITS], [0.5, 2]);
  assert.deepEqual(validateFile('fight', FIGHT), []);
});

test('the base lens is the scene camera\'s 51 degrees (zoom 1 = today\'s camera exactly) (behaviour half; the source pins moved to test/source-pins/)', () => {

  assert.equal(BASE_FOV, 51);
  assert.equal(fovForZoom(1), 51);   // the very same number: the projection matrix is bit-identical, so the render is pixel-equal
});

test('zoom 1.1 makes the picture 10% larger: size on screen goes as 1 / tan(fov / 2)', () => {
  const t = (fov) => Math.tan(fov * Math.PI / 360);
  for (const z of [0.5, 0.9, 1, 1.1, 1.5, 2]) assert.ok(Math.abs(t(BASE_FOV) / t(fovForZoom(z)) - z) < 1e-12, String(z));
  assert.ok(fovForZoom(1.1) < 51 && fovForZoom(1.1) > 46);
});

test('?zoom= replaces the row inside the limits; anything else keeps the row', () => {
  assert.equal(cameraZoom(1.1, ''), 1.1);
  assert.equal(cameraZoom(1.1, '?zoom=1'), 1);
  assert.equal(cameraZoom(1.1, '?zoom=1.0'), 1);
  assert.equal(cameraZoom(1.1, '?foo=2&zoom=1.25'), 1.25);
  assert.equal(cameraZoom(1.1, '?zoom=0.5'), 0.5);
  assert.equal(cameraZoom(1.1, '?zoom=2'), 2);
  for (const bad of ['?zoom=', '?zoom=abc', '?zoom=0.49', '?zoom=2.01', '?zoom=0', '?zoom=-1', '?zoom=NaN', '?zoom=Infinity']) assert.equal(cameraZoom(1.1, bad), 1.1, bad);
});

test('the validator refuses a missing, non-finite or out-of-range camera.zoom', () => {
  const withZoom = (zoom) => { const c = structuredClone(FIGHT); if (zoom === undefined) delete c.camera.zoom; else c.camera.zoom = zoom; return validateFile('fight', c); };
  assert.deepEqual(withZoom(0.5), []); assert.deepEqual(withZoom(2), []); assert.deepEqual(withZoom(1), []);
  for (const bad of [undefined, 0.49, 2.01, 0, -1, NaN, Infinity, '1.1', null]) assert.equal(withZoom(bad).length, 1, String(bad));
});
