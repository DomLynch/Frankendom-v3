// The far opponent melts into the clouds where the sand does (src/fight/foefade.ts): same band as the floor, measured at his feet, never the hero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { validateFile } from '../src/sim/validate.js';
import { SKYVIEWS, fadeAlpha, skyViewFor } from '../src/fight/skyview.ts';
import { createFoeFade, depressionDegrees, foeFadeOn, foeFadeShader } from '../src/fight/foefade.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const STAGE = JSON.parse(read('../data/stage.json'));
const B = SKYVIEWS.variants.b;
const bad = (patch, id = 'b') => { const s = structuredClone(STAGE); Object.assign(s.skyline.views.variants[id], patch); return validateFile('stage', s).join('\n'); };

test('rows: foeFade is a validated boolean per variant, needs a band; the link words are rows', () => {
  assert.deepEqual(validateFile('stage', STAGE), []);
  assert.equal(B.foeFade, true); assert.equal(SKYVIEWS.variants.a.foeFade, false); assert.equal(SKYVIEWS.variants.c.foeFade, false);
  assert.equal(SKYVIEWS.foeFadeQuery, 'foefade'); assert.equal(SKYVIEWS.foeFadeV1, 'v1');
  assert.match(bad({ foeFade: 'yes' }), /foeFade: must be true or false/);
  assert.match(bad({ fadeStartDegrees: 0, fadeEndDegrees: 0 }), /foeFade: needs a fade band/);
  const none = structuredClone(STAGE); delete none.skyline.views.variants.b.foeFade;
  assert.match(validateFile('stage', none).join('\n'), /variants\.b\.foeFade/);
  const q = structuredClone(STAGE); q.skyline.views.foeFadeQuery = 'skyview';
  assert.match(validateFile('stage', q).join('\n'), /foeFadeQuery/);
});

test('the band edges: whole at fadeStartDegrees, gone at fadeEndDegrees, half between (same function as the sand)', () => {
  assert.equal(fadeAlpha(B.fadeStartDegrees, B.fadeStartDegrees, B.fadeEndDegrees), 1);
  assert.equal(fadeAlpha(B.fadeEndDegrees, B.fadeStartDegrees, B.fadeEndDegrees), 0);
  assert.equal(fadeAlpha((B.fadeStartDegrees + B.fadeEndDegrees) / 2, B.fadeStartDegrees, B.fadeEndDegrees), 0.5);
});

test('?foefade=v1 and the rows switch it off; default B has it on; v1 skyview has none', () => {
  assert.equal(foeFadeOn('', B), true);
  assert.equal(foeFadeOn('?foefade=v1', B), false);
  assert.equal(foeFadeOn('?x=1&foefade=v1', B), false);
  assert.equal(foeFadeOn('', SKYVIEWS.variants.a), false);
  assert.equal(foeFadeOn('?skyview=v1', skyViewFor('?skyview=v1')), false);
  assert.equal(foeFadeOn('', { ...B, fadeStartDegrees: 0, fadeEndDegrees: 0 }), false);
  assert.match(read('../src/fight/scene.ts'), /const foeFade = skyView && foeFadeOn\(pageSearch, skyView\) \? createFoeFade\(skyView\) : null;/);
});

test('depression is measured to the FEET: a boss whose feet are on melted sand fades however tall he is', () => {
  const eye = { x: 0, y: 10, z: 0 };
  // feet 40 m out, 10 m below the eye: atan(10/40) = 14.04 degrees (solid); feet 63 m out: 9.02 degrees (nearly gone)
  assert.ok(Math.abs(depressionDegrees(eye, { x: 0, y: 0, z: 40 }) - 14.036) < 0.01);
  const fade = createFoeFade(B), root = new THREE.Group(), head = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  head.position.y = 40;   // a head far above the eye: if the head were used the angle would flip to "above the horizon"
  root.add(head); fade.adopt(root); fade.move(new THREE.Vector3(0, 10, 0));
  root.position.set(0, 0, 40); assert.ok(fade.alphaOf(root) > 0.99);
  root.position.set(0, 0, 63); assert.ok(fade.alphaOf(root) < 0.05);
  root.position.set(0, 0, 200); assert.equal(fade.alphaOf(root), 0);
  root.position.set(0, 0, 4); assert.equal(fade.alphaOf(root), 1);
});

test('adopt: gear materials get the fade, the shader multiplies alpha, onBeforeRender feeds the feet alpha; the hero\'s materials are never touched', () => {
  const fade = createFoeFade(B), hero = new THREE.Group(), heroMat = new THREE.MeshStandardMaterial(), shared = new THREE.MeshStandardMaterial();
  hero.add(new THREE.Mesh(new THREE.BoxGeometry(), heroMat)); hero.add(new THREE.Mesh(new THREE.BoxGeometry(), shared));
  const foe = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()), sword = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  foe.add(body); body.add(sword); foe.add(new THREE.Mesh(new THREE.BoxGeometry(), shared));
  fade.protect(hero); fade.adopt(foe); fade.adopt(foe);   // twice is safe
  assert.ok(body.material.onBeforeCompile.toString().includes('foeFadeShader') || body.material.customProgramCacheKey().startsWith('foefade-'));   // the body and his gear are patched
  assert.ok(sword.material.customProgramCacheKey().startsWith('foefade-'));
  assert.equal(heroMat.customProgramCacheKey().startsWith('foefade-'), false);   // the hero's own material: untouched
  assert.equal(shared.customProgramCacheKey().startsWith('foefade-'), false);   // a material shared with the hero: left whole
  assert.equal(body.material.transparent, false);   // still opaque: draw order, depth and shadows are as they were
  const shader = { vertexShader: 'void main() {\n#include <project_vertex>\n}', fragmentShader: 'void main() {\n#include <opaque_fragment>\n}' };
  body.material.onBeforeCompile(shader, {});
  assert.match(shader.vertexShader, /vec3 foeFeet = vec3\(modelMatrix\[3\]\.x, 0\.0, modelMatrix\[3\]\.z\)/);   // the mesh origin on the ground = his feet, not a vertex
  assert.match(shader.vertexShader, /cameraPosition/);
  assert.match(shader.vertexShader, new RegExp(`smoothstep\\(${B.fadeEndDegrees.toFixed(4)}, ${B.fadeStartDegrees.toFixed(4)}, foeDepression\\)`));   // the sand's band, from the rows
  assert.match(shader.fragmentShader, /if \(vFoeFade <= .*discard;/);
  const custom = foeFadeShader('void main() { gl_Position = vec4(0.0); }', 'void main() { gl_FragColor = vec4(1.0); }', B);
  assert.equal(custom.fragmentShader, 'void main() { gl_FragColor = vec4(1.0); }');   // a trail or sprite shader (no project_vertex) is not touched
});

test('wiring: the hero is protected and the foe, its idle copies, other bodies and live attackers are adopted; sand look untouched', () => {
  const scene = read('../src/fight/scene.ts');
  assert.match(scene, /foeFade\?\.protect\(player\); foeFade\?\.adopt\(opponent\);/); assert.doesNotMatch(scene, /foeFade\??\.adopt\(player\)/);
  assert.match(scene, /for \(const h of idleCopies\) foeFade\.adopt\(h\);/);
  assert.match(scene, /for \(const e of liveFoes\.values\(\)\) foeFade\.adopt\(e\.group\);/);
  assert.match(scene, /foeFade\.move\(camera\.position\)/);
  assert.match(scene, /const floorFade = skyView \? fadeFloor\(arena\.group, skyView\) : null;/);
});
