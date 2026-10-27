// The skyline plate's layers and small coded motion (src/fight/skyanim.ts, data/stage.json skyline.plate.anim): rows validate, the designer's layer files are named by rows and ship, ?skyanim=off and
// reduced motion stop the motion (the layers still composite), the clock stops when the tab is hidden, the shader is patched onto the plate's own material, ?skyflat uses the flattened picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import * as THREE from 'three';
import { validateFile } from '../src/sim/validate.js';
import { createSkyline, SKYLINE } from '../src/fight/skyline.ts';
import { plateFile, plateFlat } from '../src/fight/skyplate.ts';
import { animOn, spinShift, bandCentre, spriteFrame, createSkyAnim, SKY_ANIM, seededRandom, sparkleEnvelope, createSparkler, breathWindow, sineOffsetPx, createBlinker, createDrooler, planetTurn } from '../src/fight/skyanim.ts';

const STAGE = JSON.parse(readFileSync(new URL('../data/stage.json', import.meta.url), 'utf8'));
const bad = (mut) => { const s = structuredClone(STAGE); mut(s.skyline.plate.anim); return validateFile('stage', s); };
const A = SKY_ANIM, P = SKYLINE.plate;
const asset = (f) => new URL(`../src/assets/skyline/${f}`, import.meta.url);

test('the shipped anim row validates; bad rows are refused', () => {
  assert.deepEqual(validateFile('stage', STAGE), []);
  const cases = [(a) => { a.extra = 1; }, (a) => { a.on = 'yes'; }, (a) => { a.query = 'skyplate'; }, (a) => { a.off = 'no way'; }, (a) => { a.about = 'short'; }, (a) => { delete a.globe; }, (a) => { a.globe.radius = 0.9; },
    (a) => { a.globe.spin.secondsPerTurn = 0; }, (a) => { a.globe.file = '../x.webp'; }, (a) => { a.globe.file = 'x.gif'; }, (a) => { a.globe.centre.u = 2; }, (a) => { a.globe.highlight.strength = 5; }, (a) => { delete a.globe.highlight; },
    (a) => { a.globe.rect.u1 = a.globe.rect.u0; }, (a) => { a.globe.rect.u0 = 0.9; a.globe.rect.u1 = 0.95; }, (a) => { a.planet.glow.color = 'pink'; }, (a) => { a.planet.glow.pulseSeconds = 0; }, (a) => { a.planet.on = 1; },
    (a) => { a.glisten.sweepSeconds = 99; }, (a) => { a.glisten.width = 0; }, (a) => { a.glisten.twinkle.amount = 3; }, (a) => { a.glisten.nope = 1; }, (a) => { a.respectReducedMotion = 1; }, (a) => { a.readyTimeoutSeconds = 0; },
    (a) => { a.globe.sprite.rects.pop(); }, (a) => { a.globe.sprite.rects[3].x = 5000; }, (a) => { a.globe.sprite.frames = 100; }, (a) => { a.globe.sprite.ballRadiusPx = 300; }, (a) => { a.globe.sprite.loadScale = 0; }, (a) => { a.globe.sprite.rects[0].w = -1; }];
  for (const [i, m] of cases.entries()) assert.ok(bad(m).length >= 1, `bad anim row #${i} is refused`);
  const none = structuredClone(STAGE); delete none.skyline.plate.anim;
  assert.ok(validateFile('stage', none).length >= 1);
  const noflat = structuredClone(STAGE); noflat.skyline.plate.flatQuery = 'sky';
  assert.ok(validateFile('stage', noflat).length >= 1);
});

