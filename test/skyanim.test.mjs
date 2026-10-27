// The skyline plate's small coded motion (src/fight/skyanim.ts, data/stage.json skyline.plate.anim): rows validate, ?skyanim=off and reduced motion turn it off, the clock
// stops when the tab is hidden, the shader is patched onto the plate's own material (no extra draw, no texture upload), and the layer files are optional rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { validateFile } from '../src/sim/validate.js';
import { createSkyline, SKYLINE } from '../src/fight/skyline.ts';
import { animOn, spinShift, bandCentre, createSkyAnim, SKY_ANIM } from '../src/fight/skyanim.ts';

const STAGE = JSON.parse(readFileSync(new URL('../data/stage.json', import.meta.url), 'utf8'));
const bad = (mut) => { const s = structuredClone(STAGE); mut(s.skyline.plate.anim); return validateFile('stage', s); };
const A = SKY_ANIM;

test('the shipped anim row validates; bad rows are refused', () => {
  assert.deepEqual(validateFile('stage', STAGE), []);
  const cases = [(a) => { a.extra = 1; }, (a) => { a.on = 'yes'; }, (a) => { a.query = 'skyplate'; }, (a) => { a.off = 'no way'; }, (a) => { a.about = 'short'; }, (a) => { delete a.globe; }, (a) => { a.globe.radius = 0.9; },
    (a) => { a.globe.secondsPerTurn = 0; }, (a) => { a.globe.file = '../x.webp'; }, (a) => { a.globe.file = 'x.png'; }, (a) => { a.globe.centre.u = 2; }, (a) => { a.globe.highlight.strength = 5; }, (a) => { delete a.globe.highlight; },
    (a) => { a.planet.swingDegrees = 200; }, (a) => { a.planet.glow.color = 'pink'; }, (a) => { a.planet.glow.pulseSeconds = 0; }, (a) => { a.glisten.sweepSeconds = 99; }, (a) => { a.glisten.edgeHi = 0.01; },
    (a) => { a.glisten.box.u1 = a.glisten.box.u0; }, (a) => { a.glisten.width = 0; }, (a) => { a.light = { x: 0, y: 0, z: 0 }; }, (a) => { a.respectReducedMotion = 1; }, (a) => { a.glisten.nope = 1; }];
  for (const [i, m] of cases.entries()) assert.ok(bad(m).length >= 1, `bad anim row #${i} is refused`);
  const none = structuredClone(STAGE); delete none.skyline.plate.anim;
  assert.ok(validateFile('stage', none).length >= 1);
});

test('the shipped numbers sit on the picture: globe in the raised hand, planet at the left, glisten box over the rings, all as rows', () => {
  assert.ok(A.on); assert.equal(A.query, 'skyanim'); assert.equal(A.off, 'off'); assert.ok(A.respectReducedMotion);
  assert.ok(Math.abs(A.globe.centre.u - 0.68) < 0.02 && A.globe.radius < 0.02);
  assert.ok(A.planet.centre.u < 0.4 && A.planet.radius > 0.03);
  assert.ok(A.glisten.box.u0 < SKYLINE.plate.face.u && A.glisten.box.u1 > SKYLINE.plate.face.u);
  for (const f of [A.globe.file, A.planet.file, A.glisten.file]) assert.equal(f, '', 'today the effects are made from the flattened plate: no extra asset');
  const src = readFileSync(new URL('../src/fight/skyanim.ts', import.meta.url), 'utf8');
  for (const k of ['secondsPerTurn', 'swingDegrees', 'periodSeconds', 'sweepSeconds', 'strength', 'edgeLo', 'lowerFadeFrom', 'respectReducedMotion', 'pulseSeconds', 'orbitSeconds']) assert.match(src, new RegExp(`\\b${k}\\b`), k);
  assert.ok(existsSync(new URL('../docs/SKY-LAYERS.md', import.meta.url)), 'the designer brief ships');
});

test('?skyanim=off and the row off turn it off; the default is on', () => {
  assert.equal(animOn('', A), true); assert.equal(animOn('?skyanim=off', A), false); assert.equal(animOn('?skyanim=1', A), true); assert.equal(animOn('', { ...A, on: false }), false);
  assert.equal(createSkyAnim('?skyanim=off', 2508, 627), null);
  assert.ok(createSkyAnim('', 2508, 627));
});

