// The wide-screen lens (Dom 2026-10-27, phone landscape: "zoomed OUT, the hero tiny in a wide field of sand, portrait is perfect"): data/fight.json camera.wide.
// Portrait is pinned byte-identical; landscape and desktop get an extra lens zoom so the hero is not a quarter the size of portrait's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { cameraPose, setLockFrame, setLensBoost, finisherSidePose } from '../src/fight/camera.ts';
import { cameraZoom, fovForZoom, wideBoost, wideRow, WIDE_LIMITS } from '../src/fight/camera-zoom.ts';
import { finisherRow } from '../src/fight/finishers.ts';
import { validateFile } from '../src/sim/validate.js';

const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (p) => read(p).split('\n').map((l) => l.replace(/\s\/\/ .*$/, '').replace(/^\s*\/\/.*$/, '')).join('\n');   // comment-stripped
const ROW = FIGHT.camera.wide, ZOOM = FIGHT.camera.zoom;
const PORTRAITS = [0.46, 0.5, 0.56, 0.6, 0.66, 0.7, 0.75], WIDES = [['landscape phone', 812 / 375], ['desktop', 1440 / 900], ['ultra-wide', 3440 / 1440]];

test('the shipped row is pinned and validates', () => {
  assert.deepEqual(ROW, { about: ROW.about, fromAspect: 1, toAspect: 1.5, zoom: 1.5, maxHfovDeg: 80 });
  assert.deepEqual(validateFile('fight', FIGHT), []);
});

test('portrait is exactly as today: boost is 1 for every portrait aspect, and the lens is the row zoom bit for bit', () => {
  for (const a of [...PORTRAITS, 0.9, 1]) {
    assert.equal(wideBoost(a, ZOOM, ROW), 1, `aspect ${a}`);
    assert.equal(fovForZoom(ZOOM * wideBoost(a, ZOOM, ROW)), fovForZoom(ZOOM), `aspect ${a}`);
  }
  assert.equal(fovForZoom(ZOOM), fovForZoom(1.1));
  assert.equal(cameraZoom(ZOOM, ''), ZOOM);
});

test('the lock pose has no aspect in it, so the framing is one distance and pitch for every screen shape; the hero is the same share of the HEIGHT before the boost', () => {
  setLockFrame(FIGHT.camera.lift, FIGHT.camera.side);
  const hero = { x: 0, z: 2.5, heading: 0, distance: 0 }, foe = { x: 0, z: 0 }, pose = cameraPose(hero, 0, 0.45, true, foe);
  const frac = (fov, aspect) => {
    const cam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 100);
    cam.position.set(pose.x, pose.y, pose.z); cam.lookAt(pose.lookX, 0.8, pose.lookZ); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const y = (h) => new THREE.Vector3(hero.x, h, hero.z).project(cam).y;
    return (y(1.8) - y(0)) / 2;
  };
  const base = frac(fovForZoom(ZOOM), 375 / 812);
  for (const a of PORTRAITS) assert.ok(Math.abs(frac(fovForZoom(ZOOM), a) - base) < 1e-9, `portrait ${a}: the same fraction`);
  for (const [name, a] of WIDES) assert.ok(Math.abs(frac(fovForZoom(ZOOM), a) - base) < 1e-9, `${name}: with no boost the hero is the portrait's share of the height (the camera was already fitted by the vertical field)`);
  assert.ok(base > 0.25 && base < 0.5, `engaged hero fraction ${base}`);
  for (const [name, a] of WIDES.slice(0, 2)) {
    const f = frac(fovForZoom(ZOOM * wideBoost(a, ZOOM, ROW)), a);
    assert.ok(f > base * 1.3 && f < base * (ROW.zoom + 0.1), `${name}: boosted fraction ${f.toFixed(3)} vs portrait ${base.toFixed(3)}`);
  }
});

test('wide screens: full boost from toAspect, a linear blend above fromAspect, and the horizontal field never passes the cap', () => {
  const hfov = (a, zoom) => 2 * Math.atan(Math.tan(fovForZoom(zoom * wideBoost(a, zoom, ROW)) * Math.PI / 360) * a) * 180 / Math.PI;
  assert.equal(wideBoost(812 / 375, ZOOM, ROW), ROW.zoom);
  assert.equal(wideBoost(1440 / 900, ZOOM, ROW), ROW.zoom);
  assert.ok(Math.abs(wideBoost(1.25, ZOOM, ROW) - (1 + (ROW.zoom - 1) / 2)) < 1e-12);
  for (const a of [1.05, 1.2, 1.4, 1.5, 1.8, 2.17, 2.4, 3, 3.56, 4]) {
    assert.ok(hfov(a, ZOOM) <= ROW.maxHfovDeg + 1e-9, `aspect ${a}: ${hfov(a, ZOOM).toFixed(1)} deg`);
    assert.ok(wideBoost(a, ZOOM, ROW) >= wideBoost(a - 0.01, ZOOM, ROW) - 1e-12, `aspect ${a}: never less zoom on a wider screen`);
  }
  assert.ok(wideBoost(3.56, ZOOM, ROW) > ROW.zoom, 'a 32:9 screen takes more than the row to hold the cap');
});