test('the designer layer set: every file the rows name ships, the plate is the clean 4:1 picture, registration matches the manifest, the sprite rects are the 8x3 sheet', () => {
  assert.match(P.file, /^13_plate_fixed\.webp$/);
  for (const f of [P.file, P.flatFile, A.planet.file, A.globe.file, A.globe.sprite.file, A.glisten.file, A.planet.sphere.file, A.planet.sphere.shading.file, A.eyes.blink.file, A.eyes.wink.file, A.drool.shimmer.file, A.drool.drop.file, A.drool.drop.stretchedFile]) assert.ok(existsSync(asset(f)), f);
  const w = readFileSync(asset(P.file)); assert.equal(w.toString('latin1', 8, 12), 'WEBP');
  const kind = w.toString('latin1', 12, 16), width = kind === 'VP8X' ? 1 + (w[24] | (w[25] << 8) | (w[26] << 16)) : w.readUInt16LE(26) & 0x3fff, height = kind === 'VP8X' ? 1 + (w[27] | (w[28] << 8) | (w[29] << 16)) : w.readUInt16LE(28) & 0x3fff;
  assert.equal(width, 4096); assert.equal(height, 1024); assert.equal(P.cropAspect, width / height);
  assert.ok(Math.abs(A.globe.centre.u * 4096 - 2787.0) < 0.5 && Math.abs(A.globe.centre.v * 1024 - 681.9) < 0.5 && Math.abs(A.globe.radius * 4096 - 32.7) < 0.2);
  assert.ok(Math.abs(A.planet.centre.u * 4096 - 1367.8) < 0.5 && Math.abs(A.planet.centre.v * 1024 - 736.6) < 0.5 && Math.abs(A.planet.radius * 4096 - 249.1) < 0.3);
  const s = A.globe.sprite; assert.equal(s.frames, 24); assert.equal(s.columns * s.rows, 24); assert.equal(s.frameSeconds, 0.15); assert.equal(s.cellPx, 222);
  assert.deepEqual(s.rects[0], { x: 145, y: 59, w: 222, h: 222 }); assert.deepEqual(s.rects[23], { x: 3729, y: 741, w: 222, h: 222 });
  assert.ok(existsSync(new URL('../docs/SKY-LAYERS.md', import.meta.url)), 'the designer brief ships');
  assert.ok(statSync(asset(P.file)).size < 200_000, 'the clean plate is recompressed (the designer original was 251 KB)');
});

test('the layers wired to rows: every layer has an on row, and a layer that looks poor ships off', () => {
  for (const k of ['planet', 'globe', 'glisten']) assert.equal(typeof A[k].on, 'boolean', k);
  assert.equal(typeof A.globe.sprite.on, 'boolean'); assert.equal(typeof A.planet.glow.on, 'boolean'); assert.equal(typeof A.globe.spin.on, 'boolean');
  const src = readFileSync(new URL('../src/fight/skyanim.ts', import.meta.url), 'utf8');
  for (const k of ['secondsPerTurn', 'swingDegrees', 'frameSeconds', 'periodSeconds', 'sweepSeconds', 'spreadTexels', 'twinkle', 'readyTimeoutSeconds', 'respectReducedMotion', 'pulseSeconds', 'orbitSeconds', 'rects']) assert.match(src, new RegExp(`\\b${k}\\b`), k);
});

test('?skyanim=off and the row off stop the motion (the layers still composite); the default moves', () => {
  assert.equal(animOn('', A), true); assert.equal(animOn('?skyanim=off', A), false); assert.equal(animOn('?skyanim=1', A), true); assert.equal(animOn('', { ...A, on: false }), false);
  assert.equal(createSkyAnim('?skyanim=off', 4096, 1024).moving, false);
  assert.equal(createSkyAnim('', 4096, 1024).moving, true);
  assert.equal(createSkyAnim('', 4096, 1024, { ...A, on: false }), null);
  assert.equal(createSkyAnim('', 4096, 1024, A, true), null, '?skyflat draws no layers');
  const off = createSkyAnim('?skyanim=off', 4096, 1024); off.update(1); assert.equal(off.time, 0);
});

test('prefers-reduced-motion stops the motion', () => {
  const was = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: /reduce/.test(q) });
  try { assert.equal(createSkyAnim('', 4096, 1024).moving, false); assert.equal(createSkyAnim('', 4096, 1024, { ...A, respectReducedMotion: false }).moving, true); }
  finally { if (was) globalThis.matchMedia = was; else delete globalThis.matchMedia; }
});

