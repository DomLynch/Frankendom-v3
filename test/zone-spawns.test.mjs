// Several bosses at their spots (live-zone phase 1b: data/zones/zone1.row.json spawns, data/respawn.json world, src/zone/spawns.ts, the wiring in
// src/client/main.ts and src/fight/scene.ts idleFoes). The rules are pure, so the whole life of a spawn is walked here: standing at its spot, the hero
// walking up, the fight, the kill and its own timer, the others untouched, the leash, the hero's death.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OPPONENTS } from '../src/fight/moves.ts';
import { initialPractice } from '../src/fight/combat.ts';
import { initialState } from '../src/fight/sim.ts';
import { playScaleFor, setPlayScale } from '../src/fight/play-radius.ts';
import * as play from '../src/fight/play-radius.ts';
import { zoneFor } from '../src/zone/zone-rows.ts';
import { WORLD, held, idleOnes, inAggro, isStanding, kill, leashed, nearestStanding, pitOrigin, poseAt, spotsFor, standing, tick, validateSpots } from '../src/zone/spawns.ts';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ZONE = zoneFor(''), FIGHT = read('../data/fight.json'), ROWS = read('../data/respawn.json');
setPlayScale(ROWS.world.pitScale);   // the circle the zone fights in (main.ts fresh(): data/respawn.json world.pitScale; the single fight keeps playScaleFor)
const wall = () => play.RADIUS;
const start = () => initialState();
const list = () => spotsFor(ZONE).map((s) => ({ ...s, deadFor: null }));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('the world rows are pinned: the pit area, centred, 1.5 m margin, 1 m from the wall, 6.5 m between spots; limits hold them', () => {
  assert.deepEqual({ ...WORLD, about: undefined }, { about: undefined, pitArea: 'duel-pit', centre: 0.5, retargetMargin: 1.5, edgeMetres: 1, minSpacing: 10, pitScale: 0.65 });
  for (const k of ['retargetMargin', 'edgeMetres', 'centre', 'minSpacing', 'pitScale']) assert.ok(WORLD[k] >= ROWS.limits[k][0] && WORLD[k] <= ROWS.limits[k][1], k);
  assert.deepEqual(pitOrigin(ZONE), { x: 226, z: 47 }, 'the Duel pit area (217..235, 38..56) is centred at 226, 47');
});

test('the shipped zone row: three spots inside the pit circle, none in the hero\'s start aggro, none inside another\'s, one rig kind', () => {
  const spots = spotsFor(ZONE);
  assert.equal(spots.length, 3);
  assert.doesNotThrow(() => validateSpots(spots, start(), wall(), WORLD, FIGHT.opponent));
  for (const s of spots) {
    assert.ok(Math.hypot(s.x, s.z) <= wall() - WORLD.edgeMetres, `${s.id} stands inside the wall`);
    assert.ok(dist(s, start()) > s.aggro, `${s.id}: the page does not open on a fight`);
    assert.ok(s.leash > s.aggro);
  }
  assert.deepEqual(spots.map((s) => [s.x, s.z]).map(([x, z]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100]), [[0, -6.17], [5.34, 3.09], [-5.34, 3.09]]);
  // Dom 2026-10-27 'space them about two times apart' (they stood 3.5 m from their neighbour): every pair is a row's distance apart or more, about 7 m
  for (const a of spots) for (const b of spots) if (a !== b) assert.ok(dist(a, b) >= WORLD.minSpacing, `${a.id} and ${b.id} are ${dist(a, b).toFixed(2)} m apart`);
  assert.ok(Math.min(...spots.flatMap((a) => spots.filter((b) => b !== a).map((b) => dist(a, b)))) >= 10.5, 'more than 10 m between neighbours (Dom: still too close at 6.9 m)');
  for (const s of spots) for (const t of spots) if (t !== s) assert.ok(s.leash < dist(s, t), `${s.id}: its leash (${s.leash} m) is shorter than the way to ${t.id}`);
  assert.equal(new Set(spots.map((s) => s.respawnSeconds)).size, 3, 'each has its own timer');
});

