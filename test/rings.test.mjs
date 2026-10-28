// BIOME RINGS (data/rings.json, src/zone/rings.ts; Dom 2026-10-28 "no switches, just get everything live in game"): ring 1 is the zone row's three bosses byte for byte, rings 2 and 3 take the nine
// merged bodies, each a profile row cloning Arachne's or the Minotaur's stats, placed by distance from the pit, harder with distance, never fetched on the first visit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { RINGS, ringBlend, ringLook, ringOf, ringOfSpawn, ringOrigin, ringPlace, ringSpawns, ringTune, ringedZone, ringLoadAfterKill } from '../src/zone/rings.ts';
import { validateRings } from '../src/sim/validate-rings.js';
import { mergeTune } from '../src/progression.ts';
import { ZONES, ringedZoneFor as zoneFor, zoneFor as plainZoneFor } from '../src/zone/zone-rows.ts';
import { WORLD, spotsFor, validateSpots, withinLoad } from '../src/zone/spawns.ts';
import { bodyOwnerOf } from '../src/fight/foe-body.ts';
import { validateZone } from '../src/sim/validate.js';
import { kindFightFor, kindProblem } from '../src/fight/spawn-kind.ts';
import { initialState } from '../src/fight/sim.ts';
import { foeDisplayName, setActiveKind, setKindNames } from '../src/fight/foe-name.ts';
import * as play from '../src/fight/play-radius.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const ZONE1 = read('zones/zone1.row'), PROFILES = read('profiles'), RIG = read('rig'), STAGE = read('stage'), PHYSICS = read('physics'), BOSSW = read('boss-weapons');
const PLATES = STAGE.skyline.ring.plates.map((p) => p.id);
const origin = ringOrigin(ZONE1);
const check = (rows = RINGS, zone = ZONE1) => validateRings(rows, zone, ringOrigin(zone), PROFILES.profiles.map((p) => p.id), RIG, PLATES);

test('the shipped rings validate against the profiles, the rig, the sky plates and the zone row', () => {
  assert.deepEqual(check(), []);
  assert.deepEqual(RINGS.rings.map((r) => r.id), ['ring-1', 'ring-2', 'ring-3']);
  assert.deepEqual(RINGS.bosses.map((b) => b.kind), ['pumpkinhulk', 'kachujin', 'castle-guard', 'parasite', 'anime-boy-black']);
  assert.ok(RINGS.bosses.every((b) => b.mechanic === null), 'one signature mechanic each, later: the row is null today');
});

test('ring 1 is the zone row\'s three bosses, byte for byte (the live ring-1 spawns are pinned)', () => {
  const live = zoneFor('');
  assert.deepEqual(live.spawns.slice(0, 3), ZONE1.spawns);
  assert.equal(JSON.stringify(live.spawns.slice(0, 3)), JSON.stringify(ZONE1.spawns));
  assert.deepEqual(ZONE1.spawns.map((s) => [s.id, s.kind, s.position.x, s.position.z, s.respawnSeconds]), [['yard-pitborn', 'gargantua', 226, 40.83, 40], ['pit-pitborn-east', 'arachne', 254, 59, 60], ['pit-pitborn-west', 'pitborn', 212, 78, 90]]);
  for (const s of ZONE1.spawns) assert.equal(ringOf(Math.hypot(s.position.x - origin.x, s.position.z - origin.z))?.id, 'ring-1');
  assert.ok(live.spawns.slice(3).every((s) => ringOfSpawn(s.id)), 'every spawn after the first three belongs to a ring');
  assert.equal(ZONES.default, '1');
});

