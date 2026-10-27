// The zone row, its loader and its validator (data/zones/, src/zone/zone-rows.ts, src/sim/validate.js validateZone). Pins the default zone and every field range.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ZONES, buildZoneSet, zoneFor, zoneIdFromSearch } from '../src/zone/zone-rows.ts';
import { ZONE_RANGES, validateZone, validateZoneIndex } from '../src/sim/validate.js';
import { ROSTER } from '../src/roster.ts';

const dir = new URL('../data/zones/', import.meta.url);
const json = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const INDEX = json('index.json');
const ROW = json('zone1.row.json');
const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const KINDS = Object.keys(ROSTER);

test('the shipped zone row validates, spawn kinds included', () => {
  assert.deepEqual(validateZone(ROW, KINDS), []);
  assert.deepEqual(validateZoneIndex(INDEX, { [ROW.id]: ROW }), []);
});

test('the default zone is a data row: zone "1", the string, listed and loaded', () => {
  assert.equal(INDEX.default, '1');
  assert.equal(typeof INDEX.default, 'string');
  assert.deepEqual(INDEX.zones, ['1']);
  assert.equal(ZONES.default, '1');
  assert.deepEqual(Object.keys(ZONES.rows), INDEX.zones, 'the rows the build imports are the rows the index lists');
  assert.equal(zoneFor('').id, '1');
  assert.equal(zoneFor('?zone=1').id, '1');
});

test('every row file in data/zones is imported by the loader (nothing listed without a row, no row unlisted)', () => {
  const files = readdirSync(dir).filter((f) => /^zone.+\.row\.json$/.test(f));
  assert.deepEqual(files.map((f) => json(f).id).sort(), Object.keys(ZONES.rows).sort());
});

test('the shipped row pinned: id, band, respawn, areas, the spawn', () => {
  assert.equal(ROW.id, '1');
  assert.deepEqual(ROW.band, [1, 10]);
  assert.equal(ROW.pvp, 'on');
  assert.deepEqual(ROW.respawn, { x: 200, z: 54, facing: 3.142, downSeconds: 2, died: 'You died' });
  assert.deepEqual(ROW.areas.map((a) => [a.id, a.pvp, a.spawnsAllowed]), [['yard', 'off', false], ['duel-pit', 'on', true]]);
  assert.deepEqual(ROW.spawns.map((x) => [x.id, x.respawnSeconds]), [['yard-pitborn', 40], ['pit-pitborn-east', 60], ['pit-pitborn-north', 90]], 'three bosses, each its own timer (live-zone phase 1b)');
  for (const x of ROW.spawns) {
    assert.equal(x.kind, FIGHT.opponent, "today's spawns are the opponent data/fight.json names (one foe rig is built)");
    assert.ok(KINDS.includes(x.kind), 'kind is a roster opponent id');
    assert.equal(x.roster, true);
    assert.deepEqual(x.behaviour, { aggro: 2.5, leash: 6, roam: 2.6, campSize: [1, 1] });
  }
  const s = ROW.spawns[0];
  const yard = ROW.areas[0];
  assert.ok(ROW.respawn.x >= yard.min[0] && ROW.respawn.x <= yard.max[0] && ROW.respawn.z >= yard.min[1] && ROW.respawn.z <= yard.max[1], 'the hero respawns inside the yard');
});

test('the row stays inside every range', () => {
  const r = ZONE_RANGES, inR = (v, [lo, hi]) => v >= lo && v <= hi;
  assert.ok(ROW.band.every((v) => inR(v, r.band)));
  assert.ok(inR(ROW.respawn.facing, r.facing) && inR(ROW.respawn.downSeconds, r.downSeconds));
  for (const s of ROW.spawns) {
    assert.ok(inR(s.respawnSeconds, r.respawnSeconds) && inR(s.behaviour.aggro, r.aggro) && inR(s.behaviour.leash, r.leash) && inR(s.behaviour.roam, r.roam));
    assert.ok(s.behaviour.campSize.every((v) => inR(v, r.campSize)));
    assert.ok(s.behaviour.leash >= s.behaviour.aggro);
  }
});

