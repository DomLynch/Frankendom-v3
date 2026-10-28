// The zone's endless open ground (data/zone-ground.json, src/zone/ground.ts, ground-draw.ts, the follow in scene.ts): the rows are validated, the sizing and the follow snap come from
// them, the fog hides the floor's edge, the floor stands on the hero in whole grid cells (the sand and grid never swim), and the page builds the old stage under ?postkill=v1 and ?ground=v1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCHEMA, validateFile } from '../src/sim/validate.js';
import { GROUND, anchorInto, checkGround, fogHidesAt, followSnap, groundFor, groundOn, groundSizing, sandOn, depthPushFor } from '../src/zone/ground.ts';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ROWS = read('../data/zone-ground.json'), STAGE = read('../data/stage.json'), RESPAWN = read('../data/respawn.json');
const clone = (patch) => { const d = structuredClone(ROWS); patch(d); return d; };
const d = STAGE.duel.fogDensity;

test('the rows validate, the shipped values pass the checks, and unknown keys are refused', () => {
  assert.ok(SCHEMA['zone-ground']);
  assert.deepEqual(validateFile('zone-ground', ROWS), []);
  assert.match(validateFile('zone-ground', { ...ROWS, extra: 1 }).join('\n'), /zone-ground\.extra: unknown key/);
  assert.match(validateFile('zone-ground', { ...ROWS, groundFollow: { ...ROWS.groundFollow, extra: 1 } }).join('\n'), /groundFollow\.extra: unknown key/);
  assert.deepEqual(checkGround(ROWS, d), []);
  assert.deepEqual(ROWS.flag, { query: 'ground', off: 'v1' });
  assert.equal(ROWS.groundFollow.on, true);
});

test('bad rows are refused: out of range, NaN, grid beyond the floor, a far plane that cuts the floor short, an edge the fog does not hide, a bad follow row', () => {
  const bad = (patch, re, reach) => assert.match(checkGround(clone(patch), d, reach).join('\n'), re);
  bad((r) => { r.groundRadiusMetres = 5; }, /groundRadiusMetres 5 is not in/);
  bad((r) => { r.groundRadiusMetres = NaN; }, /groundRadiusMetres NaN/);
  bad((r) => { r.edgeVisibility = 0; }, /edgeVisibility 0 is not in/);
  bad((r) => { r.gridRadiusMetres = r.groundRadiusMetres + 50; r.limits.gridRadiusMetres = [10, 1000]; }, /beyond the floor/);
  bad((r) => { r.cameraFarMetres = 180; }, /cuts the floor off before the fog hides it/);
  bad((r) => { r.groundRadiusMetres = 100; }, /less the camera offset/);
  bad((r) => { r.groundRadiusMetres = 300; r.cameraOffsetMetres = 50; }, /less the camera offset 50 is 250 m: the fog needs 288 m/);   // the camera's own distance from the hero is taken off the radius
  bad((r) => { r.cameraOffsetMetres = -1; }, /cameraOffsetMetres -1 is not in/);
  bad((r) => { r.groundFollow.snapMetres = 0; }, /snapMetres 0 is not in/);
  bad((r) => { r.groundFollow.snapMetres = NaN; }, /snapMetres NaN/);
  bad((r) => { r.groundFollow.on = 'yes'; }, /groundFollow\.on must be true or false/);
  bad((r) => { r.groundFollow.on = false; r.groundRadiusMetres = 300; }, /walking reach/, 20);   // a floor that stays on the pit must clear the walking reach; one that follows the hero need not
  assert.deepEqual(checkGround(ROWS, d, 1e5), [], 'a following floor ignores the reach');
  assert.match(checkGround(ROWS, 0).join('\n'), /fogDensity/);
});