test('prefers-reduced-motion turns it off', () => {
  const was = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: /reduce/.test(q) });
  try { assert.equal(createSkyAnim('', 2508, 627), null); assert.ok(createSkyAnim('', 2508, 627, { ...A, respectReducedMotion: false })); }
  finally { if (was) globalThis.matchMedia = was; else delete globalThis.matchMedia; }
});

test('the motion maths: a continuous turn takes secondsPerTurn, a swing stays within its degrees, the band sweeps the box then rests', () => {
  assert.ok(Math.abs(spinShift(36, 0, 36) - 2 * Math.PI) < 1e-9);
  for (let t = 0; t < 120; t += 1.7) assert.ok(Math.abs(spinShift(60, 9, t)) <= THREE.MathUtils.degToRad(9) + 1e-9);
  const g = A.glisten;
  assert.ok(bandCentre(g, 0) < g.box.u0); assert.ok(bandCentre(g, g.sweepSeconds * 0.5) > g.box.u0 && bandCentre(g, g.sweepSeconds * 0.5) < g.box.u1);
  assert.ok(bandCentre(g, g.sweepSeconds + 0.1) > g.box.u1, 'resting off the far edge');
  assert.ok(Math.abs(bandCentre(g, 0) - bandCentre(g, g.periodSeconds)) < 1e-9, 'a periodic sweep');
});

test('the clock advances, is clamped per step, and stands still while the tab is hidden', () => {
  const a = createSkyAnim('', 2508, 627);
  a.update(0.016); assert.ok(Math.abs(a.time - 0.016) < 1e-9);
  a.update(50); assert.ok(a.time <= 0.016 + 0.1 + 1e-9, 'a long stall does not jump the motion');
  const t0 = a.time, was = globalThis.document;
  globalThis.document = { hidden: true };
  try { a.update(0.05); assert.equal(a.time, t0); globalThis.document = { hidden: false }; a.update(0.05); assert.ok(a.time > t0); }
  finally { if (was) globalThis.document = was; else delete globalThis.document; }
  a.dispose();
});

test('it patches the plate material in place: the shader gains the effect lines, nothing else about the material changes', () => {
  const a = createSkyAnim('', 2508, 627), m = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, fog: false });
  a.apply(m);
  const shader = { uniforms: {}, fragmentShader: '#include <common>\nvoid main(){\n#include <map_fragment>\n}' };
  m.onBeforeCompile(shader, null);
  assert.match(shader.fragmentShader, /uGlobeShift/); assert.match(shader.fragmentShader, /uBand/); assert.doesNotMatch(shader.fragmentShader, /#include <map_fragment>/);
  for (const k of ['uAspect', 'uGlobeShift', 'uPlanetPulse', 'uBand']) assert.ok(k in shader.uniforms, k);
  assert.equal(m.transparent, true); assert.equal(m.depthWrite, false); assert.equal(m.fog, false);
  const before = shader.uniforms.uGlobeShift.value; a.update(1); assert.notEqual(shader.uniforms.uGlobeShift.value, before, 'the shared uniform moves with the clock');
  a.dispose();
});

test('the skyline plate carries it and ?skyanim=off draws the plain plate (the plate itself is unchanged either way)', async () => {
  const tex = () => { const t = new THREE.DataTexture(new Uint8Array(4), 1, 1); t.image = { width: 2508, height: 627, data: new Uint8Array(4) }; return t; };
  const sky = createSkyline(new THREE.Scene(), '', SKYLINE, async () => tex());
  const off = createSkyline(new THREE.Scene(), '?skyanim=off', SKYLINE, async () => tex());
  await new Promise((r) => setTimeout(r, SKYLINE.loadAfterFirstFrameMs + 400));
  assert.ok(sky && off);
  if (sky.state !== 'idle' && sky.state !== 'loading') {
    assert.equal(typeof sky.mesh.material.onBeforeCompile, 'function');
    assert.ok(sky.mesh.material.customProgramCacheKey().includes('skyanim'));
    assert.ok(!off.mesh.material.customProgramCacheKey().includes('skyanim'));
    sky.update(new THREE.Vector3(), 0.016); off.update(new THREE.Vector3(), 0.016);   // the camera/follow/fade path still runs
    assert.ok(sky.opacity > 0 && off.opacity > 0);
  }
  sky.dispose(); off.dispose();
});