test('?wide= replaces the row zoom inside the limits; v1 and 1 mean none; anything else keeps the row', () => {
  assert.equal(wideRow(ROW, '').zoom, ROW.zoom);
  assert.equal(wideRow(ROW, '?wide=1.25').zoom, 1.25);
  assert.equal(wideBoost(2.17, ZOOM, wideRow(ROW, '?wide=v1')), 1);
  assert.equal(wideBoost(2.17, ZOOM, wideRow(ROW, '?wide=1')), 1);
  assert.equal(wideBoost(3.56, ZOOM, wideRow(ROW, '?wide=v1')), 1, 'v1 is no zoom even on an ultra-wide');
  for (const bad of ['?wide=', '?wide=abc', '?wide=0.9', '?wide=2.1', '?wide=NaN']) assert.equal(wideRow(ROW, bad).zoom, ROW.zoom, bad);
  assert.deepEqual([...WIDE_LIMITS.zoom], [1, 2]);
});

test('the validator refuses an absent or out-of-range wide row', () => {
  const with_ = (patch) => { const c = structuredClone(FIGHT); if (patch === undefined) delete c.camera.wide; else Object.assign(c.camera.wide, patch); return validateFile('fight', c); };
  assert.equal(with_(undefined).length, 1);
  assert.deepEqual(with_({}), []);
  for (const bad of [{ fromAspect: 0.7 }, { fromAspect: 2.1 }, { fromAspect: 'x' }, { toAspect: 1 }, { toAspect: 4.5 }, { zoom: 0.9 }, { zoom: 2.1 }, { zoom: NaN }, { maxHfovDeg: 39 }, { maxHfovDeg: 121 }, { maxHfovDeg: null }])
    assert.ok(with_(bad).length >= 1, JSON.stringify(bad));
  assert.deepEqual(with_({ zoom: 1 }), []); assert.deepEqual(with_({ zoom: 2 }), []);
});

test('the finisher side view stands back by the boost on a wide screen and is untouched in portrait', () => {
  const id = ['decapitation', 'opened', 'hamstrung', 'execution'].find((f) => finisherRow(f)?.camera.side) ?? null;
  assert.ok(id, 'a finisher with a side view');
  const killer = { x: 0, z: 0 }, fallen = { x: 1.2, z: 0.4 }, dist = (p) => Math.hypot(p.x - (killer.x + fallen.x) / 2, p.z - (killer.z + fallen.z) / 2);
  for (const a of PORTRAITS) assert.deepEqual(finisherSidePose(killer, fallen, a, id, 1, 0, 1), finisherSidePose(killer, fallen, a, id), `portrait ${a}: boost 1 is the default`);
  const near = finisherSidePose(killer, fallen, 2.17, id, 1, 0, 1), far = finisherSidePose(killer, fallen, 2.17, id, 1, 0, 1.5);
  assert.ok(dist(far) > dist(near), 'the boosted view stands further back');
  setLensBoost(1.5); assert.deepEqual(finisherSidePose(killer, fallen, 2.17, id), far, 'the page boost is the default'); setLensBoost(1);
});

test('wiring: the page sets the row on the view, the view applies it on every resize, the attacker back-off follows it, and no sim file reads it', () => {
  const main = code('../src/client/main.ts'), scene = code('../src/fight/scene.ts'), cam = code('../src/fight/camera.ts');
  assert.match(main, /view\.setWide\(wideRow\(FIGHT\.camera\.wide, search\)\);/);
  assert.match(main, /cameraZoom\(FIGHT\.camera\.zoom, search\) \* view\.lensBoost\)/);
  assert.match(scene, /camera\.aspect = width \/ height;\s*applyLens\(\);/);
  assert.match(scene, /lensBoost = lensWide \? wideBoost\(camera\.aspect, lensZoom, lensWide\) : 1;/);
  assert.match(scene, /camera\.fov = fovForZoom\(lensBoost === 1 \? lensZoom : lensZoom \* lensBoost\);/);
  assert.match(cam, /\* lensBoost,\s*\);/);
  assert.doesNotMatch(cam.slice(cam.indexOf('export function cameraPose'), cam.indexOf('export function finisherSidePose')), /aspect/, 'the lock pose has no aspect term: one framing for every shape');
  for (const f of ['../src/fight/combat.ts', '../src/fight/duel.ts', '../src/fight/moves.ts', '../src/fight/record.ts']) assert.doesNotMatch(code(f), /camera\.wide|wideBoost/, f);
  // the #119 bug class: a trailing // comment after a one-line call chain that continues on the next line swallows nothing today, but the added lines must each be a whole statement
  for (const line of read('../src/client/main.ts').split('\n').filter((l) => /setWide\(/.test(l))) assert.match(line, /^view\.setWide\(.*\);\s+\/\/ /);
});
