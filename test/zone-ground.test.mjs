// The zone's open ground (data/zone-ground.json, src/zone/ground.ts, ground-draw.ts): the rows are validated, the sizing comes from them, the fog hides the floor's
// edge from where the hero and his camera can stand, and the page builds the old stage under ?postkill=v1 and ?ground=v1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCHEMA, validateFile } from '../src/sim/validate.js';
import { GROUND, checkGround, fogHidesAt, groundFor, groundOn, groundSizing } from '../src/zone/ground.ts';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ROWS = read('../data/zone-ground.json'), STAGE = read('../data/stage.json'), RESPAWN = read('../data/respawn.json');
const clone = (patch) => { const d = structuredClone(ROWS); patch(d); return d; };

test('the rows validate, the shipped values pass the fog and reach checks, and unknown keys are refused', () => {
  assert.ok(SCHEMA['zone-ground']);
  assert.deepEqual(validateFile('zone-ground', ROWS), []);
  assert.match(validateFile('zone-ground', { ...ROWS, extra: 1 }).join('\n'), /zone-ground\.extra: unknown key/);
  assert.deepEqual(checkGround(ROWS, STAGE.duel.fogDensity), []);
  assert.deepEqual(ROWS.flag, { query: 'ground', off: 'v1' });
});

test('bad rows are refused: out of range, NaN, grid beyond the floor, a far plane that cuts the floor short, an edge the fog does not hide', () => {
  const bad = (patch, re, reach) => assert.match(checkGround(clone(patch), STAGE.duel.fogDensity, reach).join('\n'), re);
  bad((d) => { d.groundRadiusMetres = 5; }, /groundRadiusMetres 5 is not in/);
  bad((d) => { d.groundRadiusMetres = NaN; }, /groundRadiusMetres NaN/);
  bad((d) => { d.edgeVisibility = 0; }, /edgeVisibility 0 is not in/);
  bad((d) => { d.gridRadiusMetres = 400; d.limits.gridRadiusMetres = [10, 500]; }, /grid is beyond the floor|gridRadiusMetres/);
  bad((d) => { d.cameraFarMetres = 180; }, /cuts the floor off before the fog hides it/);
  bad((d) => { d.groundRadiusMetres = 100; }, /walking reach/, 20);
  assert.deepEqual(checkGround(ROWS, STAGE.duel.fogDensity, 20), [], 'a 12 m walk plus 8 m camera room leaves the edge in fog');
  assert.match(checkGround(ROWS, 0).join('\n'), /fogDensity/);
});

test('the sizing is the rows through the pit scale: the floor reaches the radius, the grid keeps the stage\'s cell, nothing is typed here', () => {
  const k = RESPAWN.world.pitScale, s = groundSizing(GROUND, k);
  assert.ok(s.floorSide * k / 2 >= ROWS.groundRadiusMetres, 'the floor (in the scaled group) reaches the row\'s radius');
  assert.ok(s.floorSide >= STAGE.ground.size, 'never smaller than the pit\'s own floor');
  const cell = STAGE.grid.size / STAGE.grid.divisions;
  assert.equal(s.gridSize / s.gridDivisions, cell, 'same cell as the pit grid, so they join line for line');
  assert.ok(s.gridSize * k / 2 >= ROWS.gridRadiusMetres && s.gridSize <= 2 * ROWS.gridRadiusMetres / k + 2 * cell);
  assert.equal(s.gridDivisions % 2, 0, 'centre lines stay on the origin');
  assert.equal(s.far, ROWS.cameraFarMetres);
  assert.deepEqual(groundFor(k), s);
  assert.throws(() => groundFor(k, 1e5), /walking reach/);
});

test('the fog distance is the exp-squared fog law, and the shipped far plane and edge clear it', () => {
  const d = STAGE.duel.fogDensity, hide = fogHidesAt(d, ROWS.edgeVisibility);
  assert.ok(Math.abs(Math.exp(-((d * hide) ** 2)) - ROWS.edgeVisibility) < 1e-9);
  assert.ok(ROWS.cameraFarMetres >= hide);
  assert.ok(ROWS.groundRadiusMetres - 20 >= hide, '12 m walk + 8 m camera room (postKill, PR A) still leaves the edge in fog');
  const walk = RESPAWN.postKill?.walkRadiusMetres;
  if (walk !== undefined) assert.deepEqual(checkGround(ROWS, d, walk + (RESPAWN.postKill.cameraMetres ?? 0)), [], 'the real walking reach (once PR A\'s rows are in)');
});

test('?ground=v1 keeps the pit\'s floor; the link flag reads the row', () => {
  assert.equal(groundOn(''), true);
  assert.equal(groundOn('?ground=v1'), false);
  assert.equal(groundOn('?a=1&ground=v1&b=2'), false);
  assert.equal(groundOn('?ground=v10'), true);
  assert.equal(groundOn('?postkill=v1'), true, 'a different flag does not touch it (the zone gate handles ?postkill=v1)');
});

test('the wiring: only the zone, behind the flag, builds the open ground; ?postkill=v1 (no zone) builds the old stage', () => {
  const main = src('../src/client/main.ts'), scene = src('../src/fight/scene.ts'), stage = src('../src/arena-stage.ts'), draw = src('../src/zone/ground-draw.ts');
  const calls = main.match(/openGround\(/g) ?? [];
  assert.equal(calls.length, 1, 'one call site');
  assert.match(main, /if \(ZONE && groundOn\(search\)\) view\.openGround\(groundFor\(WORLD\.pitScale/);
  assert.match(main, /const ZONE = zoneLoopFor\(zoneFor\(search\), search/, 'ZONE is null under ?postkill=v1');
  assert.match(scene, /openGround\(sizing: GroundSizing\) \{ drawOpenGround\(arena\.group, camera, sizing\); \}/);
  assert.doesNotMatch(stage, /ground-draw|openGround|zone-ground/, 'the pit stage itself is unchanged: buildArena still draws the 400-unit floor');
  assert.match(stage, /createGround\(STAGE\)/);
  assert.match(draw, /group\.getObjectByName\('floor'\)/, 'the same floor mesh and material, only wider');
  assert.doesNotMatch(draw, /TextureLoader|new THREE\.Texture|MeshStandardMaterial|MeshBasicMaterial/, 'no new texture or material');
});
