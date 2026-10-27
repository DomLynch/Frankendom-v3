// ?skyview=a|b|c (src/fight/skyview.ts, data/stage.json skyline.views): the rows validate, no link = today's look exactly, the wiring and the maths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { validateFile } from '../src/sim/validate.js';
import { SKYLINE, centreOffsetY, createSkyline } from '../src/fight/skyline.ts';
import { SKYVIEWS, skyViewFor, applyFog, fadeAlpha, fadeFloor } from '../src/fight/skyview.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const STAGE = JSON.parse(read('../data/stage.json'));
const bad = (patch, id = 'b') => { const s = structuredClone(STAGE); Object.assign(s.skyline.views.variants[id], patch); return validateFile('stage', s).join('\n'); };

test('the shipped views validate and name three variants', () => {
  assert.deepEqual(validateFile('stage', STAGE), []);
  assert.deepEqual(Object.keys(SKYVIEWS.variants), ['a', 'b', 'c']);
  assert.equal(SKYVIEWS.query, 'skyview');
});

test('the validator refuses bad view rows', () => {
  assert.match(bad({ fogColor: 'red' }), /fogColor/);
  assert.match(bad({ fogDensity: -1 }), /fogDensity/);
  assert.match(bad({ fadeStartDegrees: 10, fadeEndDegrees: 20 }), /fadeStartDegrees/);
  assert.match(bad({ fadeStartDegrees: 95, fadeEndDegrees: 20 }), /fadeStartDegrees/);
  assert.match(bad({ fadeStartDegrees: 0, fadeEndDegrees: 0 }), /^$/);   // both 0 = off is fine
  assert.match(bad({ dropMetres: 500 }), /dropMetres/);
  assert.match(bad({ dropMetres: 60, heightMetres: 400 }), /far plane/);
  assert.match(bad({ brightness: NaN }), /brightness/);
  assert.match(bad({ heightMetres: 2 }), /heightMetres/);
  assert.match(bad({ extra: 1 }), /extra: unknown key/);
  const none = structuredClone(STAGE); delete none.skyline.views.variants.a.brightness;
  assert.match(validateFile('stage', none).join('\n'), /variants\.a\.brightness/);
  const same = structuredClone(STAGE); same.skyline.views.query = 'sky';
  assert.match(validateFile('stage', same).join('\n'), /views\.query/);
});

test('the default is today: no link, an unknown word, or ?sky=v1 builds no variant', () => {
  assert.equal(skyViewFor(''), null);
  assert.equal(skyViewFor('?skyview=z'), null);
  assert.equal(skyViewFor('?skyview=constructor'), null);
  assert.equal(skyViewFor('?skyview=toString'), null);
  assert.equal(skyViewFor('?skyview=b'), SKYVIEWS.variants.b);
  assert.equal(skyViewFor('?foo=1&skyview=a'), SKYVIEWS.variants.a);
});

test('the default equals today: no view = the row as it was (centre, height, brightness, fog, floor)', () => {
  assert.equal(centreOffsetY(SKYLINE), 100 / 2 - (1 - 0.88) * 100);   // today's 38 m
  assert.equal(centreOffsetY(SKYLINE, null), centreOffsetY(SKYLINE));
  const scene = new THREE.Scene();
  const sky = createSkyline(scene, '', SKYLINE, () => new Promise(() => {}));
  assert.equal(sky.mesh.geometry.parameters.height, 100);
  assert.equal(sky.mesh.material.color.r, 0.9);
  sky.update(new THREE.Vector3(0, 2, 0), 0);
  assert.equal(sky.mesh.position.y, 2 + 38);
  assert.deepEqual(STAGE.fog, { near: 40, far: 120 }); assert.equal(STAGE.duel.fogDensity, 0.006);
  assert.deepEqual(STAGE.ground, { size: 400, color: '#6b655f' });
  assert.deepEqual(STAGE.grid, { size: 80, divisions: 80, center: '#857d75', lines: '#7a736c' });
  assert.equal(SKYLINE.brightness, 0.9); assert.equal(SKYLINE.heightMetres, 100); assert.equal(SKYLINE.radius, 150);
  const scene2 = read('../src/fight/scene.ts');
  assert.match(scene2, /const skyView = skylineOn\(pageSearch\) \? skyViewFor\(pageSearch\) : null;/);   // no link: null, and every use below is gated on it
  assert.match(scene2, /if \(skyView\) applyFog\(scene, skyView\);/);
  assert.match(scene2, /const floorFade = skyView \? fadeFloor\(arena\.group, skyView, -900\) : null;/);
  assert.match(scene2, /\n\s*floorFade\?\.\(camera\.position\);\n/);
});

