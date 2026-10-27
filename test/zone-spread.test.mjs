// Spawn spread (PR B2, Strategy: spawns across the zone frame, ONE held sim near the hero, the others standing for real): the zone's bosses stand well beyond the pit, 10 m or more apart,
// each with its aggro 2.5 m / leash 5 m intact; a fight begun far from the pit is placed where the pair stand and has no ring wall; the held-sim retarget and the camera work from there.
// Spot coordinates and every distance are read from the rows (data/zones/zone1.row.json, data/respawn.json), never written here. The single fight (ZONE null, ?postkill=v1, Gate 0) never reaches
// this code: pinned at the end by reading main.ts and by a duel built the old way keeping `radius` absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OPPONENTS, opponentAt, profileAt } from '../src/fight/moves.ts';
import { initialPractice, project, stepPractice } from '../src/fight/combat.ts';
import { idleIntent } from '../src/fight/duel.ts';
import { initialState } from '../src/fight/sim.ts';
import * as play from '../src/fight/play-radius.ts';
import { zoneFor } from '../src/zone/zone-rows.ts';
import { OPENERS, WORLD, held, inAggro, leashed, nearestStanding, poseAt, poseFits, spotsFor, validateSpots, zoneDuel } from '../src/zone/spawns.ts';
import { joiners } from '../src/zone/attackers.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ROWS = JSON.parse(read('../data/respawn.json')), FIGHT = JSON.parse(read('../data/fight.json')), ZONE = zoneFor('');
play.setPlayScale(WORLD.pitScale);   // the pit's circle the zone draws (main.ts fresh())
const wall = () => play.RADIUS;
const spots = () => spotsFor(ZONE).map((s) => ({ ...s, deadFor: null }));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const foe = OPPONENTS[FIGHT.opponent], body = opponentAt(foe, FIGHT.level), profile = profileAt(foe, FIGHT.level);
const fresh = (pose) => initialPractice(7, body, FIGHT.weapon, FIGHT.skill, undefined, undefined, undefined, pose);
const walk = (p, move, ticks) => { for (let t = 0; t < ticks; t++) p = stepPractice(p, { ...idleIntent(), move }, profile); return p; };

test('the shipped spread: bosses stand beyond the pit, 10 m or more apart, aggro 2.5 / leash 5 intact, every leash circle on the zone\'s ground', () => {
  const s = spots();
  assert.doesNotThrow(() => validateSpots(s, initialState(), wall(), WORLD, FIGHT.opponent));
  assert.ok(s.filter((x) => Math.hypot(x.x, x.z) > wall()).length >= 2, 'at least two bosses stand outside the drawn pit');
  for (const a of s) {
    assert.deepEqual([a.aggro, a.leash], [2.5, 5], `${a.id}: aggro 2.5 m and leash 5 m as before`);
    assert.ok(Math.hypot(a.x, a.z) + a.leash <= WORLD.spreadRadiusMetres, `${a.id}: leash circle on the ground`);
    for (const b of s) if (a !== b) assert.ok(dist(a, b) >= WORLD.minSpacing && dist(a, b) >= 10, `${a.id} ~ ${b.id} = ${dist(a, b).toFixed(2)} m`);
  }
  const areas = Object.fromEntries(ZONE.areas.map((a) => [a.id, a]));
  const o = { x: (areas['duel-pit'].min[0] + areas['duel-pit'].max[0]) / 2, z: (areas['duel-pit'].min[1] + areas['duel-pit'].max[1]) / 2 };
  for (const sp of ZONE.spawns) assert.ok(!(sp.position.x >= areas.yard.min[0] && sp.position.x <= areas.yard.max[0] && sp.position.z >= areas.yard.min[1] && sp.position.z <= areas.yard.max[1]), `${sp.id} is not in the yard`);
  assert.ok(ZONE.spawns.every((sp) => ['duel-pit', 'field'].some((id) => sp.position.x >= areas[id].min[0] && sp.position.x <= areas[id].max[0] && sp.position.z >= areas[id].min[1] && sp.position.z <= areas[id].max[1])), 'every spawn stands in a spawn area');
  assert.ok(o.x === 226 && o.z === 47, 'the pit is still where the page and the presence service put it');
});