test('the motion maths: a turn takes secondsPerTurn, a swing stays within its degrees, the band sweeps then rests, the sprite steps and loops', () => {
  assert.ok(Math.abs(spinShift(36, 0, 36) - 2 * Math.PI) < 1e-9);
  for (let t = 0; t < 120; t += 1.7) assert.ok(Math.abs(spinShift(60, 9, t)) <= THREE.MathUtils.degToRad(9) + 1e-9);
  const g = A.glisten;
  assert.ok(bandCentre(g, 0) < g.rect.u0); assert.ok(bandCentre(g, g.sweepSeconds * 0.5) > g.rect.u0 && bandCentre(g, g.sweepSeconds * 0.5) < g.rect.u1);
  assert.ok(bandCentre(g, g.sweepSeconds + 0.1) > g.rect.u1, 'resting off the far edge'); assert.ok(Math.abs(bandCentre(g, 0) - bandCentre(g, g.periodSeconds)) < 1e-9, 'periodic');
  const s = A.globe.sprite; assert.equal(spriteFrame(s, 0), 0); assert.equal(spriteFrame(s, 0.16), 1); assert.equal(spriteFrame(s, 0.15 * 24 + 0.01), 0); assert.equal(spriteFrame(s, 0.15 * 23.5), 23);
});

test('the clock advances, is clamped per step, and stands still while the tab is hidden', () => {
  const a = createSkyAnim('', 4096, 1024);
  a.update(0.016); assert.ok(Math.abs(a.time - 0.016) < 1e-9);
  a.update(50); assert.ok(a.time <= 0.016 + 0.1 + 1e-9, 'a long stall does not jump the motion');
  const t0 = a.time, was = globalThis.document;
  globalThis.document = { hidden: true };
  try { a.update(0.05); assert.equal(a.time, t0); globalThis.document = { hidden: false }; a.update(0.05); assert.ok(a.time > t0); }
  finally { if (was) globalThis.document = was; else delete globalThis.document; }
  a.dispose();
});

test('it patches the plate material in place: the shader gains the layer lines, nothing else about the material changes', () => {
  const a = createSkyAnim('', 4096, 1024), m = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, fog: false });
  a.apply(m);
  const shader = { uniforms: {}, fragmentShader: '#include <common>\nvoid main(){\n#include <map_fragment>\n}' };
  m.onBeforeCompile(shader, null);
  assert.match(shader.fragmentShader, /uGlobeShift/); assert.match(shader.fragmentShader, /uMaskTex/); assert.doesNotMatch(shader.fragmentShader, /#include <map_fragment>/);
  for (const k of ['uAspect', 'uGlobeShift', 'uPlanetPulse', 'uBand', 'uPlanetTex']) assert.ok(k in shader.uniforms, k);
  assert.equal(m.transparent, true); assert.equal(m.depthWrite, false); assert.equal(m.fog, false);
  const before = shader.uniforms.uGlobeShift.value; a.update(1); assert.notEqual(shader.uniforms.uGlobeShift.value, before, 'the shared uniform moves with the clock');
  a.dispose();
});

test('?skyflat=1 loads the flattened plate and none of the layers; the default loads the clean plate; ?skyplate=v1 still draws the old strip', () => {
  assert.equal(plateFile('', P), P.file); assert.equal(plateFile('?skyflat=1', P), P.flatFile); assert.equal(plateFlat('?skyflat=1', P), true); assert.equal(plateFlat('', P), false);
  const old = createSkyline(new THREE.Scene(), '?skyplate=v1', SKYLINE, () => new Promise(() => {})); assert.equal(old.mesh.geometry.parameters.thetaLength, Math.PI * 2); old.dispose();
});

test('sky life rows: sparkle, crown glow, breathing and the globe bob validate, each has its own on, bad rows are refused', () => {
  for (const k of ['sparkle', 'crownGlow', 'breathing']) assert.equal(typeof A[k].on, 'boolean', k);
  assert.equal(typeof A.globe.bob.on, 'boolean');
  const cases = [(a) => { delete a.sparkle; }, (a) => { delete a.breathing; }, (a) => { delete a.crownGlow; }, (a) => { delete a.globe.bob; }, (a) => { a.sparkle.extra = 1; }, (a) => { a.sparkle.color = 'white'; },
    (a) => { a.sparkle.maxGapSeconds = 0.2; }, (a) => { a.sparkle.minGapSeconds = 0.1; a.sparkle.durationSeconds = 1; }, (a) => { a.sparkle.anchors = [a.sparkle.anchors[0]]; }, (a) => { a.sparkle.anchors[0].u = 2; },
    (a) => { delete a.sparkle.anchors[1].scale; }, (a) => { a.sparkle.size = 0; }, (a) => { a.sparkle.seed = 1.5; }, (a) => { a.crownGlow.pulseSeconds = 0; }, (a) => { a.crownGlow.centre.v = -1; },
    (a) => { a.breathing.rect.u1 = a.breathing.rect.u0; }, (a) => { a.breathing.featherFraction = 0; }, (a) => { a.breathing.amplitudePx = 99; }, (a) => { a.breathing.on = 1; }, (a) => { a.globe.bob.amplitudePx = -1; }, (a) => { a.globe.bob.periodSeconds = 0; }, (a) => { a.globe.bob.phase = 2; }];
  for (const [i, m] of cases.entries()) assert.ok(bad(m).length >= 1, `bad sky-life row #${i} is refused`);
});

