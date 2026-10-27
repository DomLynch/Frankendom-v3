// The far opponent melts into the clouds where the sand does (src/fight/foefade.ts): same band as the floor, measured at his feet, never the hero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { validateFile } from '../src/sim/validate.js';
import { SKYVIEWS, fadeAlpha, skyViewFor } from '../src/fight/skyview.ts';
import { createFoeFade, depressionDegrees, foeFadeOn } from '../src/fight/foefade.ts';

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
  const fade = createFoeFade(B), hero = new THREE.Group(), heroMat = new THREE.MeshStandardMaterial(), sharedMat = new THREE.MeshStandardMaterial();
  hero.add(new THREE.Mesh(new THREE.BoxGeometry(), heroMat)); hero.add(new THREE.Mesh(new THREE.BoxGeometry(), sharedMat));
  const foe = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()), sword = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()), borrowed = new THREE.Mesh(new THREE.BoxGeometry(), sharedMat);
  foe.add(body); body.add(sword); foe.add(borrowed);
  fade.protect(hero); fade.adopt(foe); fade.adopt(foe);   // twice is safe
  assert.equal(body.material.transparent, true); assert.equal(sword.material.transparent, true);   // the gear fades too
  assert.equal(heroMat.transparent, false); assert.equal(sharedMat.transparent, false); assert.equal(sharedMat.onBeforeCompile.toString().includes('foeFade'), false);
  assert.equal(borrowed.onBeforeRender === THREE.Object3D.prototype.onBeforeRender, true);   // a mesh on the hero's material is left alone
  const shader = { uniforms: {}, vertexShader: '', fragmentShader: 'void main() {\n#include <opaque_fragment>\n}' };
  body.material.onBeforeCompile(shader, {});
  assert.match(shader.fragmentShader, /gl_FragColor\.a \*= foeFade;/); assert.ok(shader.uniforms.foeFade);
  fade.move(new THREE.Vector3(0, 10, 0)); foe.position.set(0, 0, 200);
  body.onBeforeRender(); assert.equal(shader.uniforms.foeFade.value, 0); assert.equal(body.material.uniformsNeedUpdate, true);
  foe.position.set(0, 0, 4); sword.onBeforeRender(); assert.equal(shader.uniforms.foeFade.value, 1);
});

test('wiring: the hero is protected and the foe, its idle copies, other bodies and live attackers are adopted; sand look untouched', () => {
  const scene = read('../src/fight/scene.ts');
  assert.match(scene, /foeFade\?\.protect\(player\); foeFade\?\.adopt\(opponent\);/);
  assert.match(scene, /for \(const h of idleCopies\) foeFade\.adopt\(h\);/);
  assert.match(scene, /for \(const e of liveFoes\.values\(\)\) foeFade\.adopt\(e\.group\);/);
  assert.match(scene, /foeFade\.move\(camera\.position\)/);
  assert.match(scene, /const floorFade = skyView \? fadeFloor\(arena\.group, skyView\) : null;/);
});