test('the sizing is the rows through the pit scale: the floor reaches the radius, the grid keeps the stage\'s cell, nothing is typed here', () => {
  const k = RESPAWN.world.pitScale, s = groundSizing(GROUND, k);
  assert.ok(s.floorSide * k / 2 >= ROWS.groundRadiusMetres, 'the floor (in the scaled group) reaches the row\'s radius on every side of the hero');
  assert.ok(s.floorSide >= STAGE.ground.size, 'never smaller than the pit\'s own floor');
  const cell = STAGE.grid.size / STAGE.grid.divisions;
  assert.equal(s.gridSize / s.gridDivisions, cell, 'same cell as the pit grid, so they join line for line');
  assert.ok(s.gridSize * k / 2 >= ROWS.gridRadiusMetres && s.gridSize <= 2 * ROWS.gridRadiusMetres / k + 2 * cell);
  assert.equal(s.gridDivisions % 2, 0, 'centre lines stay on the anchor');
  assert.equal(s.far, ROWS.cameraFarMetres);
  assert.deepEqual(groundFor(k), s);
});

test('the follow: the floor stands on the hero in whole grid cells, so the grid lines and the sand stay fixed in the world as he runs', () => {
  const k = RESPAWN.world.pitScale, cellWorld = (STAGE.grid.size / STAGE.grid.divisions) * k, snap = followSnap(GROUND, k);
  assert.ok(snap >= ROWS.groundFollow.snapMetres - 1e-9, 'at least the row\'s step');
  assert.ok(Math.abs(snap / cellWorld - Math.round(snap / cellWorld)) < 1e-9, 'a whole number of grid cells');
  assert.equal(groundSizing(GROUND, k).snap, snap);
  for (const [x, z] of [[0, 0], [0.3, -0.2], [500, 500], [-1234.5, 87.1], [12000, -20000], [1e5 + 0.37, 3]]) {   // up to about 100 km
    const a = anchorInto({ x: 0, z: 0 }, x, z, snap);
    assert.ok(Math.abs(a.x - x) <= snap / 2 + 1e-6 && Math.abs(a.z - z) <= snap / 2 + 1e-6, `within half a step of the hero at ${x}, ${z}`);
    for (const v of [a.x, a.z]) { const cells = v / cellWorld; assert.ok(Math.abs(cells - Math.round(cells)) < 1e-6 * Math.max(1, Math.abs(cells)), `on a grid line at ${v}`); }
  }
  assert.deepEqual(anchorInto({ x: 9, z: 9 }, 3, 4, 0), { x: 0, z: 0 }, 'snap 0 = the floor stays at the start');
  const out = { x: 0, z: 0 }; assert.equal(anchorInto(out, 5, 5, snap), out, 'written into the object it is given: no allocation per frame');
  assert.equal(followSnap(clone((r) => { r.groundFollow.on = false; }), k), 0);
});

test('the fog distance is the exp-squared fog law, and the shipped far plane and floor edge clear it', () => {
  const hide = fogHidesAt(d, ROWS.edgeVisibility);
  assert.ok(Math.abs(Math.exp(-((d * hide) ** 2)) - ROWS.edgeVisibility) < 1e-9);
  assert.ok(ROWS.cameraFarMetres >= hide && ROWS.groundRadiusMetres - ROWS.cameraOffsetMetres >= hide, 'the nearest the edge can be to the camera is in fog');
  const share = Math.exp(-(((ROWS.groundRadiusMetres - ROWS.cameraOffsetMetres) * d) ** 2));
  assert.ok(share < 0.01, `fog share of the floor at its nearest edge ${share.toFixed(4)} (under 1%)`);
  assert.ok(ROWS.cameraOffsetMetres >= RESPAWN.postKill.cameraMetres + 7.5, 'covers the walking camera (7.5 m behind him, scene.ts follow camera) plus the row\'s extra room');
});

test('?ground=v1 keeps the pit\'s floor; the link flag reads the row', () => {
  assert.equal(groundOn(''), true);
  assert.equal(groundOn('?ground=v1'), false);
  assert.equal(groundOn('?a=1&ground=v1&b=2'), false);
  assert.equal(groundOn('?ground=v10'), true);
  assert.equal(groundOn('?postkill=v1'), true, 'a different flag does not touch it (the zone gate handles ?postkill=v1)');
});