test('sparkle: the seeded schedule is the same every visit, one glint at a time, gaps within min..max, never the same anchor twice running, every anchor lands on the titan', () => {
  const S = A.sparkle, r1 = seededRandom(S.seed), r2 = seededRandom(S.seed); for (let i = 0; i < 20; i++) assert.equal(r1(), r2());
  assert.equal(sparkleEnvelope(0), 0); assert.equal(sparkleEnvelope(1), 0); assert.ok(sparkleEnvelope(0.2) > 0.99); assert.ok(sparkleEnvelope(0.1) < sparkleEnvelope(0.2) && sparkleEnvelope(0.6) < sparkleEnvelope(0.2));
  const sp = createSparkler(S), starts = [], anchors = []; let was = 0;
  for (let t = 0; t < 600; t += 0.02) { const s = sp.at(t); if (s.intensity > 0 && was === 0) { starts.push(t); anchors.push(s.anchor); } was = s.intensity; }
  assert.ok(starts.length > 60, `sparkles keep firing (${starts.length})`); assert.ok(starts[0] >= S.firstDelaySeconds - 1e-9 && starts[0] < S.firstDelaySeconds + 0.1);
  for (let i = 1; i < starts.length; i++) { const gap = starts[i] - starts[i - 1] - S.durationSeconds; assert.ok(gap >= S.minGapSeconds - 0.1 && gap <= S.maxGapSeconds + 0.1, `gap ${gap}`); assert.notEqual(anchors[i], anchors[i - 1]); }
  assert.equal(new Set(anchors).size, S.anchors.length, 'every anchor gets a turn');
  for (const a of S.anchors) assert.ok(a.u > 0.5 && a.u < 0.62 && a.v > 0.5 && a.v < 0.7, `${a.name} sits on the face and crown`);
  assert.ok(S.anchors.some((a) => a.name === 'teeth') && S.anchors.filter((a) => a.name.startsWith('crown')).length >= 2);
});

