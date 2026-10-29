// ?skyview=a|b|c (src/fight/skyview.ts, data/stage.json skyline.views): the rows validate, no link = today's look exactly, the wiring and the maths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { validateFile, SKYLINE_RIM_LIMIT } from '../src/sim/validate.js';
import { SKYLINE, SKYLINE_ORDER, skylineOn, centreOffsetY, createSkyline } from '../src/fight/skyline.ts';
import { SKYVIEWS, FLOOR_ORDER, skyViewFor, applyFog, fadeAlpha, fadeFloor } from '../src/fight/skyview.ts';

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
  assert.match(bad({ fadeStartDegrees: 0, fadeEndDegrees: 0, foeFade: false }), /^$/);   // both 0 = off is fine
  assert.match(bad({ dropMetres: 500 }), /dropMetres/);
  assert.match(bad({ dropMetres: 60, heightMetres: 400 }), /far plane/);
  assert.match(bad({ brightness: NaN }), /brightness/);
  assert.match(bad({ heightMetres: 2 }), /heightMetres/);
  assert.match(bad({ extra: 1 }), /extra: unknown key/);
  const none = structuredClone(STAGE); delete none.skyline.views.variants.a.brightness;
  assert.match(validateFile('stage', none).join('\n'), /variants\.a\.brightness/);
  const nodef = structuredClone(STAGE); nodef.skyline.views.default = 'zzz';
  assert.match(validateFile('stage', nodef).join('\n'), /views\.default/);
  const clash = structuredClone(STAGE); clash.skyline.views.v1 = 'a';
  assert.match(validateFile('stage', clash).join('\n'), /views\.v1/);
  const v1def = structuredClone(STAGE); v1def.skyline.views.default = 'v1';
  assert.deepEqual(validateFile('stage', v1def), []);   // defaulting to the look before is a legal row
  const same = structuredClone(STAGE); same.skyline.views.query = 'sky';
  assert.match(validateFile('stage', same).join('\n'), /views\.query/);
});

test('DEFAULT = B (Dom picked it): no link or an unknown word draws B; ?skyview=v1 is the look before; a|c still selectable; ?sky=v1 still the flat sky', () => {
  assert.equal(SKYVIEWS.default, 'b');   // the row names it, nothing in TS does
  assert.equal(skyViewFor(''), SKYVIEWS.variants.b);
  assert.equal(skyViewFor('?foo=1'), SKYVIEWS.variants.b);
  assert.equal(skyViewFor('?skyview=z'), SKYVIEWS.variants.b);
  assert.equal(skyViewFor('?skyview=constructor'), SKYVIEWS.variants.b);
  assert.equal(skyViewFor('?skyview=toString'), SKYVIEWS.variants.b);
  assert.equal(skyViewFor('?skyview=v1'), null);   // today's look: no melt, no lowering, no haze
  assert.equal(skyViewFor('?foo=1&skyview=v1'), null);
  assert.equal(skyViewFor('?skyview=b'), SKYVIEWS.variants.b);
  assert.equal(skyViewFor('?foo=1&skyview=a'), SKYVIEWS.variants.a);
  assert.equal(skyViewFor('?skyview=c'), SKYVIEWS.variants.c);
  assert.equal(SKYVIEWS.v1, 'v1');
  assert.equal(skyViewFor('', { ...SKYVIEWS, default: 'v1' }), null);   // a row that defaults to the look before
  assert.equal(skylineOn('?sky=v1'), false);   // the scene only asks skyViewFor when the strip is on, so ?sky=v1 builds none of it
  assert.match(read('../src/fight/scene.ts'), /const skyView = skylineOn\(pageSearch\) \? skyViewFor\(pageSearch\) : null;/);
});