test('the wiring: only the zone, behind the flag, builds the open ground; ?postkill=v1 (no zone) builds the old stage; the follow is the scene\'s and is off until opened', () => {
  const main = src('../src/client/main.ts'), scene = src('../src/fight/scene.ts'), stage = src('../src/arena-stage.ts'), draw = src('../src/zone/ground-draw.ts');
  assert.equal((main.match(/openGround\(/g) ?? []).length, 1, 'one call site');
  assert.match(main, /if \(ZONE && groundOn\(search\)\) view\.openGround\(groundFor\(WORLD\.pitScale/);
  assert.match(main, /const ZONE = zoneLoopFor\(orderedZone\(zoneFor\(search\), FIGHT\.order, search\), search/, 'ZONE is null under ?postkill=v1');
  assert.match(scene, /openGround\(sizing: GroundSizing\) \{ drawOpenGround\(arena\.group, camera, sizing\); groundSnap = sizing\.snap;/);
  assert.match(scene, /let groundSnap = 0/, 'no follow until the zone opens the ground');
  assert.match(scene, /if \(groundSnap > 0\) \{ anchorInto\(groundAt, state\.x, state\.z, groundSnap\);/);
  assert.match(scene, /sun\.position\.set\(groundAt\.x \+ sunHome\.x \+ 0\.7/, 'the flickering key light also stands on the hero');
  assert.match(scene, /get groundAnchor\(\)/, 'the hook the skyline follows');
  assert.doesNotMatch(stage, /ground-draw|openGround|zone-ground/, 'the pit stage itself is unchanged: buildArena still draws the 400-unit floor');
  assert.match(stage, /createGround\(STAGE\)/);
  assert.match(draw, /group\.getObjectByName\('floor'\)/, 'the same floor mesh and material, only wider');
  assert.doesNotMatch(draw, /TextureLoader|new THREE\.Texture|MeshStandardMaterial|MeshBasicMaterial/, 'no new texture or material');
  assert.doesNotMatch(stage, /boundary|RingGeometry|wall/i, 'the stage draws no pit wall, rim or ring: nothing to hide in the zone');
});

test('sand quality: the floor depth push is a validated row, ?sand=v1 reverts it, the zone alone applies it', () => {
  assert.deepEqual(validateFile('zone-ground', ROWS), []);
  assert.deepEqual(ROWS.floorDepthPush.flag, { query: 'sand', off: 'v1' });
  assert.deepEqual(depthPushFor(GROUND, true), { factor: ROWS.floorDepthPush.factor, units: ROWS.floorDepthPush.units });
  assert.equal(depthPushFor(GROUND, false), null);
  assert.equal(sandOn(''), true);
  assert.equal(sandOn('?sand=v1'), false);
  assert.equal(sandOn('?ground=v1&sand=v1'), false);
  assert.equal(sandOn('?sand=v10'), true);
  assert.equal(groundSizing(GROUND, 1.3, STAGE, false).depthPush, null);
  assert.deepEqual(groundSizing(GROUND, 1.3).depthPush, { factor: 1, units: 4 });
  const bad = (patch, re) => assert.match(checkGround(clone(patch), d).join('\n'), re);
  bad((r) => { r.floorDepthPush.units = 500; }, /floorDepthPush\.units 500 is not in/);
  bad((r) => { r.floorDepthPush.factor = NaN; }, /floorDepthPush\.factor NaN/);
  const main = src('../src/client/main.ts'), draw = src('../src/zone/ground-draw.ts'), stage = src('../src/arena-stage.ts'), client = src('../src/client/stage.js');
  assert.match(main, /groundFor\(WORLD\.pitScale, undefined, sandOn\(search\)\)/);
  assert.match(draw, /if \(floor && s\.depthPush\) Object\.assign\(floor\.material as THREE\.Material, \{ polygonOffset: true, polygonOffsetFactor: s\.depthPush\.factor, polygonOffsetUnits: s\.depthPush\.units \}\)/);
  assert.doesNotMatch(stage + client, /polygonOffset/, 'the pit floor (?ground=v1, ?postkill=v1) is untouched');
});
