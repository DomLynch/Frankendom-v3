// The folded floor (src/fight/skyfold.ts, data/stage.json skyline.fold): the row validates, ?skyfold=v1 builds nothing, the band maths, the draw order between strip and sand, no new download for A.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import * as THREE from 'three';
import { validateFile } from '../src/sim/validate.js';
import { SKYLINE, SKYLINE_ORDER } from '../src/fight/skyline.ts';
import { SKYVIEWS, FLOOR_ORDER } from '../src/fight/skyview.ts';
import { FOLD, FOLD_ORDER, foldFor, ringDistance, ringV, ringAlpha, foldGeometry, createSkyfold } from '../src/fight/skyfold.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const STAGE = JSON.parse(read('../data/stage.json'));
const bad = (patch, variant) => { const s = structuredClone(STAGE); if (variant) Object.assign(s.skyline.fold.variants[variant], patch); else Object.assign(s.skyline.fold, patch); return validateFile('stage', s).join('\n'); };
const VIEW = SKYVIEWS.variants.b;

test('the shipped fold row validates and is pinned', () => {
  assert.deepEqual(validateFile('stage', STAGE), []);
  assert.equal(FOLD.on, true); assert.equal(FOLD.query, 'skyfold'); assert.equal(FOLD.v1, 'v1');
  assert.deepEqual(Object.keys(FOLD.variants), ['a', 'b']);
  assert.equal(FOLD.variants.a.file, '');   // A shares the strip's picture: no extra download
  assert.equal(FOLD.variants.a.bandTopFraction, SKYLINE.horizonFraction);   // the horizon row is the fold line
});

test('the validator refuses bad fold rows', () => {
  assert.match(bad({ farMetres: 400 }), /fold\.farMetres/);
  assert.match(bad({ nearMetres: 200 }), /fold\.nearMetres/);
  assert.match(bad({ nearMetres: 170, farMetres: 160 }), /nearMetres: must be nearer/);
  assert.match(bad({ featherFraction: 2 }), /featherFraction/);
  assert.match(bad({ orderOffset: 100 }), /orderOffset/);
  assert.match(bad({ orderOffset: 1.5 }), /orderOffset/);
  assert.match(bad({ rings: 1 }), /rings/);
  assert.match(bad({ on: 'yes' }), /fold\.on/);
  assert.match(bad({ query: 'sky' }), /fold\.query/);
  assert.match(bad({ query: 'skyview' }), /fold\.query/);
  assert.match(bad({ extra: 1 }), /fold\.extra: unknown key/);
  assert.match(bad({ default: 'z' }), /fold\.default/);
  assert.match(bad({ file: '../x.webp' }, 'b'), /variants\.b\.file/);
  assert.match(bad({ file: 'x.png' }, 'b'), /variants\.b\.file/);
  assert.match(bad({ bandTopFraction: 1.2 }, 'a'), /variants\.a\.bandTopFraction/);
  assert.match(bad({ bandTopFraction: 0.99 }, 'a'), /non-empty band/);
  assert.match(bad({ extra: 1 }, 'a'), /variants\.a\.extra: unknown key/);
  const none = structuredClone(STAGE); delete none.skyline.fold;
  assert.match(validateFile('stage', none).join('\n'), /stage\.skyline\.fold: must be an object/);
});

test('?skyfold=v1, the row off, ?sky=v1 and the look before the melt (no view) each build nothing', () => {
  assert.equal(foldFor(''), FOLD.variants.b);
  assert.equal(foldFor('?skyfold=a'), FOLD.variants.a);
  assert.equal(foldFor('?skyfold=b'), FOLD.variants.b);
  assert.equal(foldFor('?foo=1&skyfold=b'), FOLD.variants.b);
  assert.equal(foldFor('?skyfold=zzz'), FOLD.variants.b);
  assert.equal(foldFor('?skyfold=constructor'), FOLD.variants.b);
  assert.equal(foldFor('?skyfold=v1'), null);
  assert.equal(foldFor('?sky=v1'), null);
  assert.equal(foldFor('', { ...FOLD, on: false }), null);
  const scene = new THREE.Scene(); let fetched = 0; const load = () => { fetched++; return Promise.reject(Error('no')); };
  assert.equal(createSkyfold(scene, '?skyfold=v1', VIEW, FOLD, SKYLINE, load), null);
  assert.equal(createSkyfold(scene, '?skyfold=b', null, FOLD, SKYLINE, load), null);   // ?skyview=v1: the sand is whole, nothing to fold under
  assert.equal(createSkyfold(scene, '?sky=v1', VIEW, FOLD, SKYLINE, load), null);
  assert.equal(scene.children.length, 0); assert.equal(fetched, 0);
});

