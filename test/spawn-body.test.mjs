// Per-spawn body (Dom 2026-10-27, mixed bosses; docs/BOSS-BODIES.md): a zone spawn row may carry an optional `body` (a data/rig.json files stem). The shipped zone carries none, so every
// spawn keeps today's body; a bad body is rejected by the row check and by the page check; the scene keys its rig cache by the body's file stem and takes the live-body path unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateZone } from '../src/sim/validate.js';
import { foeBodyFile, setBossBody, spawnBodyFile, spotBodyProblems } from '../src/fight/foe-body.ts';
import { spotsFor } from '../src/zone/spawns.ts';
import { buildZoneSet } from '../src/zone/zone-rows.ts';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const RIG = read('rig'), PROFILES = read('profiles');
const ZONE = JSON.parse(readFileSync(new URL('../data/zones/zone1.row.json', import.meta.url), 'utf8'));
const INDEX = JSON.parse(readFileSync(new URL('../data/zones/index.json', import.meta.url), 'utf8'));
const kinds = PROFILES.profiles.map((p) => p.opponent);
const clone = (x) => structuredClone(x);

test('DEFAULT UNCHANGED: the shipped zone names no spawn body, and every spawn draws exactly the body its kind drew before', () => {
  setBossBody('');
  for (const s of ZONE.spawns) {
    assert.ok(!('body' in s), `${s.id} carries no body row`);
    assert.equal(spawnBodyFile(s.kind, 'ignored', undefined), foeBodyFile(s.kind, 'ignored'));
    assert.equal(spawnBodyFile(s.kind, 'ignored', undefined), 'minotaur-106');
  }
  assert.ok(spotsFor(ZONE).every((s) => !('body' in s)), 'a spot has no body key unless the row has one');
  assert.deepEqual(validateZone(ZONE, kinds, RIG), []);
  assert.deepEqual(spotBodyProblems(spotsFor(ZONE)), []);
});

test('a spawn body row: validated, carried to its spot, and it wins over the kind body (and loses to ?boss=)', () => {
  const row = clone(ZONE); row.spawns[1].body = 'psyche';
  assert.deepEqual(validateZone(row, kinds), [], 'without the rig rows only the shape is checked');
  assert.equal(spotsFor(row)[1].body, 'psyche');
  assert.equal(spotsFor(row)[0].body, undefined);
  setBossBody('');
  assert.equal(spawnBodyFile('pitborn', 'ignored', 'psyche'), 'psyche-106');
  assert.equal(spawnBodyFile('pitborn', 'ignored', undefined), 'minotaur-106');
  setBossBody('?boss=minotaur');
  assert.equal(spawnBodyFile('pitborn', 'ignored', 'psyche'), 'minotaur-106', '?boss= draws every boss in one body');
  setBossBody('');
});

test('a bad spawn body is rejected by the row check (with the rig rows), the page check and the set builder', () => {
  const unknown = clone(ZONE); unknown.spawns[0].body = 'no-such-body';
  assert.match(validateZone(unknown, kinds, RIG).join('\n'), /spawns\[0\]\.body: 'no-such-body' is not a data\/rig\.json files row/);
  const empty = clone(ZONE); empty.spawns[0].body = '';
  assert.match(validateZone(empty, kinds).join('\n'), /spawns\[0\]\.body: must be a non-empty string/);
  const unknownKey = clone(ZONE); unknownKey.spawns[0].bodie = 'x';
  assert.match(validateZone(unknownKey, kinds, RIG).join('\n'), /bodie: unknown key/);
  const noClips = clone(RIG); noClips.files.kachujin = 'kachujin-106';
  const clipless = clone(ZONE); clipless.spawns[0].body = 'kachujin';
  assert.match(validateZone(clipless, kinds, noClips).join('\n'), /no data\/rig\.json clips106\.dir folder/);
  const origError = console.error, origWarn = console.warn; console.error = console.warn = () => {};
  try { assert.deepEqual(Object.keys(buildZoneSet(INDEX, [unknown], undefined, RIG).rows), [], 'the bad row is dropped, never loaded'); } finally { console.error = origError; console.warn = origWarn; }
  // the page check: the hero's body is refused (two actors of one file share a rig that carries one weapon)
  const heroBody = spotBodyProblems([{ id: 'a', body: 'psyche' }], RIG, 'psyche');
  assert.match(heroBody.join('\n'), /spawn a body: 'psyche' is the hero's body/);
  assert.deepEqual(spotBodyProblems([{ id: 'a', body: 'minotaur' }], RIG, 'psyche'), []);
  assert.match(spotBodyProblems([{ id: 'b', body: 'x' }], RIG, 'psyche').join('\n'), /spawn b body: 'x' is not a data\/rig\.json files row/);
});

test('the scene: rig cache keyed by body file stem, the live body takes the old path, a loading or failed body draws nothing and never throws', () => {
  const src = readFileSync(new URL('../src/fight/scene.ts', import.meta.url), 'utf8');
  assert.match(src, /const bodyAssets = new Map<string,/, 'the cache is keyed by the body id (its 106 file stem)');
  assert.match(src, /if \(file === liveBody\) return warriors\.spawnFoe\(\);/, 'a spawn in the live body is the opponent\'s own spawnFoe, as before');
  assert.match(src, /warriors\.spawnBody\(asset, weapon, bossOfBody\(file\)\?\.clipsAs\)/, 'a body is armed with its boss weapon row (data/boss-weapons.json), else the page\'s foe weapon (weaponOfBody)');
  assert.match(src, /const weaponOfBody = \(file: string\): WeaponId \| undefined => bossOfBody\(file\)\?\.weapon \?\? builtFoeWeapon;/, 'no row: the page-wide foe weapon, as before');
  assert.match(src, /if \(!actor\) continue;/, 'a body still loading is not drawn yet');
  const chars = readFileSync(new URL('../src/fight/characters.ts', import.meta.url), 'utf8');
  assert.match(chars, /spawnBody: \(body: FighterAsset, weapon: WeaponId, clipsAs: WeaponId = weapon\) => create\(true,/, 'clipsAs defaults to the weapon: every body without a boss row takes its own clip family');
});