test('rings 2 and 3 place the spawned bodies by distance from the pit, in their bands, with their own body', () => {
  const live = zoneFor(''), added = live.spawns.slice(3);
  assert.equal(added.length, RINGS.rings.reduce((n, r) => n + r.spawns.reduce((m, s) => m + s.count, 0), 0), 'one zone spawn per ring spawn instance');
  for (const s of added) {
    const ring = ringOfSpawn(s.id), d = Math.hypot(s.position.x - origin.x, s.position.z - origin.z);
    assert.ok(d >= ring.minDist - 0.01 && d <= ring.maxDist + 0.01, `${s.id} stands ${d} m from the pit, inside ${ring.id}`);
    assert.equal(s.body, RINGS.bosses.find((b) => b.kind === s.kind).body, `${s.id} is drawn in its own body`);
    assert.equal(s.kind, s.body, 'a ring boss\'s kind and body share the stem');
  }
  assert.deepEqual(added.filter((s) => ringOfSpawn(s.id).id === 'ring-2').map((s) => s.kind), ['pumpkinhulk', 'kachujin', 'castle-guard']);
  assert.deepEqual(added.filter((s) => ringOfSpawn(s.id).id === 'ring-3').map((s) => s.kind), ['parasite', 'anime-boy-black']);
  assert.deepEqual(ringSpawns(origin), added, 'the zone is the row plus the generated spawns, nothing else');
  assert.deepEqual(ringPlace({ x: 0, z: 0 }, { angleDeg: 90, stepDeg: 0, distance: 10 }, 0), { x: 10, z: 0 }, 'east is +x, north is -z');
  assert.deepEqual(ringPlace({ x: 0, z: 0 }, { angleDeg: 0, stepDeg: 90, distance: 10 }, 1), { x: 10, z: 0 }, 'instance i turns by stepDeg');
});

test('the ringed zone validates as a zone row and as spots the page can stand (spacing, start clearance, spread, kinds)', () => {
  const kinds = PROFILES.profiles.map((p) => p.id), live = zoneFor('');
  assert.deepEqual(validateZone(live, kinds, RIG), []);
  const spots = spotsFor(live), wall = play.RADIUS;
  assert.doesNotThrow(() => validateSpots(spots, initialState(), wall, WORLD, kinds));
  assert.ok(WORLD.spreadRadiusMetres >= Math.max(...spots.map((s) => Math.hypot(s.x, s.z) + Math.max(s.leash, wall))), 'ring 3 lies inside the spawn extent');
  const nearest = (s) => Math.min(...spots.filter((t) => t !== s).map((t) => Math.hypot(s.x - t.x, s.z - t.z)));
  for (const s of spots.slice(3)) assert.ok(nearest(s) >= WORLD.minSpacing * 1.5, `${s.id} stands well clear of every other camp (${nearest(s)} m): the camp stays quiet`);
});

test('every ring boss is a profile row cloning Arachne\'s or the Minotaur\'s: same archetype, health scale, damage scale and brain', () => {
  const by = (id) => PROFILES.profiles.find((p) => p.id === id);
  for (const b of RINGS.bosses) {
    const row = by(b.kind), src = by(row.opponent === 'shieldmaiden' ? 'arachne' : 'pitborn');
    assert.equal(row.name, b.name);
    for (const k of ['opponent', 'foeHealthScale', 'foeDamageScale', 'brain', 'body']) assert.equal(row[k], src[k], `${b.kind}.${k} matches ${src.id}`);
    assert.equal(kindProblem(b.kind, PROFILES.profiles), null);
  }
});

test('refusals: each bad row names its problem', () => {
  const refuse = (edit, re) => { const r = clone(RINGS); edit(r); assert.match(check(r).join('\n'), re); };
  refuse((r) => { r.rings[1].minDist = 50; }, /overlaps ring ring-1/);
  refuse((r) => { r.rings[2].spawns[0].distance = 500; }, /outside the band|inside 0\.\.400|distance/);
  refuse((r) => { r.rings[1].spawns[0].distance = 10; }, /outside the band/);
  refuse((r) => { r.rings[1].groundTint = 'tan'; }, /groundTint/);
  refuse((r) => { r.rings[1].skyPlates.north = 1; }, /no sky ring plate/);
  refuse((r) => { delete r.rings[1].skyPlates.east; }, /skyPlates\.east/);
  refuse((r) => { r.rings[1].health = 0; }, /health/);
  refuse((r) => { r.bosses[0].body = 'psyche'; r.bosses[0].body = 'nobody'; }, /body/);
  refuse((r) => { r.bosses[0].kind = 'nobody'; }, /no data\/profiles\.json row/);
  refuse((r) => { r.bosses[0].mechanic = 'spin'; }, /mechanic/);
  refuse((r) => { r.rings[2].spawns[1].kind = r.rings[2].spawns[0].kind; }, /two places/);
  refuse((r) => { r.bosses[0].leash = r.bosses[0].aggro; }, /leash/);
  refuse((r) => { r.rings[1].spawns[0].count = 0; }, /count/);
  const z = clone(ZONE1); z.spawns[0].position = { x: 300, z: 40 };
  assert.match(check(RINGS, z).join('\n'), /outside ring ring-1/, 'a zone spawn that leaves ring 1 is refused');
});