test('the band maths: far edge at the horizon row, near edge at the bottom, rows spaced as a flat floor is seen', () => {
  const { nearMetres: n, farMetres: f } = FOLD;
  assert.ok(Math.abs(ringDistance(0, n, f) - f) < 1e-9); assert.ok(Math.abs(ringDistance(1, n, f) - n) < 1e-9);
  assert.ok(ringDistance(0.5, n, f) < (n + f) / 2);   // equal steps in 1/d crowd the rows toward the far edge
  assert.equal(ringV(0, FOLD.variants.a), 1 - SKYLINE.horizonFraction);   // v 0 is the picture's bottom row: the horizon row sits 12% up
  assert.equal(ringV(1, FOLD.variants.a), 0);   // the bottom edge is the near edge
  assert.equal(ringV(0, FOLD.variants.b), 1); assert.equal(ringV(1, FOLD.variants.b), 0);
  assert.equal(ringAlpha(0, 0.3), 0); assert.equal(ringAlpha(0.3, 0.3), 1); assert.equal(ringAlpha(1, 0.3), 1);
  assert.ok(ringAlpha(0.15, 0.3) > 0 && ringAlpha(0.15, 0.3) < 1);
  assert.equal(ringAlpha(0, 0), 1);
});

test('the mesh: flat on the ground, the cylinder\'s angle mapping, the far rim inside the far plane', () => {
  const g = foldGeometry(FOLD, FOLD.variants.a), p = g.getAttribute('position'), uv = g.getAttribute('uv');
  assert.equal(p.count, (FOLD.around + 1) * (FOLD.rings + 1));
  let far = 0;
  for (let i = 0; i < p.count; i++) { assert.equal(p.getY(i), 0); far = Math.max(far, Math.hypot(p.getX(i), p.getZ(i))); }
  assert.ok(Math.abs(far - FOLD.farMetres) < 1e-3); assert.ok(Math.hypot(far, 40) < 180);
  // column i sits at the angle whose point is (sin, cos) and carries u = i / around: the same u the cylinder gives that bearing
  const i = FOLD.around / 4;
  assert.ok(Math.abs(p.getX(i) - FOLD.farMetres) < 1e-3 && Math.abs(p.getZ(i)) < 1e-3); assert.equal(uv.getX(i), 0.25);
  assert.equal(uv.getX(FOLD.around), 1);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, FOLD.around, 1, true), cp = cyl.getAttribute('position'), cu = cyl.getAttribute('uv');
  assert.ok(Math.abs(cp.getX(i) - 1) < 1e-6 && Math.abs(cu.getX(i) - uv.getX(i)) < 1e-6);   // the strip's own cylinder at the same column
  assert.equal(g.getAttribute('color').itemSize, 4);
});

test('draw order: after the strip, before the sand; no depth write, no fog, no tone map, no shadows', () => {
  assert.ok(SKYLINE_ORDER < FOLD_ORDER && FOLD_ORDER < FLOOR_ORDER, `${SKYLINE_ORDER} ${FOLD_ORDER} ${FLOOR_ORDER}`);
  const scene = new THREE.Scene();
  const fold = createSkyfold(scene, '', VIEW);
  const m = fold.mesh;
  assert.equal(m.renderOrder, FOLD_ORDER); assert.equal(m.name, 'skyfold');
  assert.equal(m.material.depthWrite, false); assert.equal(m.material.fog, false); assert.equal(m.material.toneMapped, false);
  assert.equal(m.receiveShadow, false); assert.equal(m.castShadow, false); assert.equal(m.material.vertexColors, true);
  assert.equal(m.position.y, FOLD.groundY);
  const src = read('../src/fight/skyfold.ts');
  for (const k of ['farMetres', 'nearMetres', 'featherFraction', 'groundY', 'orderOffset', 'around', 'rings']) assert.match(src, new RegExp(`row\\.${k}|FOLD\\.${k}`));
  assert.match(read('../src/fight/scene.ts'), /skyfold\?\.update\(camera\.position, dt, skyline\);/);
  // the sand's depth push (zone-ground.json floorDepthPush) is untouched by this file
  assert.doesNotMatch(src, /polygonOffset|floorDepthPush/);
});

