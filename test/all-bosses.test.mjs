// ALL-BOSSES batch test (mechanics batch gate): ONE data-driven loop over every boss row, no per-boss literals. Reads data/rings.json, profiles.json, boss-weapons.json, mechanics.json, rig.json and
// test/fixtures/boss-expect.json (the documented exceptions live THERE, as data: `weaponRowExceptions`). Asserts at data level: (1) a weapon row resolves (or the boss is a listed exception) and its
// weapon file exists, is a glTF binary and, where the row records a sha256, that hash is well formed; (2) the body has a cut manifest with the six cut units; (3) every mechanic is a row with a
// registered module, a ring boss that names it and exactly one registry entry; a boss without a mechanic has none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { MECHANICS, createMechanics } from '../src/fight/mechanics/index.ts';
import { weaponRowOfProfile, readData, root } from './helpers/boss-rows.mjs';

const EXPECT = JSON.parse(readFileSync(path.join(root, 'test/fixtures/boss-expect.json'), 'utf8'));
const PROFILES = readData('profiles'), RINGS = readData('rings'), MECH = readData('mechanics'), WEAPONS = readData('boss-weapons'), RIG = readData('rig');
const bosses = Object.keys(EXPECT.bosses);
const UNITS = ['head', 'arm_left', 'arm_right', 'leg_left', 'leg_right', 'waist'];   // the six cut units
const PLANES = ['neck', 'shoulder_left', 'shoulder_right', 'hip_left', 'hip_right', 'waist'];   // the manifest's cut planes, one per unit

test('every ring boss and every profile has an expectation row to test', () => {
  for (const b of RINGS.bosses) assert.ok(bosses.includes(b.kind), `ring boss ${b.kind} is in the expectation data`);
  for (const p of PROFILES.profiles) assert.ok(bosses.includes(p.id) || EXPECT.pending.includes(p.id), `profile ${p.id} is in the expectation data`);
});

test('the bosses with no weapon row are exactly the exceptions the data lists', () => {
  const none = bosses.filter((k) => !weaponRowOfProfile(k) || EXPECT.bosses[k].row === null).sort();
  assert.deepEqual(none, Object.keys(EXPECT.weaponRowExceptions).sort());
});

for (const kind of bosses) {
  test(`${kind}: weapon row (or listed exception), weapon file, cut manifest with the six units`, () => {
    const want = EXPECT.bosses[kind], row = weaponRowOfProfile(kind);
    // (1) weapon
    if (kind in EXPECT.weaponRowExceptions) assert.equal(want.row, null, `${kind}: a listed exception has no row`);
    else {
      assert.ok(row, `${kind}: resolves a data/boss-weapons.json row`);
      assert.equal(row.id, want.row);
      assert.ok(WEAPONS.rows.some((r) => r.id === row.id));
    }
    const file = path.join(root, `src/assets/weapons/foe/${want.equip}.glb`);
    assert.ok(existsSync(file), `${kind}: ${want.equip}.glb exists`);
    assert.equal(readFileSync(file).subarray(0, 4).toString('latin1'), 'glTF', `${kind}: ${want.equip}.glb is a glTF binary`);
    for (const h of (row?.placeholder ?? []).join(' ').matchAll(/sha256[ :]+([0-9a-fA-F]+)/g)) assert.match(h[1], /^[0-9a-f]{64}$/, `${kind}: the recorded sha256 is well formed`);
    // (2) cut manifest
    assert.ok(RIG.files[want.body.replace(/-106$/, '')], `${want.body}: data/rig.json files row`);
    const mf = path.join(root, `src/assets/${want.body}.cut.manifest.json`);
    assert.ok(existsSync(mf), `${want.body}: cut manifest exists`);
    const m = JSON.parse(readFileSync(mf, 'utf8'));
    assert.equal(m.schema, 'cut-pieces/1');
    assert.equal(PLANES.length, UNITS.length);
    const planes = Array.isArray(m.planes) ? m.planes : Object.keys(m.planes);   // older manifests key the planes, newer list them
    for (const pl of PLANES) assert.ok(planes.includes(pl), `${want.body}: cut plane ${pl}`);
    const cut = new Set([...m.regions.map((r) => r.detached_by), ...m.caps.map((c) => c.shown_when_cut)]);
    for (const u of ['head', 'arm_left', 'arm_right', 'leg_left', 'leg_right']) assert.ok(cut.has(u), `${want.body}: cut unit ${u} is a region or cap in the manifest`);
    assert.ok(cut.has('torso_waist') || cut.has('waist'), `${want.body}: the waist unit is in the manifest`);
  });
}

test('mechanics: row, registered module, ring boss that names it, exactly one registry entry', () => {
  const reg = createMechanics();
  for (const [id, row] of Object.entries(MECH.mechanics)) {
    assert.ok(MECHANICS[row.type], `${id}: registered module for type ${row.type}`);
    assert.equal(RINGS.bosses.filter((b) => b.mechanic === id).length, 1, `${id}: exactly one ring boss names it`);
    assert.equal(row.boss, RINGS.bosses.find((b) => b.mechanic === id)?.kind, `${id}: row boss is the ring boss that names it`);
    assert.equal(Object.values(MECH.mechanics).filter((r) => r.boss === row.boss).length, 1, `${row.boss}: one mechanic row`);
    assert.equal(reg.list.filter((m) => m.boss === row.boss).length, 1, `${row.boss}: one runtime in the registry`);
  }
  for (const b of RINGS.bosses) {
    if (b.mechanic === null) assert.equal(Object.values(MECH.mechanics).filter((r) => r.boss === b.kind).length, 0, `${b.kind}: no mechanic named, none keyed to it`);
    else assert.ok(MECH.mechanics[b.mechanic], `${b.kind}: mechanic key ${b.mechanic} is a row`);
  }
  assert.equal(reg.list.length, Object.keys(MECH.mechanics).length);
});