test('a lowered strip sits dropMetres lower; a view sets its own brightness and height', () => {
  const view = { ...SKYVIEWS.variants.c, dropMetres: 10, heightMetres: 120, brightness: 0.5 };
  assert.equal(centreOffsetY(SKYLINE, view), 60 - 0.12 * 120 - 10);
  const sky = createSkyline(new THREE.Scene(), '', SKYLINE, () => new Promise(() => {}), view);
  assert.equal(sky.mesh.geometry.parameters.height, 120); assert.equal(sky.mesh.material.color.r, 0.5);
  sky.update(new THREE.Vector3(0, 0, 0), 0);
  assert.equal(sky.mesh.position.y, centreOffsetY(SKYLINE, view));
  assert.equal(centreOffsetY(SKYLINE, { ...view, dropMetres: 0, heightMetres: 0 }), 38);   // 0 height = the row's
});

test('fog: a variant sets the haze colour and density; a 0 density / empty colour leaves the scene its own', () => {
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2('#9db7d6', 0.006);
  applyFog(scene, SKYVIEWS.variants.c);
  assert.equal(scene.fog.density, 0.006); assert.equal(scene.fog.color.getHexString(), '9db7d6');
  applyFog(scene, SKYVIEWS.variants.a);
  assert.equal(scene.background, null);   // (no background set in this scene)
  const flat = new THREE.Scene(); flat.background = new THREE.Color('#9db7d6'); flat.fog = new THREE.FogExp2('#9db7d6', 0.006);
  applyFog(flat, SKYVIEWS.variants.b);
  assert.equal('#' + flat.background.getHexString(), SKYVIEWS.variants.b.fogColor);   // the flat sky takes the haze colour too
  assert.equal(scene.fog.density, SKYVIEWS.variants.a.fogDensity); assert.equal('#' + scene.fog.color.getHexString(), SKYVIEWS.variants.a.fogColor);
});

test('the fade is by angle below the horizon: solid when steep, gone when shallow, smooth between; off band = never fades', () => {
  assert.equal(fadeAlpha(40, 25.5, 20.5), 1); assert.equal(fadeAlpha(5, 25.5, 20.5), 0);
  assert.equal(fadeAlpha(23, 25.5, 20.5), 0.5);
  assert.equal(fadeAlpha(5, 0, 0), 1);
  assert.equal(fadeFloor(new THREE.Group(), SKYVIEWS.variants.a, -900), null);
  assert.equal(fadeFloor(new THREE.Group(), SKYVIEWS.variants.c, -900), null);
  const group = new THREE.Group(), floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial());
  group.add(floor);
  const move = fadeFloor(group, SKYVIEWS.variants.b, -900);
  assert.equal(typeof move, 'function'); assert.equal(floor.material.transparent, true); assert.equal(floor.renderOrder, -900);
  const shader = { uniforms: {}, vertexShader: 'void main() {\n#include <project_vertex>\n}', fragmentShader: 'void main() {\n#include <opaque_fragment>\n}' };
  floor.material.onBeforeCompile(shader, {});
  assert.match(shader.fragmentShader, /smoothstep\(fadeBand\.y, fadeBand\.x, fadeDepression/); assert.match(shader.vertexShader, /vFadeWorld = /);
  move(new THREE.Vector3(1, 2, 3)); assert.equal(shader.uniforms.fadeEye.value.z, 3);
  assert.deepEqual(shader.uniforms.fadeBand.value.toArray(), [SKYVIEWS.variants.b.fadeStartDegrees, SKYVIEWS.variants.b.fadeEndDegrees]);
});

test('no literals: skyview.ts reads its numbers from the row', () => {
  const src = read('../src/fight/skyview.ts');
  for (const k of ['fogColor', 'fogDensity', 'fadeStartDegrees', 'fadeEndDegrees']) assert.match(src, new RegExp(`view\\.${k}`));
  assert.match(read('../src/fight/skyline.ts'), /view\.dropMetres/);
});