test('coverage: no hero position anywhere on the ground is inside two bosses\' aggro, and none is in one boss\'s leash and another\'s aggro (the opener\'s reach included)', () => {
  const s = spots(), R = WORLD.spreadRadiusMetres;
  let both = 0, joined = 0, covered = 0, points = 0;
  for (let x = -R; x <= R; x += 0.5) for (let z = -R; z <= R; z += 0.5) {
    const hero = { x, z };
    if (Math.hypot(x, z) > R) continue;
    points++;
    const near = s.filter((b) => dist(b, hero) <= b.aggro);
    if (near.length > 1) both++;
    if (near.length) covered++;
    s.forEach((b, i) => { if (dist(b, hero) <= b.leash + OPENERS.reachMetres && joiners(s, i, [], hero).length) joined++; });
  }
  assert.ok(points > 1000 && covered > 0);
  assert.equal(both, 0, 'no point is in two aggro circles');
  assert.equal(joined, 0, 'a hero fighting one boss (inside its leash, lifted by the opener\'s reach) is never inside another\'s aggro: nobody joins, so the second-opponent camera widen is never asked for a boss across the zone');
  const gaps = s.flatMap((a) => s.filter((b) => b !== a).map((b) => dist(a, b) - a.leash - OPENERS.reachMetres - b.aggro));
  assert.ok(Math.min(...gaps) > 0, `every pair clears leash + reach + aggro by ${Math.min(...gaps).toFixed(2)} m or more`);
});

test('poseAt far from the pit: the pose is placed at the SPOT, the hero where he stands (stepped back to minDistance), never the pit\'s marks; beyond the ground it falls back to his start', () => {
  const s = spots(), start = initialState(), gap = ROWS.spawn.minDistance;
  for (const spot of s) for (let a = 0; a < 12; a++) for (const r of [gap, 3, 5, 9]) {
    const hero = { x: spot.x + r * Math.cos(a / 12 * 2 * Math.PI), z: spot.z + r * Math.sin(a / 12 * 2 * Math.PI) };
    if (Math.hypot(hero.x, hero.z) > WORLD.spreadRadiusMetres) continue;
    const pose = poseAt(hero, spot, WORLD.spreadRadiusMetres, gap, start);
    assert.deepEqual(pose.foe, { x: spot.x, z: spot.z });
    assert.ok(dist(pose.hero, pose.foe) >= gap - 1e-9, 'never closer than minDistance');
    if (dist(hero, spot) >= gap) assert.deepEqual(pose.hero, hero, 'the hero stays where he is when he is far enough');
    assert.ok(Math.abs(Math.atan2(spot.x - pose.hero.x, spot.z - pose.hero.z) - pose.heroFacing) < 1e-9, 'he faces the boss');
  }
  const far = s.find((x) => Math.hypot(x.x, x.z) > wall()), pose = poseAt({ x: far.x - 3, z: far.z }, far, WORLD.spreadRadiusMetres, gap, start);
  assert.equal(poseFits(pose, wall()), false, 'a far spot is outside the pit\'s wall: the sim\'s own pose door would refuse it');
  assert.throws(() => fresh(pose), /inside the wall/, 'the refusal that poseFits / zoneDuel route around');
  assert.deepEqual(poseAt({ x: 1e3, z: 0 }, s[0], WORLD.spreadRadiusMetres, gap, start).hero, { x: start.x, z: start.z }, 'a hero beyond the ground gets his start mark');
  assert.equal(poseFits(poseAt(start, s[0], WORLD.spreadRadiusMetres, gap, start), wall()), s[0].x ** 2 + s[0].z ** 2 <= wall() ** 2, 'a pit-side pose fits when both stand in the pit');
});

