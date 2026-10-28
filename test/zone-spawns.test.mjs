// Several bosses at their spots (live-zone phase 1b: data/zones/zone1.row.json spawns, data/respawn.json world, src/zone/spawns.ts, the wiring in
// src/client/main.ts and src/fight/scene.ts idleFoes). The rules are pure, so the whole life of a spawn is walked here: standing at its spot, the hero
// walking up, the fight, the kill and its own timer, the others untouched, the leash, the hero's death.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OPPONENTS } from '../src/fight/moves.ts';
import { initialPractice, stepPractice } from '../src/fight/combat.ts';
import { idleIntent } from '../src/fight/duel.ts';
import { startAction } from '../src/auto-start.ts';
import { initialState } from '../src/fight/sim.ts';
import { playScaleFor, setPlayScale } from '../src/fight/play-radius.ts';
import * as play from '../src/fight/play-radius.ts';
import { zoneFor } from '../src/zone/zone-rows.ts';
import { OPEN_RADIUS } from '../src/fight/play-radius.ts';
import { project } from '../src/fight/combat.ts';
import { poseFits, zoneDuel } from '../src/zone/spawns.ts';
import { spawnBodyFile } from '../src/fight/foe-body.ts';
import { WORLD, withinLoad, bossLoadAfterKill, held, idleOnes, inAggro, isStanding, kill, leashed, nearestStanding, pitOrigin, poseAt, spotsFor, standing, tick, validateSpots } from '../src/zone/spawns.ts';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ZONE = zoneFor(''), FIGHT = read('../data/fight.json'), ROWS = read('../data/respawn.json');
setPlayScale(ROWS.world.pitScale);   // the circle the zone fights in (main.ts fresh(): data/respawn.json world.pitScale; the single fight keeps playScaleFor)
const wall = () => play.RADIUS;
const start = () => initialState();
const list = () => spotsFor(ZONE).map((s) => ({ ...s, deadFor: null }));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// First-visit weight (late #188 finding, 2026-10-28): with spawns 2 and 3 in their own bodies the default page fetched both boss GLBs at load (+3.13 MB). A spawn whose body is not the live rig's is
// fetched only once the hero is within respawn.json world.loadWithinMetres of it (scene.ts holdBody / idleFoes `near`, main.ts withinLoad); the browser wire receipt is in the PR.
test('lazy boss bodies: no spawn that needs another body file is within load range of the hero at the page-load mark or the respawn mark', () => {
  const live = spawnBodyFile('gargantua', 'minotaur'), start0 = initialState(), ZR = ZONE.respawn;
  const others = list().filter((s) => spawnBodyFile(s.kind, 'minotaur', s.body) !== live);
  assert.ok(others.length >= 2, 'the zone has spawns in other bodies (Gargantua, Arachne)');
  for (const s of others) {
    assert.equal(withinLoad(s, start0), false, `${s.id} (${s.kind}) is ${dist(s, start0).toFixed(1)} m from the load mark: its file would be fetched at page load`);
    assert.equal(withinLoad(s, { x: ZR.x - pitOrigin(ZONE).x, z: ZR.z - pitOrigin(ZONE).z }), false, `${s.id} is within load range of the respawn point`);
    assert.equal(withinLoad(s, { x: s.x + WORLD.loadWithinMetres - 0.01, z: s.z }), true, 'walking up to it loads it');
    assert.equal(withinLoad(s, { x: s.x + WORLD.loadWithinMetres + 0.01, z: s.z }), false);
    assert.ok(WORLD.loadWithinMetres > s.aggro + 5, 'the load starts well before the aggro, so the body is in before the fight');
  }
});