test('breathing and bob: a feathered window (zero at the rect edge and outside, one in the middle), a sine in plate pixels, the horizon and the sides stay still', () => {
  const B = A.breathing, r = B.rect, mid = [(r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2];
  assert.equal(breathWindow(B, ...mid), 1); assert.equal(breathWindow(B, r.u0, mid[1]), 0); assert.equal(breathWindow(B, mid[0], r.v1), 0); assert.equal(breathWindow(B, 0.1, 0.6), 0);
  assert.equal(breathWindow(B, mid[0], SKYLINE.plate.horizonFraction), 0, 'the horizon row stays still'); assert.ok(r.v1 <= SKYLINE.plate.horizonFraction);
  assert.ok(breathWindow(B, r.u0 + 0.01, mid[1]) < 1);
  assert.ok(B.amplitudePx <= 6, 'a few plate pixels'); assert.ok(r.u1 <= A.globe.centre.u - A.globe.radius, 'the globe and its fingertip are outside the lift (the window is 0 at the rect edge)');
  assert.ok(Math.abs(sineOffsetPx(4, 6, 0, 1.5) - 4) < 1e-9); assert.ok(Math.abs(sineOffsetPx(4, 6, 0, 3)) < 1e-9); assert.ok(Math.abs(sineOffsetPx(3, 4, 0.25, 0) - 3) < 1e-9);
  assert.ok(A.globe.bob.amplitudePx <= 4);
  const face = P.face; assert.ok(face.u > r.u0 && face.u < r.u1 && face.v > r.v0 && face.v < r.v1, 'the face is inside the breath');
});

test('sky life is presentation only and costs a clock: the shader gains the lines, ?skyanim=off stills all four, each effect row off stills just that one', () => {
  const mk = (search, row) => { const a = createSkyAnim(search, 4096, 1024, row), m = new THREE.MeshBasicMaterial(); a.apply(m); const sh = { uniforms: {}, fragmentShader: '#include <common>\nvoid main(){\n#include <map_fragment>\n}' }; m.onBeforeCompile(sh, null); return { a, u: sh.uniforms, sh }; };
  const live = mk('', A); assert.match(live.sh.fragmentShader, /uBreathLift/); assert.match(live.sh.fragmentShader, /uSparkI/); assert.match(live.sh.fragmentShader, /uBob/); assert.match(live.sh.fragmentShader, /uCrownI/);
  for (let i = 0; i < 400; i++) live.a.update(0.05);
  assert.notEqual(live.u.uBreathLift.value, 0); assert.notEqual(live.u.uBob.value, 0); assert.ok(live.u.uCrownI.value > 0);
  const off = mk('?skyanim=off', A); for (let i = 0; i < 400; i++) off.a.update(0.05);
  for (const k of ['uBreathLift', 'uBob', 'uSparkI', 'uCrownI']) assert.equal(off.u[k].value, 0, `${k} still under ?skyanim=off`);
  const only = (mut) => { const row = structuredClone(A); mut(row); return mk('', row); };
  const noB = only((r) => { r.breathing.on = false; }), noG = only((r) => { r.globe.bob.on = false; }), noS = only((r) => { r.sparkle.on = false; }), noC = only((r) => { r.crownGlow.on = false; });
  for (const x of [noB, noG, noS, noC]) for (let i = 0; i < 400; i++) x.a.update(0.05);
  assert.equal(noB.u.uBreathLift.value, 0); assert.notEqual(noB.u.uBob.value, 0); assert.equal(noG.u.uBob.value, 0); assert.notEqual(noG.u.uBreathLift.value, 0);
  assert.equal(noC.u.uCrownI.value, 0); assert.equal(noS.u.uSparkI.value, 0);
  let seen = 0; const live2 = mk('', A); for (let i = 0; i < 1200; i++) { live2.a.update(0.05); if (live2.u.uSparkI.value > 0) seen++; } assert.ok(seen > 0, 'a sparkle fires within a minute');
  const src = readFileSync(new URL('../src/fight/skyanim.ts', import.meta.url), 'utf8');
  for (const k of ['featherFraction', 'amplitudePx', 'durationSeconds', 'minGapSeconds', 'maxGapSeconds', 'firstDelaySeconds', 'anchors', 'radiusU']) assert.match(src, new RegExp(`\\b${k}\\b`), k);
});

test('the skyline plate shows once its layers are in, carries the patched material, and the follow/fade path still runs', async () => {
  const tex = () => { const t = new THREE.DataTexture(new Uint8Array(4), 1, 1); t.image = { width: 4096, height: 1024, data: new Uint8Array(4) }; return t; };
  const sky = createSkyline(new THREE.Scene(), '', SKYLINE, async () => tex());
  await new Promise((r) => setTimeout(r, SKYLINE.loadAfterFirstFrameMs + 400));
  assert.ok(sky);
  if (sky.state === 'fading' || sky.state === 'on') {
    assert.ok(sky.mesh.material.customProgramCacheKey().includes('skyanim'));
    sky.update(new THREE.Vector3(), 0.016); assert.ok(sky.opacity > 0);
  }
  sky.dispose();
});

test('pack 2 rows: eyes, drool and the planet sphere validate, each effect has its own on, bad rows are refused', () => {
  for (const k of ['eyes', 'drool']) assert.equal(typeof A[k].on, 'boolean', k);
  for (const x of [A.eyes.blink, A.eyes.wink, A.drool.shimmer, A.drool.drop, A.planet.sphere]) assert.equal(typeof x.on, 'boolean');
  assert.deepEqual(A.eyes.rectPx, { x: 2246, y: 606, w: 227, h: 81 }, 'the manifest rect');
  assert.deepEqual(A.drool.drop.spawnPx, { x: 2407, y: 745 }); assert.deepEqual(A.drool.drop.anchorPx, { x: 12, y: 0 });
  assert.ok(A.eyes.blink.holdMinSeconds >= 0.09 && A.eyes.blink.holdMaxSeconds <= 0.14 && A.eyes.wink.holdMinSeconds >= 0.15 && A.eyes.wink.holdMaxSeconds <= 0.24 && A.eyes.intervalMinSeconds >= 4 && A.eyes.intervalMaxSeconds <= 9);
  const cases = [(a) => { delete a.eyes; }, (a) => { delete a.drool; }, (a) => { delete a.planet.sphere; }, (a) => { a.eyes.extra = 1; }, (a) => { a.eyes.intervalMaxSeconds = 1; }, (a) => { a.eyes.rectPx.w = 0; }, (a) => { a.eyes.blink.file = 'x.gif'; },
    (a) => { a.eyes.blink.holdMaxSeconds = 0.03; }, (a) => { a.eyes.wink.everyEvents = 1; }, (a) => { a.eyes.wink.everyJitter = 3; }, (a) => { a.eyes.featherPx = 99; }, (a) => { a.eyes.seed = 1.5; }, (a) => { delete a.eyes.wink.everyEvents; },
    (a) => { a.drool.shimmer.color = 'pink'; }, (a) => { a.drool.shimmer.periodSeconds = 0; }, (a) => { delete a.drool.drop; }, (a) => { a.drool.drop.spawnMaxSeconds = 1; }, (a) => { a.drool.drop.fallDistancePx = 0; }, (a) => { a.drool.drop.fadeOutPx = 9999; },
    (a) => { a.drool.drop.startSpeedPx = 0; a.drool.drop.accelPx = 0; }, (a) => { a.drool.drop.strength = 2; }, (a) => { a.drool.drop.spawnPx.x = -1; }, (a) => { a.drool.drop.stretchedFile = '../x.png'; }, (a) => { a.planet.sphere.secondsPerTurn = 0; },
    (a) => { a.planet.sphere.loadScale = 0; }, (a) => { a.planet.sphere.shading.discFraction = 2; }, (a) => { delete a.planet.sphere.shading; }, (a) => { a.planet.sphere.on = 1; }];
  for (const [i, m] of cases.entries()) assert.ok(bad(m).length >= 1, `bad pack-2 row #${i} is refused`);
});

test('eyes: seeded and repeatable, gaps 4-9 s, holds in the rows, a wink about every 4th event, never two winks in a row', () => {
  const E = A.eyes, run = () => {
    const b = createBlinker(E), ev = []; let was = 0;
    for (let t = 0; t < 1200; t += 0.005) { const s = b.at(t); if (s.kind && !was) ev.push({ kind: s.kind, start: t, hold: 0, amt: 0 }); if (s.kind) { const e = ev[ev.length - 1]; e.hold = t - e.start; e.amt = Math.max(e.amt, s.amount); } was = s.kind; }
    return ev;
  };
  const a = run(), b = run(); assert.deepEqual(a, b, 'the same every visit');
  assert.ok(a.length > 120, `events keep coming (${a.length})`); assert.ok(a[0].start >= E.firstDelaySeconds - 1e-9);
  const winks = a.filter((e) => e.kind === 2); assert.ok(winks.length > 15 && a.length / winks.length > 2.5 && a.length / winks.length < 6, `a wink about every 4th (1 in ${(a.length / winks.length).toFixed(1)})`);
  for (let i = 1; i < a.length; i++) { assert.ok(!(a[i].kind === 2 && a[i - 1].kind === 2), 'never two winks in a row'); const gap = a[i].start - a[i - 1].start - a[i - 1].hold; assert.ok(gap >= E.intervalMinSeconds - 0.02 && gap <= E.intervalMaxSeconds + 0.02, `gap ${gap}`); }
  for (const e of a) { const h = e.kind === 1 ? E.blink : E.wink; assert.ok(e.hold >= h.holdMinSeconds - 0.01 && e.hold <= h.holdMaxSeconds + 0.01, `hold ${e.hold}`); assert.ok(e.amt > 0.99, 'reaches fully closed'); }
  const off = structuredClone(E); off.wink.on = false; const bo = createBlinker(off); let sawWink = false; for (let t = 0; t < 600; t += 0.01) if (bo.at(t).kind === 2) sawWink = true; assert.equal(sawWink, false, 'wink.on false = no winks');
});

test('drool: the droplet waits 6-10 s, falls its distance, goes plain then stretched, fades in and out, and is gone between drops', () => {
  const D = A.drool.drop, d = createDrooler(D), starts = [], ends = []; let was = 0, maxY = 0, sawStretch = false, sawPlain = false;
  for (let t = 0; t < 400; t += 0.01) {
    const s = d.at(t);
    if (s.alpha > 0 && !was) starts.push(t); if (s.alpha === 0 && was) ends.push(t);
    if (s.alpha > 0) { maxY = Math.max(maxY, s.y); if (s.stretch) sawStretch = true; else sawPlain = true; assert.ok(s.alpha <= D.strength + 1e-9); }
    was = s.alpha > 0 ? 1 : 0;
  }
  assert.ok(starts.length > 25, `drops keep falling (${starts.length})`); assert.ok(starts[0] >= D.firstDelaySeconds - 0.02 && starts[0] < D.firstDelaySeconds + 0.5);
  assert.ok(maxY <= D.fallDistancePx + 1e-9 && maxY > D.fallDistancePx * 0.7, `falls its distance (${maxY})`); assert.ok(sawStretch && sawPlain, 'plain at low speed, stretched at higher');
  for (let i = 1; i < starts.length; i++) { const gap = starts[i] - ends[i - 1]; assert.ok(gap >= D.spawnMinSeconds - 0.1 && gap <= D.spawnMaxSeconds + 0.1, `spawn gap ${gap}`); }
  assert.equal(createDrooler(D).at(0).alpha, 0, 'nothing before the first spawn');
});

test('planet sphere: the turn wraps once per secondsPerTurn, ?skyanim=off holds it still, sphere.on false is the rollback, the shader wraps the surface and keeps the cut-out alpha; eyes and drop stop under off', () => {
  const S = A.planet.sphere; assert.ok(Math.abs(planetTurn(S.startTurns, S.secondsPerTurn, 0) - S.startTurns) < 1e-9);
  for (let t = 0; t < 400; t += 3.3) { const x = planetTurn(S.startTurns, S.secondsPerTurn, t); assert.ok(x >= 0 && x < 1); }
  assert.ok(Math.abs(planetTurn(S.startTurns, S.secondsPerTurn, S.secondsPerTurn) - S.startTurns) < 1e-9, 'one turn per secondsPerTurn');
  const mk = (search, row) => { const a = createSkyAnim(search, 4096, 1024, row), m = new THREE.MeshBasicMaterial(); a.apply(m); const sh = { uniforms: {}, fragmentShader: '#include <common>\nvoid main(){\n#include <map_fragment>\n}' }; m.onBeforeCompile(sh, null); return { a, sh, u: sh.uniforms }; };
  const live = mk('', A); assert.match(live.sh.fragmentShader, /uSurfTex/); assert.match(live.sh.fragmentShader, /uShadeTex/); assert.match(live.sh.fragmentShader, /o\.a > 0\.0/, 'the cut-out alpha still decides what shows');
  const t0 = live.u.uPlanetTurn.value; for (let i = 0; i < 100; i++) live.a.update(0.05); assert.notEqual(live.u.uPlanetTurn.value, t0, 'the planet turns');
  let eyes = 0; for (let i = 0; i < 2400; i++) { live.a.update(0.05); if (live.u.uEyeAmt.value > 0) eyes++; } assert.ok(eyes > 0, 'the eyes fire within two minutes');
  const noEyes = structuredClone(A); noEyes.eyes.on = false; const ne = mk('', noEyes); for (let i = 0; i < 2400; i++) { ne.a.update(0.05); assert.equal(ne.u.uEyeAmt.value, 0); }
  const off = mk('?skyanim=off', A), o0 = off.u.uPlanetTurn.value; for (let i = 0; i < 2400; i++) off.a.update(0.05); assert.equal(off.u.uPlanetTurn.value, o0, '?skyanim=off holds the planet still'); assert.equal(off.u.uEyeAmt.value, 0); assert.equal(off.u.uDropA.value, 0);
  const noSphere = structuredClone(A); noSphere.planet.sphere.on = false; assert.equal(mk('', noSphere).u.uSphereOn.value, 0, 'rollback row: sphere.on false keeps the flat cut-out');
  const src = readFileSync(new URL('../src/fight/skyanim.ts', import.meta.url), 'utf8');
  for (const k of ['secondsPerTurn', 'startTurns', 'discFraction', 'featherPx', 'holdMinSeconds', 'everyEvents', 'spawnMinSeconds', 'fallDistancePx', 'accelPx', 'stretchFromSpeedPx', 'fadeOutPx', 'waves']) assert.match(src, new RegExp(`\\b${k}\\b`), k);
  assert.match(src, /RepeatWrapping/); assert.match(src, /ClampToEdgeWrapping/);
});