test('a fight begun at a far spot: placed by hand on the finished duel, no ring wall; the hero walks past the pit wall, the boss stays at its spot', () => {
  const far = spots().find((x) => Math.hypot(x.x, x.z) > wall()), pose = poseAt({ x: far.x - 4, z: far.z - 1 }, far, WORLD.spreadRadiusMetres, ROWS.spawn.minDistance, initialState());
  const made = fresh(), placed = project(zoneDuel(made.duel, pose), made.ai, made);
  assert.deepEqual([placed.duel.fighters[0].body.x, placed.duel.fighters[0].body.z], [pose.hero.x, pose.hero.z]);
  assert.deepEqual([placed.duel.fighters[1].body.x, placed.duel.fighters[1].body.z], [far.x, far.z]);
  assert.ok(Math.abs(placed.duel.fighters[1].body.heading - Math.atan2(pose.hero.x - far.x, pose.hero.z - far.z)) < 1e-9, 'the boss faces the hero');
  assert.equal(placed.duel.radius, play.OPEN_RADIUS);
  assert.deepEqual([placed.fighter.x, placed.fighter.z, placed.enemy.x, placed.enemy.z], [pose.hero.x, pose.hero.z, far.x, far.z], 'the projected practice (what the page reads) is at the spot');
  assert.ok(Math.hypot(placed.fighter.x, placed.fighter.z) > wall());
  const out = walk(placed, { x: 0, z: 1, yaw: 1.5, run: true }, 180);
  assert.ok(Math.hypot(out.fighter.x, out.fighter.z) > Math.hypot(pose.hero.x, pose.hero.z), 'the hero walks on, out past the pit\'s wall, free');
  assert.equal(out.duel.radius, play.OPEN_RADIUS, 'the wall is carried through every tick');
  const pit = walk(fresh(), { x: 0, z: 1, yaw: 1.5, run: true }, 180);
  assert.ok(Math.hypot(pit.fighter.x, pit.fighter.z) <= wall() + 1e-6, 'the single fight\'s pit still stops him at its wall (a duel not built by zoneDuel)');
  assert.ok(!('radius' in pit.duel), 'and carries no radius: byte for byte what it was');
});

test('a pose that fits is the sim\'s own: zoneDuel changes nothing but the radius', () => {
  const s = spots(), pose = poseAt(initialState(), s[0], WORLD.spreadRadiusMetres, ROWS.spawn.minDistance, initialState());
  assert.ok(poseFits(pose, wall()));
  const sim = fresh(pose), same = zoneDuel(sim.duel);
  assert.deepEqual({ ...same, radius: undefined }, { ...sim.duel, radius: undefined });
  assert.equal(same.radius, play.OPEN_RADIUS); assert.ok(!('radius' in sim.duel));
});

test('the held sim and the engage from a far position: the walk from the pit to a far boss hands the sim over once, engages only inside its aggro, leashes only past 5 m', () => {
  const s = spots(), start = initialState(), target = s[1], margin = WORLD.retargetMargin;
  let cur = nearestStanding(s, start), switches = [], engagedAt = null;
  const steps = 800, dx = (target.x - start.x) / steps, dz = (target.z - start.z) / steps;
  for (let i = 0; i <= steps; i++) {
    const hero = { x: start.x + dx * i, z: start.z + dz * i }, near = inAggro(s, hero);
    if (near >= 0 && engagedAt === null) { engagedAt = dist(hero, target); assert.equal(near, 1, 'the first aggro on the way is the far boss'); }
    const next = held(s, cur, hero, margin);
    if (next !== cur) { switches.push([cur, next]); cur = next; }
  }
  assert.equal(cur, 1, 'the sim ends on the far boss');
  assert.ok(switches.length <= 2 && new Set(switches.map((x) => x.join())).size === switches.length, `no flicker: ${JSON.stringify(switches)}`);
  assert.ok(engagedAt <= target.aggro + 1e-6 && engagedAt > target.aggro - 0.1, 'engaged exactly at its aggro');
  assert.equal(leashed(target, { x: target.x - target.leash + 0.1, z: target.z }), false);
  assert.equal(leashed(target, { x: target.x - target.leash - 0.1, z: target.z }), true);
  // a hero standing 20 m from every boss: the nearest is held, nobody is in aggro
  const lost = { x: 0, z: WORLD.spreadRadiusMetres };
  assert.equal(inAggro(s, lost), -1); assert.ok(nearestStanding(s, lost) >= 0);
  // pose for the hand-over from the held pit boss to the far one, hero where he stands (mid-way, beyond the pit wall)
  const mid = { x: target.x - 3, z: target.z }, p = poseAt(mid, target, WORLD.spreadRadiusMetres, ROWS.spawn.minDistance, start);
  assert.deepEqual(p.foe, { x: target.x, z: target.z });
});