test('bad spots are refused: outside the wall, on the hero\'s start, inside each other\'s aggro, another kind, a bad world row', () => {
  const ok = spotsFor(ZONE), edit = (f) => { const s = structuredClone(ok); f(s); return s; };
  assert.throws(() => validateSpots(edit((s) => { s[0].x = 40; }), start(), wall()), /outside the pit's wall/);
  assert.throws(() => validateSpots(edit((s) => { s[0].x = 0; s[0].z = 1; }), start(), wall()), /inside its own aggro of the hero's start/);
  assert.throws(() => validateSpots(edit((s) => { s[1].x = s[0].x + 1; s[1].z = s[0].z; }), start(), wall()), /inside each other's aggro/);
  assert.throws(() => validateSpots(ok, start(), wall(), WORLD, 'nobody'), /one foe rig/);
  assert.throws(() => validateSpots(edit((s) => { s[1].id = s[0].id; }), start(), wall()), /share an id|aggro/);
  assert.throws(() => validateSpots(edit((s) => { s[0].x = 0; s[0].z = -2; s[1].x = 3; s[1].z = -2; }), start(), wall()), /closer than 10 m/);   // outside each other's 2.5 m aggro, inside the spacing row
  assert.throws(() => validateSpots(ok, start(), wall(), { ...WORLD, minSpacing: 99 }), /minSpacing/);
  assert.throws(() => validateSpots([], start(), wall()), /no spawn spots/);
  assert.throws(() => validateSpots(ok, start(), wall(), { ...WORLD, retargetMargin: 99 }), /retargetMargin/);
  assert.throws(() => validateSpots(ok, start(), wall(), { ...WORLD, edgeMetres: NaN }), /edgeMetres/);
  assert.throws(() => pitOrigin(ZONE, { ...WORLD, pitArea: 'nowhere' }), /no area/);
});

test('every spot makes a valid duel pose for a hero anywhere he can walk: the sim starts, never throws', () => {
  const spawns = list();
  for (let i = 0; i < spawns.length; i++) {
    for (let a = 0; a < 16; a++) for (const r of [0, 1, 2.5, 4.5]) {
      const hero = { x: r * Math.cos(a / 16 * 2 * Math.PI), z: r * Math.sin(a / 16 * 2 * Math.PI) };
      const pose = poseAt(hero, spawns[i], wall(), ROWS.spawn.minDistance, start());
      assert.ok(dist(pose.hero, pose.foe) >= ROWS.spawn.minDistance - 1e-9 || dist(pose.hero, start()) < 1e-9, `${spawns[i].id} from ${JSON.stringify(hero)}`);
      assert.doesNotThrow(() => initialPractice(731, OPPONENTS[FIGHT.opponent], undefined, null, undefined, undefined, undefined, pose));
    }
  }
});

test('standing at a spot: the nearest is held, the other two stand as copies; walking up to one engages exactly that one', () => {
  const spawns = list();
  assert.deepEqual(spawns.map(isStanding), [true, true, true]);
  const first = nearestStanding(spawns, start());
  assert.equal(inAggro(spawns, start()), -1, 'at the mark nobody is in aggro');
  assert.equal(idleOnes(spawns, first).length, 2, 'the other two stand at their spots');
  assert.ok(!idleOnes(spawns, first).includes(spawns[first]));
  const north = { x: spawns[0].x + 2, z: spawns[0].z + 1 };   // inside 2.5 m of the north spot only
  assert.equal(inAggro(spawns, north), 0);
  assert.equal(inAggro(spawns, { x: spawns[1].x - 1, z: spawns[1].z + 1 }), 1);
  assert.equal(inAggro(spawns, { x: spawns[2].x, z: spawns[2].z + 2 }), 2);
  const between = { x: (spawns[0].x + spawns[2].x) / 2, z: (spawns[0].z + spawns[2].z) / 2 };
  assert.equal(inAggro(spawns, between), -1, 'half-way between two bosses nobody is in aggro: the aggro circles (2.5 m) are far apart (6.9 m), a hero can walk between two');
  assert.equal(inAggro(spawns, { x: 0, z: 2 }), -1, 'walking between the east and west bosses along the line from the mark');
});

test('the sim\'s held spawn does not flicker half-way between two: it moves only when another is nearer by the margin', () => {
  const spawns = list(), m = WORLD.retargetMargin;
  const mid = { x: 0, z: 2 };   // the mark: equidistant (3.46 m) from east and west, the north one 6 m away
  assert.equal(held(spawns, 1, mid, m), 1); assert.equal(held(spawns, 2, mid, m), 2, 'held stays on a tie');
  assert.equal(held(spawns, 0, mid, m), 1, 'the north one is 2.5 m further than the east: past the margin, it moves');
  assert.equal(held(spawns, 1, { x: 0, z: -1.5 }, m), 0, 'well past the margin: it moves');
  const slightly = { x: 0, z: 0.5 };   // the north one is 4.5 m away, the east one 3.77 m: 0.7 m, inside the margin
  assert.equal(held(spawns, 0, slightly, m), 0);
  const dead = kill(spawns, 1);
  assert.equal(held(dead, 1, mid, m), 2, 'a dead held spawn is never kept: the nearest that stands');
  assert.equal(held(kill(kill(kill(spawns, 0), 1), 2), 0, mid, m), -1, 'none stands');
});

test('the life of a spawn: a kill starts ONLY its own timer; the others stand untouched; each comes back on its own respawnSeconds', () => {
  let s = list();
  s = kill(s, 0);
  assert.deepEqual(s.map((x) => x.deadFor), [0, null, null]);
  assert.deepEqual(idleOnes(s, 0).map((x) => x.id), [s[1].id, s[2].id], 'the dead one is not drawn standing');
  let t = tick(s, 39.9); s = t.spawns;
  assert.deepEqual(t.due, []); assert.ok(Math.abs(s[0].deadFor - 39.9) < 1e-9);
  assert.deepEqual([s[1].deadFor, s[2].deadFor], [null, null]);
  s = kill(s, 2);   // a second boss falls while the first is nearly back: its timer is its own (90 s), not the first's
  t = tick(s, 0.2); s = t.spawns;
  assert.deepEqual(t.due, [0], 'the first (40 s) is due'); assert.equal(isStanding(s[0]), true); assert.equal(isStanding(s[2]), false);
  t = tick(s, 59.7); s = t.spawns;
  assert.deepEqual(t.due, [], 'the third has 59.9 of 90 s'); s = kill(s, 1);
  t = tick(s, 30.2); s = t.spawns;
  assert.deepEqual(t.due, [2], 'the third (90 s) is due 90 s after ITS kill'); assert.ok(!isStanding(s[1]), 'the second (60 s) has 30.2 s');
  t = tick(s, 30); assert.deepEqual(t.due, [1]);
  assert.deepEqual(t.spawns.map(isStanding), [true, true, true]);
});

test('a hero who walked on after a kill meets the next boss: the dead one is skipped, the standing ones are found', () => {
  let s = kill(list(), 0);
  const nearDead = { x: s[0].x + 1, z: s[0].z + 1 };
  assert.equal(inAggro(s, nearDead), -1, 'he stands by the corpse: nothing to engage there');
  assert.equal(nearestStanding(s, nearDead), 1, 'the nearest that stands is the east one, not the corpse');
  assert.equal(inAggro(s, { x: s[1].x - 2, z: s[1].z }), 1);
  s = standing(s);
  assert.equal(inAggro(s, nearDead), 0, 'after the respawn the same spot is a boss again');
});

test('the leash: only a hero past the engaged spawn\'s own leash resets it', () => {
  const s = list()[0];
  assert.equal(leashed(s, { x: s.x + s.leash - 0.1, z: s.z }), false);
  assert.equal(leashed(s, { x: s.x + s.leash + 0.1, z: s.z }), true);
  const far = { x: 0, z: wall() - 0.05 };   // the far side of the circle from the north spot: a hero can really get past a 5 m leash inside the 5.05 m circle
  assert.equal(leashed(s, far), true, 'reachable inside the wall');
  assert.ok(Math.hypot(far.x, far.z) <= wall());
});

test('the page wires it: one sim, every frame zoneStep, the auto-draw waits for the aggro, the others drawn as copies, the old single-spawn timer is gone', () => {
  const main = src('../src/client/main.ts'), scene = src('../src/fight/scene.ts');
  assert.match(main, /if \(ZONE\) zoneStep\(dt\)/);
  assert.match(main, /startAction\(autoStart && \(!ZONE \|\| engaged\), practice, intent\.action\)/);
  assert.match(main, /view\.idleFoes\(idleOnes\(spawns, current\)/);
  assert.match(main, /validateSpots\(SPOTS, initialState\(\), RADIUS, WORLD, ZONE\.spawn\.kind\)/);
  assert.match(main, /setPlayScale\(ZONE \? WORLD\.pitScale : playScaleFor\(opponentId, Infinity\)\)/, 'the zone fights in the wider pit; the single fight (ZONE null, ?postkill=v1) keeps playScaleFor, Gate 0 untouched');
  assert.ok(ROWS.world.pitScale * 11.7 - 0.425 - ROWS.world.edgeMetres > 0 && 0.65 * 11.7 - 0.425 - 1 >= 6.1, 'the zone wall holds spots a ring of 6.1 m or more');
  const live = main.split('\n').map((l) => l.replace(/\s\/\/.*$/, '')).join('\n');   // code with the trailing // comments stripped
  assert.match(live, /setPlayScale\([^;]*\); setLateNotice\(true\); setStab\(true\); setStanceRows\(true\);/, 'the era flags are live code in fresh(), not swallowed by a comment');
  assert.match(main, /spawns = kill\(spawns, current\)/);
  assert.match(main, /leashed\(spawns\[current\]!, hero(, openerLift)?\)/);
  assert.doesNotMatch(main, /respawnDue|sinceKill/);
  assert.match(scene, /idleFoes\(list: readonly \{ x: number; z: number; heading: number \}\[\]\)/);
  assert.match(scene, /snapshotRig\(opponent, false\)/);
  assert.match(scene, /syncIdleFoes\(practice\);\n\s*syncLiveFoes\(dt\);\n\s*if \(!look\?\.render\(\)\)/, 'the copies are placed just before the draw');
});

test('?postkill=v1 and a one-spawn zone are the old fight: no zone state, the sim at the pit marks', () => {
  const main = src('../src/client/main.ts');
  assert.match(main, /const SPOTS = ZONE \? spotsFor\(zoneFor\(search\)\) : \[\];/, 'no ZONE (?postkill=v1) = no spots, no copies, no zoneStep');
  assert.match(main, /if \(ZONE\) \{ current = nearestStanding/);
  assert.match(main, /if \(ZONE\) \{ view\.idleFoes/);
});