test('difficulty rises with distance: ring 1 adds nothing, each ring multiplies its bosses; the ?tune= map and escalation stack on it', () => {
  const t = ringTune();
  for (const k of ['gargantua', 'arachne', 'pitborn']) assert.equal(t[k], undefined, `${k} (ring 1) is untouched`);
  const [r1, r2, r3] = RINGS.rings;
  assert.ok(r1.health <= r2.health && r2.health < r3.health && r1.damage <= r2.damage && r2.damage < r3.damage);
  for (const s of r2.spawns) assert.deepEqual(t[s.kind], { health: r2.health, damage: r2.damage });
  for (const s of r3.spawns) assert.deepEqual(t[s.kind], { health: r3.health, damage: r3.damage });
  const stacked = mergeTune({ [r2.spawns[0].kind]: { health: 2 } }, t);
  assert.equal(stacked[r2.spawns[0].kind].health, 2 * r2.health);
  assert.deepEqual(ringTune({ ...RINGS, rings: RINGS.rings.map((r) => ({ ...r, health: 1, damage: 1 })) }), {}, 'all ones adds nothing');
});

test('the same health at ring 1 multipliers: a ring boss fights as its source archetype, scaled by its ring only', () => {
  const ctx = (tune) => ({ profiles: PROFILES.profiles, difficulty: read('difficulty'), brains: read('brains').brains, pick: read('difficulty').default, search: '', level: read('fight').level, ai: read('fight').ai, override: null, tune, weapon: read('fight').weapon, skill: read('fight').skill, skill2: read('fight').skill2, stance: read('fight').stance, specials: read('fight').specials });
  const base = kindFightFor('pitborn', ctx({})), mine = kindFightFor('parasite', ctx({})), ringed = kindFightFor('parasite', ctx(ringTune()));
  assert.equal(mine.opponentId, base.opponentId);
  assert.equal(mine.resolved.foeHealthScale, base.resolved.foeHealthScale, 'the clone is at the Minotaur\'s health');
  assert.equal(ringed.resolved.foeHealthScale, mine.resolved.foeHealthScale * RINGS.rings[2].health, 'ring 3 multiplies it');
  assert.equal(kindFightFor('pumpkinhulk', ctx({})).resolved.foeHealthScale, kindFightFor('pitborn', ctx({})).resolved.foeHealthScale);
});

test('first-visit weight: a ring boss is never fetched on the first visit nor in the background after the first kill, only when the hero walks up to it', () => {
  const live = zoneFor(''), spots = spotsFor(live), hero = { x: 0, z: 0 };
  for (const s of spots.slice(3)) {
    assert.equal(withinLoad(s, hero, undefined, false), false, `${s.id}: not fetched at the start`);
    assert.equal(withinLoad(s, hero, undefined, true), false, `${s.id}: not fetched after a kill at the pit either`);
    const ring = ringOfSpawn(s.id), at = { x: s.x, z: s.z + Math.min(ring.loadAfterKillMetres, WORLD.loadWithinMetres) - 1 };
    assert.equal(withinLoad(s, at, undefined, false), true, `${s.id}: fetched when the hero is near`);
  }
  for (const s of spots.slice(0, 3)) assert.equal(withinLoad(s, hero, undefined, true), Math.hypot(s.x, s.z) <= WORLD.loadRadiusAfterKillMetres, 'ring 1 keeps the after-kill rule as it was');
  assert.equal(ringLoadAfterKill('yard-pitborn', 77), 77, 'a zone-row spawn takes the world row');
  assert.ok(RINGS.rings.slice(1).every((r) => r.loadAfterKillMetres !== null && r.loadAfterKillMetres < WORLD.loadRadiusAfterKillMetres));
});

test('the look blends by distance: ring 1 is today\'s floor and sky, then the rings\' tints and plate weights', () => {
  const [r1, r2, r3] = RINGS.rings;
  assert.equal(r1.groundTint, '#ffffff'); assert.ok(Object.values(r1.skyPlates).every((w) => w === 1), 'ring 1 leaves the plates as graded');
  assert.deepEqual(ringLook(0), { tintA: r1.groundTint, tintB: r1.groundTint, t: 0, plates: r1.skyPlates });
  assert.equal(ringBlend(r2.blendAtMetres).a.id, 'ring-1', 'at ring 2\'s centre the mix has reached ring 2');
  const mid = ringLook((r1.blendAtMetres + r2.blendAtMetres) / 2);
  assert.equal(mid.t, 0.5); assert.equal(mid.tintA, r1.groundTint); assert.equal(mid.tintB, r2.groundTint);
  assert.equal(mid.plates.east, (r1.skyPlates.east + r2.skyPlates.east) / 2);
  assert.deepEqual(ringLook(9999), { tintA: r3.groundTint, tintB: r3.groundTint, t: 0, plates: r3.skyPlates }, 'beyond the last ring: the last ring');
  assert.equal(JSON.stringify(Object.keys(ringLook(10).plates).sort()), JSON.stringify([...PLATES].sort()), 'the existing sky ring plates only; no new art');
});