test('lazy boss bodies: scene.ts fetches a non-live body only behind the hero-near gate (holdBody and idleFoes), main.ts passes the distance', () => {
  const scene = src('../src/fight/scene.ts'), main = src('../src/client/main.ts');
  assert.match(scene, /holdBody\(spawn: SpawnRef \| null \| undefined, near = true\)/);
  assert.match(scene, /if \(!near && body !== liveBody && !bodyAssets\.has\(body\) && !heldCtl\?\.has\(body\)\) return 'same'/);
  assert.match(scene, /e\.near !== false \|\| bodyAssets\.has\(bodyOfSpawn\(e\.spawn\)\) \|\| bodyOfSpawn\(e\.spawn\) === liveBody/);
  assert.match(main, /view\.holdBody\(spawns\[current\], withinLoad\(spawns\[current\]!, state, undefined, bossKilled\)\)/);
  assert.match(main, /near: withinLoad\(s, state, undefined, bossKilled\)/);
});

test('the world rows are pinned: the pit area, centred, 1.5 m margin, 1 m from the wall, 6.5 m between spots; limits hold them', () => {
  assert.deepEqual({ ...WORLD, about: undefined }, { about: undefined, pitArea: 'duel-pit', centre: 0.5, retargetMargin: 1.5, edgeMetres: 1, minSpacing: 30, startClearance: 25, leashMargin: 15, pitScale: 0.65, spreadRadiusMetres: 180, loadWithinMetres: 24, loadAfterKill: true, loadRadiusAfterKillMetres: 120, loadQuery: 'bossload', loadOff: 'v1' });
  for (const k of ['retargetMargin', 'edgeMetres', 'centre', 'minSpacing', 'startClearance', 'leashMargin', 'pitScale', 'spreadRadiusMetres', 'loadWithinMetres', 'loadRadiusAfterKillMetres']) assert.ok(WORLD[k] >= ROWS.limits[k][0] && WORLD[k] <= ROWS.limits[k][1], k);
  assert.deepEqual(pitOrigin(ZONE), { x: 226, z: 47 }, 'the Duel pit area (217..235, 38..56) is centred at 226, 47');
});

test('the shipped zone row: three spots across the zone\'s ground (leash circle on it), none on the pit wall, none in the hero\'s start aggro, none inside another\'s, one rig kind', () => {
  const spots = spotsFor(ZONE);
  assert.equal(spots.length, 3);
  assert.doesNotThrow(() => validateSpots(spots, start(), wall(), WORLD, read('../data/profiles.json').profiles.map((p) => p.id)));   // re-pinned 2026-10-28: spawns 2 and 3 are the gargantua / arachne profile rows (Dom)
  for (const s of spots) {
    assert.ok(Math.hypot(s.x, s.z) + Math.max(s.leash, wall()) <= WORLD.spreadRadiusMetres, `${s.id}: its fight arena lies inside the spawn extent`);
    assert.ok(dist(s, start()) > s.aggro, `${s.id}: the page does not open on a fight`);
    assert.ok(s.leash > s.aggro);
  }
  assert.deepEqual(spots.map((s) => [s.x, s.z]).map(([x, z]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100]), [[0, -6.17], [28, 12], [-14, 31]]);
  assert.ok(spots.some((s) => Math.hypot(s.x, s.z) > wall()), 'spawns stand beyond the pit\'s wall (PR B2)');
  // Dom 2026-10-27 'space them about two times apart' (they stood 3.5 m from their neighbour): every pair is a row's distance apart or more, about 7 m
  for (const a of spots) for (const b of spots) if (a !== b) assert.ok(dist(a, b) >= WORLD.minSpacing, `${a.id} and ${b.id} are ${dist(a, b).toFixed(2)} m apart`);
  assert.ok(Math.min(...spots.flatMap((a) => spots.filter((b) => b !== a).map((b) => dist(a, b)))) >= 10.5, 'more than 10 m between neighbours (Dom: still too close at 6.9 m)');
  assert.equal(new Set(spots.map((s) => s.respawnSeconds)).size, 3, 'each has its own timer');
});