test('B as shipped: melt by angle, lowered and taller strip, haze fog, a dimmer strip for the HUD', () => {
  const b = SKYVIEWS.variants.b;
  assert.ok(b.fadeStartDegrees > b.fadeEndDegrees && b.fadeEndDegrees > 0);
  assert.ok(b.dropMetres > 0 && b.heightMetres >= SKYLINE.heightMetres);
  assert.ok(b.brightness < SKYLINE.brightness);   // HUD readability over the cloud band
  assert.match(b.fogColor, /^#[0-9a-f]{6}$/i);
  // the strip's bottom edge, seen from the eye, sits no higher than where the sand is solid again: no flat-sky gap between the melt and the picture
  const bottom = Math.atan(((1 - SKYLINE.horizonFraction) * b.heightMetres + b.dropMetres) / SKYLINE.radius) * 180 / Math.PI;
  assert.ok(bottom >= b.fadeEndDegrees - 1, String(bottom));   // at or below where the sand has melted away: no gap; deeper than the solid-sand angle is fine (the sand hides the lower edge; Dom 2026-10-27 lowered B so the alien face is in the clear sky band)
});

test('the strip rim stays inside the camera: the base far plane (scene.ts) and the zone\'s longer one (zone-ground.json)', () => {
  const base = Number(/new THREE\.PerspectiveCamera\(\d+, 1, [\d.]+, (\d+)\)/.exec(read('../src/fight/scene.ts'))[1]);
  const zone = JSON.parse(read('../data/zone-ground.json')).cameraFarMetres;
  assert.equal(base, 180); assert.ok(zone >= base);   // the zone only lengthens the far plane (drawOpenGround)
  assert.ok(SKYLINE_RIM_LIMIT < base);
  for (const [id, w] of Object.entries(SKYVIEWS.variants)) {
    const h = w.heightMetres > 0 ? w.heightMetres : SKYLINE.heightMetres;
    const rim = Math.hypot(SKYLINE.radius, Math.max(Math.abs(SKYLINE.horizonFraction * h - w.dropMetres), Math.abs((1 - SKYLINE.horizonFraction) * h + w.dropMetres)));
    assert.ok(rim <= SKYLINE_RIM_LIMIT, `${id}: ${rim}`);
  }
});

test('?skyview=v1 equals the look before: no view = the row as it was (centre, height, brightness, fog, floor)', () => {
  assert.equal(centreOffsetY(SKYLINE), 100 / 2 - (1 - 0.88) * 100);   // today's 38 m
  assert.equal(centreOffsetY(SKYLINE, null), centreOffsetY(SKYLINE));
  const scene = new THREE.Scene();
  const sky = createSkyline(scene, '?skyplate=v1', SKYLINE, () => new Promise(() => {}));
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
  assert.match(scene2, /const floorFade = skyView \? fadeFloor\(arena\.group, skyView\) : null;/);
  assert.match(scene2, /\n\s*floorFade\?\.move\(terrainDraw \? fadeEye\.copy\(camera\.position\)\.setY\(camera\.position\.y - terrainHero\) : camera\.position\);/);   // re-pinned with the terrain (data/terrain.json): with no hills (terrainDraw null) the melt reads camera.position exactly as before
  assert.match(scene2, /drawOpenGround\(arena\.group, camera, sizing\); groundSnap = sizing\.snap; floorFade\?\.adopt\(arena\.group\);/);   // the zone swaps in a longer grid: it melts too
});

test('a lowered strip sits dropMetres lower; a view sets its own brightness and height', () => {
  const view = { ...SKYVIEWS.variants.c, dropMetres: 10, heightMetres: 120, brightness: 0.5 };
  assert.equal(centreOffsetY(SKYLINE, view), 60 - 0.12 * 120 - 10);
  const sky = createSkyline(new THREE.Scene(), '?skyplate=v1', SKYLINE, () => new Promise(() => {}), view);
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
  assert.equal(fadeFloor(new THREE.Group(), SKYVIEWS.variants.a), null);
  assert.equal(fadeFloor(new THREE.Group(), SKYVIEWS.variants.c), null);
  const group = new THREE.Group(), floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial());
  group.add(floor);
  const fade = fadeFloor(group, SKYVIEWS.variants.b);
  assert.equal(floor.material.transparent, true);
  assert.equal(floor.renderOrder, FLOOR_ORDER); assert.equal(FLOOR_ORDER, SKYLINE_ORDER + 100);   // just after the strip, tied to it, not a second number
  const shader = { uniforms: {}, vertexShader: 'void main() {\n#include <project_vertex>\n}', fragmentShader: 'void main() {\n#include <opaque_fragment>\n}' };
  floor.material.onBeforeCompile(shader, {});
  assert.match(shader.fragmentShader, /smoothstep\(fadeBand\.y, fadeBand\.x, fadeDepression/); assert.match(shader.vertexShader, /vFadeWorld = /);
  fade.move(new THREE.Vector3(1, 2, 3)); assert.equal(shader.uniforms.fadeEye.value.z, 3);
  assert.deepEqual(shader.uniforms.fadeBand.value.toArray(), [SKYVIEWS.variants.b.fadeStartDegrees, SKYVIEWS.variants.b.fadeEndDegrees]);
  // the zone's open ground swaps in a new grid after the scene is built: adopt melts it too, and a part already melted is not wrapped twice
  const grid = new THREE.GridHelper(10, 10); group.add(grid);
  assert.equal(grid.material.transparent, false);
  fade.adopt(group);
  assert.equal(grid.material.transparent, true); assert.equal(grid.renderOrder, FLOOR_ORDER);
  const hook = floor.material.onBeforeCompile; fade.adopt(group); assert.equal(floor.material.onBeforeCompile, hook);
});

test('no literals: skyview.ts reads its numbers from the row', () => {
  const src = read('../src/fight/skyview.ts');
  for (const k of ['fogColor', 'fogDensity', 'fadeStartDegrees', 'fadeEndDegrees']) assert.match(src, new RegExp(`view\\.${k}`));
  assert.match(read('../src/fight/skyline.ts'), /view\.dropMetres/);
});