test('the bodies: each is in rig.json with its clips, drawn with its archetype\'s weapon, and dies plain (no cut manifest, no physics row, no error)', () => {
  const clips = RIG.clips106.dir;
  for (const b of RINGS.bosses) {
    const file = RIG.files[b.body];
    assert.ok(file && clips[file], `${b.body} is a rig body with a clips folder`);
    const owner = PROFILES.profiles.find((p) => p.id === b.kind).opponent;
    assert.equal(bodyOwnerOf(file), owner, `${b.body} is drawn with ${owner}'s weapon`);
    assert.equal(existsSync(new URL(`../src/assets/${file}.cut.manifest.json`, import.meta.url)), false, `${b.body} has no cut manifest: the plain death`);
    assert.ok(!PHYSICS.opponents.some((o) => o.body === b.body), `${b.body} has no physics opponents row: no ragdoll to throw`);
  }
  assert.ok(BOSSW.rows.some((r) => r.opponent === 'shieldmaiden'), 'the shieldmaiden clones take Arachne\'s axe and shield row');
  assert.equal(BOSSW.rows.some((r) => r.opponent === 'pitborn' && r.profile == null), false, 'the pitborn clones take the Minotaur\'s own cleaver, unless a profile row of their own says otherwise');
  assert.deepEqual(BOSSW.rows.filter((r) => r.opponent === 'pitborn').map((r) => r.profile), ['anime-boy-black', 'pumpkinhulk'], 'only Ryo (the sword) and Lord Gourd (the mace) have a pitborn profile row; the other pitborn clones are unchanged');
});

test('wiring pins: the page lays the ring tune under the address\'s, mixes the look per frame, and scene arms ring bodies by their archetype', () => {
  const main = readFileSync(new URL('../src/client/main.ts', import.meta.url), 'utf8'), scene = readFileSync(new URL('../src/fight/scene.ts', import.meta.url), 'utf8');
  assert.match(main, /const BASE_TUNE = mergeTune\(TUNED, ringTune\(\)\)/);
  assert.match(main, /KIND_CTX\.tune = mergeTune\(BASE_TUNE, escalation/);
  assert.match(main, /view\.ringLook\(look\.tintA, look\.tintB, look\.t, look\.plates\)/);
  assert.match(scene, /bossWeaponFor\(bodyOwnerOf\(file\)!, pageSearch, undefined, bodyProfileOf\(file\)\)/);
  assert.match(scene, /plateWeights\(plates\)/);
});

test('names: a ring boss is named by its own profile row; Arachne and the Minotaur keep theirs although the ring bosses clone their archetypes', () => {
  setKindNames(PROFILES.profiles);
  assert.deepEqual(['shieldmaiden', 'pitborn'].map(foeDisplayName), ['Arachne', 'Minotaur'], 'the first row of an archetype names it');
  for (const b of RINGS.bosses) { setActiveKind(b.kind); assert.equal(foeDisplayName(PROFILES.profiles.find((p) => p.id === b.kind).opponent), b.name); }
  setActiveKind('arachne'); assert.equal(foeDisplayName('shieldmaiden'), 'Arachne');
  setKindNames([]);
});

test('the zone set carries the ringed row and nothing else changed about it', () => {
  const live = zoneFor('');
  assert.deepEqual(ZONES.rows['1'], ZONE1, 'the zone set (zoneFor in zone-rows.ts) is the row as it was: only the page\'s zone, src/stubs.ts zoneFor, carries the rings');
  assert.deepEqual(plainZoneFor(''), ZONE1);
  assert.deepEqual({ ...live, spawns: undefined }, { ...ZONE1, spawns: undefined });
  assert.deepEqual(ringedZone(ZONE1), live);
  assert.deepEqual(ringedZone(ZONE1, { ...RINGS, rings: RINGS.rings.map((r) => ({ ...r, spawns: [] })) }), ZONE1, 'no ring spawns: the very zone row');
});