test('A downloads nothing: it takes the strip\'s own picture when that lands, and follows the camera and the strip\'s fade', () => {
  const scene = new THREE.Scene(); let fetched = 0;
  const fold = createSkyfold(scene, '?skyfold=a', VIEW, FOLD, SKYLINE, () => { fetched++; return Promise.reject(Error('no')); });
  assert.equal(fold.mesh.visible, false);
  const tex = new THREE.Texture();
  const strip = { texture: undefined, opacity: 0 };
  fold.update(new THREE.Vector3(3, 9, -5), 0.1, strip);
  assert.equal(fold.mesh.position.x, 3); assert.equal(fold.mesh.position.z, -5); assert.equal(fold.mesh.position.y, FOLD.groundY);   // the camera's height does not lift it
  assert.equal(fold.mesh.visible, false);   // nothing to draw until the strip's picture lands
  strip.texture = tex; strip.opacity = 0.5;
  fold.update(new THREE.Vector3(3, 9, -5), 0.1, strip);
  assert.equal(fold.mesh.material.map, tex); assert.equal(fold.mesh.visible, true); assert.equal(fold.mesh.material.opacity, 0.5);
  fold.dispose();
  assert.equal(fetched, 0);
});

test('the fold turns with the strip\'s CURRENT yaw (follow, offset, ease), across the +-180 seam, not the fixed yawDegrees', () => {
  const never = () => new Promise(() => {});
  const cam = (yaw) => { const c = new THREE.PerspectiveCamera(); c.rotation.y = yaw; c.updateMatrixWorld(true); return c; };
  const row = { ...SKYLINE, yawFollow: 0.5, followOffsetDegrees: 20, yawFollowSeconds: 0.4, yawDegrees: 10 };
  const scene = new THREE.Scene();
  const strip = createSkyline(scene, '', row, never), fold = createSkyfold(scene, '?skyfold=a', VIEW, FOLD, row, never);
  const eye = new THREE.Vector3(1, 2, 3);
  let moved = false;
  for (let i = 0; i < 400; i++) {   // the camera sweeps through +-pi twice, easing mid-turn
    strip.heading(cam(i * 0.05)); strip.update(eye, 1 / 60); fold.update(eye, 1 / 60, strip);
    assert.ok(Math.abs(fold.mesh.rotation.y - strip.yaw) < 1e-12, `frame ${i}`);
    if (Math.abs(strip.yaw - THREE.MathUtils.degToRad(row.yawDegrees)) > 0.1) moved = true;
  }
  assert.ok(moved, 'the strip really turned, so the fixed yawDegrees would be wrong');
  strip.heading(cam(Math.PI - 0.01)); strip.update(eye, 1 / 60); fold.update(eye, 1 / 60, strip);
  const before = strip.yaw;
  strip.heading(cam(-Math.PI + 0.01)); strip.update(eye, 1 / 60); fold.update(eye, 1 / 60, strip);
  assert.ok(Math.abs(fold.mesh.rotation.y - strip.yaw) < 1e-12);
  assert.ok(Math.abs(strip.yaw - before) < 0.1, 'no spin across the seam');
  fold.dispose(); strip.dispose();
});

test('B (the default) is a small baked WebP and the first visit still fits the weight budget', () => {
  const file = new URL(`../src/assets/skyline/${FOLD.variants.b.file}`, import.meta.url), size = statSync(file).size, buf = readFileSync(file);
  assert.equal(buf.toString('latin1', 0, 4), 'RIFF'); assert.equal(buf.toString('latin1', 8, 12), 'WEBP');
  assert.ok(size > 1_000 && size < 50_000, String(size));   // a WebP does not gzip: this is its wire size
  assert.equal(FOLD.default, 'b');
  assert.equal(foldFor(''), FOLD.variants.b);
  const LIVE_WIRE_AT_809C86E = 5_414_619, budget = JSON.parse(read('../data/build.json')).firstVisitBytes;
  assert.ok(LIVE_WIRE_AT_809C86E + size <= budget, `${LIVE_WIRE_AT_809C86E + size} > ${budget}`);   // 5.4 MB + the band stays under 5.5 MB: the budget row is not raised
});