// one case per field: change it, read the error
const refuse = (edit, pattern, kinds = KINDS) => { const row = clone(ROW); edit(row); assert.match(validateZone(row, kinds).join('\n'), pattern); };
test('every field range is enforced', () => {
  refuse((r) => { r.id = 1; }, /zone\.id/);
  refuse((r) => { r.id = 'z01:'; }, /zone\.id/);
  refuse((r) => { r.id = 'Zone One'; }, /zone\.id/);
  refuse((r) => { r.name = ''; }, /zone\.name/);
  refuse((r) => { r.alias = 'Yard'; }, /zone\.alias/);
  refuse((r) => { r.band = [0, 10]; }, /zone\.band\[0\]/);
  refuse((r) => { r.band = [1, 101]; }, /zone\.band\[1\]/);
  refuse((r) => { r.band = [5, 2]; }, /min is above max/);
  refuse((r) => { r.pvp = 'maybe'; }, /zone\.pvp/);
  refuse((r) => { r.respawn.x = null; }, /respawn\.x/);
  refuse((r) => { r.respawn.z = 'a'; }, /respawn\.z/);
  refuse((r) => { r.respawn.facing = 8; }, /respawn\.facing/);
  refuse((r) => { r.respawn.downSeconds = 0; }, /respawn\.downSeconds/);
  refuse((r) => { r.respawn.downSeconds = 61; }, /respawn\.downSeconds/);
  refuse((r) => { r.respawn.died = ''; }, /respawn\.died/);
  refuse((r) => { delete r.respawn.died; }, /respawn\.died/);
  refuse((r) => { r.areas[0].shape = 'circle'; }, /areas\[0\]\.shape/);
  refuse((r) => { r.areas[0].min = [300, 0]; }, /min must be below max/);
  refuse((r) => { r.areas[0].pvp = 1; }, /areas\[0\]\.pvp/);
  refuse((r) => { r.areas[0].spawnsAllowed = 'no'; }, /spawnsAllowed/);
  refuse((r) => { r.areas[1].id = 'yard'; }, /duplicate id 'yard'/);
  refuse((r) => { r.spawns = []; }, /at least one spawn/);
  refuse((r) => { r.spawns[0].kind = 'nobody'; }, /not an opponent profile id/);
  refuse((r) => { r.spawns[0].position.x = Infinity; }, /position\.x/);
  refuse((r) => { r.spawns[0].position = { x: 200, z: 50 }; }, /allows no spawns/);
  refuse((r) => { r.spawns[0].respawnSeconds = 0; }, /respawnSeconds/);
  refuse((r) => { r.spawns[0].respawnSeconds = 3601; }, /respawnSeconds/);
  refuse((r) => { r.spawns[0].roster = 'yes'; }, /roster/);
  refuse((r) => { r.spawns[0].behaviour.aggro = 0; }, /behaviour\.aggro/);
  refuse((r) => { r.spawns[0].behaviour.leash = 201; }, /behaviour\.leash/);
  refuse((r) => { r.spawns[0].behaviour.leash = 1; }, /shorter than aggro/);
  refuse((r) => { r.spawns[0].behaviour.roam = -1; }, /behaviour\.roam/);
  refuse((r) => { r.spawns[0].behaviour.campSize = [1]; }, /campSize/);
  refuse((r) => { r.spawns[0].behaviour.campSize = [2, 1]; }, /campSize/);
  refuse((r) => { r.spawns[0].behaviour.campSize = [1.5, 2]; }, /campSize/);
  refuse((r) => { r.spawns[0].behaviour.campSize = [1, 17]; }, /campSize/);
  refuse((r) => { r.spawns.push(clone(r.spawns[0])); }, /duplicate id 'yard-pitborn'/);
});

test('an unknown or missing key is rejected at every level', () => {
  refuse((r) => { r.extra = 1; }, /zone\.row\.extra: unknown key/);
  refuse((r) => { r.respawn.warp = 1; }, /respawn\.warp: unknown key/);
  refuse((r) => { r.areas[0].colour = 'red'; }, /areas\[0\]\.colour: unknown key/);
  refuse((r) => { r.spawns[0].loot = 'x'; }, /spawns\[0\]\.loot: unknown key/);
  refuse((r) => { r.spawns[0].behaviour.spread = 1; }, /behaviour\.spread: unknown key/);
  refuse((r) => { delete r.spawns[0].behaviour.leash; }, /behaviour\.leash/);
  refuse((r) => { delete r.spawns[0].position; }, /position/);
});

test('the index: a default that is not listed, or a listed id with no row, is refused', () => {
  const rows = { [ROW.id]: ROW };
  assert.match(validateZoneIndex({ ...INDEX, default: '2' }, rows).join('\n'), /default '2' is not in zones/);
  assert.match(validateZoneIndex({ ...INDEX, default: 1 }, rows).join('\n'), /default: must be a string/);
  assert.match(validateZoneIndex({ ...INDEX, zones: ['1', '2'] }, rows).join('\n'), /'2' has no row/);
  assert.match(validateZoneIndex(INDEX, { ...rows, 3: { ...ROW, id: '3' } }).join('\n'), /row '3' is not listed/);
  assert.match(validateZoneIndex({ ...INDEX, extra: 1 }, rows).join('\n'), /extra: unknown key/);
});

test('?zone=: a listed id picks that row; an unknown id plays the default with a console warning and never throws', () => {
  const test2 = { ...clone(ROW), id: 'test-2', alias: 'test-two' };
  const set = buildZoneSet({ ...INDEX, zones: ['1', 'test-2'] }, [ROW, test2]);
  assert.equal(zoneFor('?zone=test-2', set).id, 'test-2');
  assert.equal(zoneIdFromSearch('?x=1&zone=test-2'), 'test-2');
  assert.equal(zoneIdFromSearch('?x=1'), undefined);
  const warned = [], was = console.warn;
  console.warn = (...a) => warned.push(a.join(' '));
  try {
    assert.equal(zoneFor('?zone=nope', set).id, '1');
    assert.equal(zoneFor('?zone=', set).id, '1');
    assert.equal(zoneFor('?zone=z01:', set).id, '1');
  } finally { console.warn = was; }
  assert.equal(warned.length, 3);
  assert.match(warned[0], /unknown zone 'nope'/);
});

test('an invalid row is dropped (console error), the default still plays, and nothing throws', () => {
  const bad = { ...clone(ROW), id: 'broken', band: [9, 1] };
  const errors = [], warns = [], e = console.error, w = console.warn;
  console.error = (...a) => errors.push(a.join(' ')); console.warn = (...a) => warns.push(a.join(' '));
  let set;
  try {
    set = buildZoneSet({ ...INDEX, zones: ['1', 'broken'] }, [ROW, bad]);
    assert.equal(zoneFor('?zone=broken', set).id, '1');
    const empty = buildZoneSet({ ...INDEX }, []);
    assert.ok(zoneFor('', empty).id, 'an empty set still answers');
  } finally { console.error = e; console.warn = w; }
  assert.deepEqual(Object.keys(set.rows), ['1']);
  assert.match(errors.join('\n'), /zone row 'broken' is invalid/);
});