test('the camera: a walking camera follows the hero out to the far boss (the pit\'s 11.5 m clamp would drag it back), a lock camera frames the pair, a single fight is as before', async () => {
  const cam = await import('../src/fight/camera.ts'), clamp = JSON.parse(read('../src/fight/camera-rules-defs.json')).rules.find((r) => r.id === 'arenaClamp').value;
  const far = spots().find((x) => Math.hypot(x.x, x.z) > clamp - 3) ?? spots().sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z))[0];
  assert.ok(Math.hypot(far.x, far.z) + far.leash > clamp, 'the far boss\'s leash circle reaches past the pit\'s colonnade clamp');
  const hero = { x: far.x, z: far.z, heading: 0, distance: 0 }, yaw = 0.7;
  const before = cam.cameraPose(hero, yaw, 0, false);
  assert.ok(Math.hypot(before.x, before.z) <= clamp + 1e-9, 'unset (the single fight): clamped to the colonnade, as before');
  cam.setArenaClamp(WORLD.cameraClampMetres);
  const walking = cam.cameraPose(hero, yaw, 0, false);
  assert.equal(walking.lookX, hero.x); assert.equal(walking.lookZ, hero.z);
  assert.ok(Math.hypot(walking.x - hero.x, walking.z - hero.z) < 8, `the walking camera stays with the hero (${Math.hypot(walking.x - hero.x, walking.z - hero.z).toFixed(2)} m)`);
  const boss = { x: far.x + 1, z: far.z + 2 }, lock = cam.cameraPose(hero, yaw, 0, true, boss);
  assert.ok(Math.abs(lock.lookX - ((hero.x + boss.x) / 2)) < 1 && Math.abs(lock.lookZ - ((hero.z + boss.z) / 2)) < 1, 'the lock camera looks at the pair, wherever they stand');
  assert.ok(Math.hypot(lock.x, lock.z) <= WORLD.cameraClampMetres + 1e-9);
  const pitHero = { x: 3, z: 2, heading: 0, distance: 0 }, pitBefore = cam.cameraPose(pitHero, yaw, 0, true, { x: 0, z: 0 });
  cam.setArenaClamp(clamp);
  assert.deepEqual(cam.cameraPose(pitHero, yaw, 0, true, { x: 0, z: 0 }), pitBefore, 'inside the pit the wider clamp changes nothing');
});

test('the page wires it for the zone only: poseAt on the ground, the pose door routed by poseFits, the radius via zoneDuel, the camera clamp; no key in the single fight', () => {
  const main = read('../src/client/main.ts');
  assert.match(main, /poseAt\(at, spawns\[index\]!, WORLD\.spreadRadiusMetres, ZONE!\.minDistance, heroStart\)/);
  assert.match(main, /const fits = !ZONE \|\| !pose \|\| poseFits\(pose, RADIUS\);/, 'with no zone every pose is the sim\'s own');
  assert.match(main, /return ZONE \? project\(zoneDuel\(scaled\.duel, fits \? undefined : pose\), scaled\.ai, scaled\) : scaled;/, 'no zone = the practice untouched');
  assert.match(main, /if \(ZONE\) setArenaClamp\(WORLD\.cameraClampMetres\);/);
  const live = main.split('\n').map((l) => l.replace(/\s\/\/.*$/, '')).join('\n');
  assert.match(live, /if \(ZONE\) setArenaClamp\(WORLD\.cameraClampMetres\);\n/, 'live code, not swallowed by a trailing comment');
  assert.match(live, /fits \? pose : undefined, undefined/, 'a pose beyond the pit is not handed to the sim');
  const sim = ['sim', 'duel', 'combat', 'play-radius'].map((f) => read(`../src/fight/${f}.ts`)).join('\n');
  assert.doesNotMatch(sim, /zoneDuel|spreadRadius|setArenaClamp/, 'the sim files do not know the zone');
});