test('bad spots are refused: off the zone\'s ground, in the pit wall, on the hero\'s start, inside each other\'s aggro, another kind, a bad world row', () => {
  const ok = spotsFor(ZONE), edit = (f) => { const s = structuredClone(ok); f(s); return s; };
  const arena = (s) => Math.max(s.leash, wall());
  assert.throws(() => validateSpots(edit((s) => { s[0].x = WORLD.spreadRadiusMetres + 20; }), start(), wall()), /outside the zone's spawn extent/);
  assert.throws(() => validateSpots(edit((s) => { s[0].x = 0; s[0].z = -(WORLD.spreadRadiusMetres - arena(s[0]) + 0.1); }), start(), wall()), /outside the zone's spawn extent/, 'the fight arena must lie inside it, not only the spot');
  assert.doesNotThrow(() => validateSpots(edit((s) => { s[0].x = 0; s[0].z = -(WORLD.spreadRadiusMetres - arena(s[0]) - 0.1); }), start(), wall()), 'a spot well beyond the pit is fine');
  assert.doesNotThrow(() => validateSpots(edit((s) => { s[0].x = 0; s[0].z = -wall(); }), start(), wall()), 'there is no pit wall to stand in any more: open ground');
  assert.throws(() => validateSpots(ok, start(), wall(), { ...WORLD, spreadRadiusMetres: 999 }), /spreadRadiusMetres/);
  assert.throws(() => validateSpots(edit((s) => { s[0].x = 0; s[0].z = 1; }), start(), wall()), /inside its own aggro of the hero's start/);
  assert.throws(() => validateSpots(edit((s) => { s[1].x = s[0].x + 1; s[1].z = s[0].z; }), start(), wall()), /inside each other's aggro/);
  assert.throws(() => validateSpots(ok, start(), wall(), WORLD, ['nobody']), /names kind "gargantua", which is no profile row/);
  assert.throws(() => validateSpots(edit((s) => { s[1].id = s[0].id; }), start(), wall()), /share an id|aggro/);
  assert.throws(() => validateSpots(edit((s) => { s[0].x = 0; s[0].z = -2; s[1].x = 3; s[1].z = -2; }), start(), wall()), /closer than 30 m/);   // outside each other's 2.5 m aggro, inside the spacing row
  assert.throws(() => validateSpots(ok, start(), wall(), { ...WORLD, minSpacing: 99 }), /minSpacing/);
  assert.throws(() => validateSpots([], start(), wall()), /no spawn spots/);
  assert.throws(() => validateSpots(ok, start(), wall(), { ...WORLD, retargetMargin: 99 }), /retargetMargin/);
  assert.throws(() => validateSpots(ok, start(), wall(), { ...WORLD, edgeMetres: NaN }), /edgeMetres/);
  assert.throws(() => pitOrigin(ZONE, { ...WORLD, pitArea: 'nowhere' }), /no area/);
});

test('every spot makes a valid duel pose for a hero anywhere he can walk: the sim starts, never throws', () => {
  const spawns = list();
  for (let i = 0; i < spawns.length; i++) {
    for (let a = 0; a < 16; a++) for (const r of [0, 1, 2.5, 4.5, 12, 20, WORLD.spreadRadiusMetres]) {
      const hero = { x: r * Math.cos(a / 16 * 2 * Math.PI), z: r * Math.sin(a / 16 * 2 * Math.PI) };
      const pose = poseAt(hero, spawns[i], OPEN_RADIUS, ROWS.spawn.minDistance, start());
      assert.ok(dist(pose.hero, pose.foe) >= ROWS.spawn.minDistance - 1e-9 || dist(pose.hero, start()) < 1e-9, `${spawns[i].id} from ${JSON.stringify(hero)}`);
      assert.deepEqual(pose.foe, { x: spawns[i].x, z: spawns[i].z }, `${spawns[i].id}: the boss stands at its own spot, never at the pit's marks`);
      if (dist(hero, spawns[i]) >= ROWS.spawn.minDistance) assert.deepEqual(pose.hero, hero, `${spawns[i].id}: a hero far enough is never moved (no wall edge to draw him to)`);
      assert.doesNotThrow(() => { const made = initialPractice(731, OPPONENTS[FIGHT.opponent], undefined, null, undefined, undefined, undefined, poseFits(pose, wall()) ? pose : undefined); if (!poseFits(pose, wall())) project(zoneDuel(made.duel, pose), made.ai, made); });
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
  const [A, B, C] = spawns, D = 2 * (A.x * (B.z - C.z) + B.x * (C.z - A.z) + C.x * (A.z - B.z));
  const circ = { x: ((A.x ** 2 + A.z ** 2) * (B.z - C.z) + (B.x ** 2 + B.z ** 2) * (C.z - A.z) + (C.x ** 2 + C.z ** 2) * (A.z - B.z)) / D, z: ((A.x ** 2 + A.z ** 2) * (C.x - B.x) + (B.x ** 2 + B.z ** 2) * (A.x - C.x) + (C.x ** 2 + C.z ** 2) * (B.x - A.x)) / D };   // equidistant from all three spots (spots are 30 m+ apart now)
  const away = Math.hypot(circ.x - A.x, circ.z - A.z), mid = { x: circ.x + (circ.x - A.x) / away * 0.5, z: circ.z + (circ.z - A.z) / away * 0.5 };   // a hair further from the north one: equidistant from the east and west spots, the north one further by under the margin
  const toNorth = Math.hypot(spawns[0].x - mid.x, spawns[0].z - mid.z), toEast = Math.hypot(spawns[1].x - mid.x, spawns[1].z - mid.z);
  assert.ok(toNorth - toEast > 0 && toNorth - toEast < m, 'the north spot is further than the other two, by less than the margin');
  assert.equal(held(spawns, 1, mid, m), 1); assert.equal(held(spawns, 2, mid, m), 2, 'held stays on a tie');
  assert.equal(held(spawns, 0, mid, m), 0, 'the east/west tie is nearer than the north one by less than the margin: the north one stays held');
  assert.equal(held(spawns, 1, { x: 0, z: -1.5 }, m), 0, 'well past the margin: it moves');
  const slightly = { x: 0, z: 0.5 };   // the north one is 6.7 m away, the east one 14 m: the north is far nearer
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

test('the leash: only a BOSS past its own leash from its spot gives up', () => {
  const s = list()[0];
  assert.equal(leashed(s, { x: s.x + s.leash - 0.1, z: s.z }), false);
  assert.equal(leashed(s, { x: s.x + s.leash + 0.1, z: s.z }), true);
});

// Dom 2026-10-27 (live, phone): 'I started the fight and rolled out of an area; it froze and restarted the same fight. It should be a free roam area.' main.ts measured the leash from the
// spot to the HERO (leash 5 m) while the fight moves both well past 5 m from the spot, so a roll or a few steps reset the boss mid-fight. REPRO/regression:
test('REPRO: a fight that drifts out from the spot (hero and boss together, up to 15 m) never trips the leash; on main (leash 5) it tripped past 5 m', () => {
  const s = list()[0], OLD = 5, rows = [];
  let firstOld = null;
  for (let d = 0; d <= 15; d += 0.5) {
    const hero = { x: s.x, z: s.z + d }, boss = { x: s.x, z: s.z + Math.max(0, d - 1.5) };   // the boss on the hero, 1.5 m behind him
    if (firstOld === null && dist(s, hero) > OLD) firstOld = d;
    rows.push(`${d} m: hero-measured at 5 m ${dist(s, hero) > OLD}, boss-measured at ${s.leash} m ${leashed(s, boss)}`);
    assert.equal(leashed(s, boss), false, `a fight ${d} m from the spot must not reset the boss (leash ${s.leash})`);
  }
  assert.equal(firstOld, 5.5, 'on main the hero-measured 5 m leash reset the fight from 5.5 m out');
  console.log(rows.join('\n'));
});

test('REPRO on the real sim: the hero runs one way for 20 s with the real boss brain chasing (stepPractice); the old hero-measured 5 m leash trips within a second or two, the boss-measured 20 m one only once the boss is dragged past 20 m', () => {
  const s = list()[0], opp = OPPONENTS[FIGHT.opponent], rows = [];
  for (const [mx, mz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const built = initialPractice(731, opp, undefined, null, undefined, undefined, undefined, { hero: { x: s.x, z: s.z + 2.5 }, foe: { x: s.x, z: s.z }, heroFacing: Math.PI });
    let p = project(zoneDuel(built.duel), built.ai, built);   // the zone's own duel as main.ts fresh() builds it: the open world's radius (OPEN_RADIUS), no ring wall to stop the boss or the hero
    let oldTrips = 0, newTrips = 0, far = 0, firstOld = Infinity, firstNew = Infinity, farAtOld = 0;
    for (let i = 0; i < 1200; i++) {
      p = stepPractice(p, { ...idleIntent(), action: startAction(true, p, null), move: { x: mx, z: mz, yaw: 0, run: true } });   // the page's auto-draw (data/fight.json start.auto): the boss waits until the hero has drawn
      const hero = { x: p.duel.fighters[0].body.x, z: p.duel.fighters[0].body.z }, boss = { x: p.enemy.x, z: p.enemy.z };
      if (dist(s, hero) > 5) { oldTrips++; if (firstOld === Infinity) { firstOld = i; farAtOld = dist(s, boss); } }
      if (leashed(s, boss)) { newTrips++; if (firstNew === Infinity) firstNew = i; }
      far = Math.max(far, dist(s, boss));
    }
    rows.push(`run (${mx}, ${mz}): hero-measured 5 m leash first trips at tick ${firstOld} (boss ${farAtOld.toFixed(1)} m out, ${oldTrips} of 1200 ticks); boss-measured ${s.leash} m first trips at tick ${firstNew} (${newTrips} ticks); the boss got ${far.toFixed(2)} m from its spot`);
    if (mx !== 0 || mz > 0) {   // running away on open ground: the old rule reset the fight within a second or two with the boss on his heels; the boss-measured leash lets go only once the boss itself is dragged past 20 m, many seconds later
      assert.ok(firstOld < 120 && farAtOld < s.leash, rows.at(-1));
      assert.ok(firstNew > 3 * firstOld + 120, rows.at(-1));
      assert.ok(far > s.leash, 'a sustained kite does drag the boss past the leash: it lets go (the instant reset stays until walk-back lands)');
    }
  }
  console.log(rows.join('\n'));
});

test('a kited boss gives up past the leash; the neighbours keep their own (no chaining)', () => {
  const s = list(), kited = { x: s[0].x, z: s[0].z + s[0].leash + 0.5 };
  assert.equal(leashed(s[0], kited), true);
  assert.equal(leashed(s[1], kited), dist(s[1], kited) > s[1].leash, 'each spot measures its own boss against its own row');
});

test('validateSpots refuses a leash shorter than the aggro plus the margin', () => {
  const ok = spotsFor(ZONE), short = structuredClone(ok);
  assert.ok(ok.every((s) => s.leash >= s.aggro + WORLD.leashMargin));
  short[1].leash = short[1].aggro + WORLD.leashMargin - 0.1;
  assert.throws(() => validateSpots(short, start(), wall()), /leash .* shorter than its aggro/);
  assert.throws(() => validateSpots(ok, start(), wall(), { ...WORLD, leashMargin: 99 }), /leashMargin/);
  assert.throws(() => validateSpots(ok, start(), wall(), { ...WORLD, leashMargin: ok[0].leash }), /leash .* shorter than its aggro/, 'a bigger margin row breaks loudly instead of silently resetting fights');
});

test('the page wires it: one sim, every frame zoneStep, the auto-draw waits for the aggro, the others drawn as copies, the old single-spawn timer is gone', () => {
  const main = src('../src/client/main.ts'), scene = src('../src/fight/scene.ts');
  assert.match(main, /if \(ZONE\) \{ zoneStep\(dt\); syncSweeps\(\); \}/);
  assert.match(main, /startAction\(autoStart && \(!ZONE \|\| engaged\), practice, intent\.action\)/);
  assert.match(main, /view\.idleFoes\(idleOnes\(spawns, current\)/);
  assert.match(main, /validateSpots\(SPOTS, initialState\(\), RADIUS, WORLD, kindIds\(KIND_CTX\.profiles\)\)/, 'every spawn kind is checked against the profile rows, not one page-wide kind');
  assert.match(main, /setPlayScale\(ZONE \? WORLD\.pitScale : playScaleFor\(opponentId, Infinity\)\)/, 'the zone fights in the wider pit; the single fight (ZONE null, ?postkill=v1) keeps playScaleFor, Gate 0 untouched');
  assert.ok(ROWS.world.pitScale * 11.7 - 0.425 - ROWS.world.edgeMetres > 0 && 0.65 * 11.7 - 0.425 - 1 >= 6.1, 'the zone wall holds spots a ring of 6.1 m or more');
  const live = main.split('\n').map((l) => l.replace(/\s\/\/.*$/, '')).join('\n');   // code with the trailing // comments stripped
  assert.match(live, /setPlayScale\([^;]*\); setLateNotice\(true\); setStab\(true\); setStanceRows\(true\);/, 'the era flags are live code in fresh(), not swallowed by a comment');
  assert.match(main, /spawns = kill\(spawns, current\)/);
  assert.match(live, /leashed\(spawns\[current\]!, practice\.enemy(, openerLift)?\)/, 'the leash measures the boss, not the hero (live code, not a comment)');
  assert.match(live, /dropped\(spawns, alive\(\), \(i\) => attackers\.find\(\(a\) => a\.index === i\)!\.practice\.enemy\)/);
  assert.doesNotMatch(main, /respawnDue|sinceKill/);
  assert.match(scene, /idleFoes\(list: readonly \{ x: number; z: number; heading: number; id\?: string; spawn\?: SpawnRef; near\?: boolean; star\?: number \}\[\]\)/);
  assert.match(scene, /snapshotRig\(opponent, false\)/);
  assert.match(scene, /syncIdleFoes\(practice, dt\);\n\s*syncLiveFoes\(dt\);\n\s*if \(!look\?\.render\(\)\)/, 'the copies are placed just before the draw');
});

test('?postkill=v1 and a one-spawn zone are the old fight: no zone state, the sim at the pit marks', () => {
  const main = src('../src/client/main.ts');
  assert.match(main, /const SPOTS = ZONE \? spotsFor\(orderedZone\(zoneFor\(search\), FIGHT\.order, search\)\) : \[\];/, 'no ZONE (?postkill=v1) = no spots, no copies, no zoneStep');
  assert.match(main, /if \(ZONE\) \{ current = nearestStanding/);
  assert.match(main, /if \(ZONE\) \{ view\.idleFoes/);
});

// Dom 2026-10-28 "I don't see the new bosses 2 and 3": after the first kill the far bosses load (world.loadAfterKill / loadRadiusAfterKillMetres); before it nothing changes.
test('bosses visible after the first kill: the trigger is pure, before a kill the first-visit load is unchanged, ?bossload=v1 reverts', () => {
  const far = { x: 30, z: 12 }, hero = { x: 0, z: 0 };
  assert.equal(withinLoad(far, hero, WORLD, false), false, 'before any kill, 30 m away loads nothing');
  assert.equal(withinLoad(far, hero, WORLD, true), true, 'after the first kill the boss at 30 m is fetched and drawn');
  assert.equal(withinLoad({ x: 130, z: 0 }, hero, WORLD, true), false, 'past loadRadiusAfterKillMetres still nothing');
  assert.equal(withinLoad(far, hero, { ...WORLD, loadAfterKill: false }, true), false, 'loadAfterKill false = the old rule');
  assert.equal(bossLoadAfterKill('', WORLD), true);
  assert.equal(bossLoadAfterKill('?bossload=v1', WORLD), false);
  assert.ok(WORLD.loadRadiusAfterKillMetres >= 60, 'covers the spots (spreadRadius 60)');
  const main = readFileSync(new URL('../src/client/main.ts', import.meta.url), 'utf8');
  const scene = readFileSync(new URL('../src/fight/scene.ts', import.meta.url), 'utf8');
  assert.match(scene, /if \(!entry && \(atRest \|\| restSnap\)\)/, 'a far boss is drawn after the live foe is down (the rest pose kept), not only while the live foe stands');
  assert.match(main, /if \(roam && bossLoadAfterKill\(location\.search\)\) bossKilled = true/);
});
