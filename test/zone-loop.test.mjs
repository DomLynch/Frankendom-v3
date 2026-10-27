// The zone loop after the kill (data/zones/zone1.row.json via zoneFor, data/respawn.json, src/fight/zone-loop.ts; Dom 2026-10-27): the rows it reads
// are pinned, bad rows are refused, ?postkill=v1 is the frozen end screen, the hero's walk is the sim's own movement and never touches the stopped
// duel, and a respawn stands the opponent at the pit mark without moving the hero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OPPONENTS } from '../src/fight/moves.ts';
import { initialPractice, stepPractice } from '../src/fight/combat.ts';
import { initialTarget, initialState } from '../src/fight/sim.ts';
import { RADIUS } from '../src/fight/play-radius.ts';
import { respawnDue, zoneLoopFor, respawnPose, roamStep, validateLoop } from '../src/fight/zone-loop.ts';
import { zoneFor } from '../src/zone/zone-rows.ts';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const ROWS = read('../data/respawn.json'), FIGHT = read('../data/fight.json'), ZONE = zoneFor('');
const ids = Object.keys(OPPONENTS);
const loop = (patch) => { const d = structuredClone(ROWS); patch(d); return d; };
const zone = (patch) => { const z = structuredClone(ZONE); patch(z); return z; };

test('the rows are pinned: roam on, hand-over 4 s, the zone row\'s spawn (Pitborn, 40 s) and hero respawn (2 s, "You died")', () => {
  assert.deepEqual({ roam: ROWS.postKill.roam, startAfterSeconds: ROWS.postKill.startAfterSeconds }, { roam: true, startAfterSeconds: 4 });
  assert.deepEqual(ROWS.flag, { query: 'postkill', off: 'v1' });
  assert.equal(ZONE.spawns[0].kind, FIGHT.opponent, 'the zone row\'s spawn kind is the page fight\'s opponent');
  assert.equal(ZONE.spawns[0].respawnSeconds, 40); assert.equal(ZONE.respawn.downSeconds, 2); assert.equal(ZONE.respawn.died, 'You died');
  for (const dup of ['spawns', 'respawn', 'corpse']) assert.equal(ROWS[dup], undefined, `${dup} is the zone row's / Physics Dev's row, not repeated here`);
  assert.ok(read('../data/physics.json').corpse.keepSeconds > 0, 'one corpse timer: data/physics.json corpse.keepSeconds (ragdoll.leaveCorpse)');
  const z = zoneLoopFor(ZONE, '', ids);
  assert.deepEqual(z, { startAfterSeconds: 4, minDistance: 3.25, diedSeconds: 2, fallSeconds: 1.4, zone: ZONE.id, spawn: { id: ZONE.spawns[0].id, kind: 'pitborn', respawnSeconds: 40 } });
});

test('bad rows are refused', () => {
  assert.throws(() => validateLoop(loop((d) => { d.postKill.startAfterSeconds = 99; }), ZONE, ids), /startAfterSeconds/);
  assert.throws(() => validateLoop(loop((d) => { d.postKill.startAfterSeconds = NaN; }), ZONE, ids), /startAfterSeconds/);
  assert.throws(() => validateLoop(ROWS, zone((z) => { z.spawns[0].kind = 'nobody'; }), ids), /unknown kind/);
  assert.throws(() => validateLoop(ROWS, zone((z) => { z.spawns = []; }), ids), /no spawn row/);
});

test('?postkill=v1 (and roam off) is the frozen end screen', () => {
  assert.equal(zoneLoopFor(ZONE, '?postkill=v1', ids), null);
  assert.equal(zoneLoopFor(ZONE, '', ids, loop((d) => { d.postKill.roam = false; })), null);
  assert.notEqual(zoneLoopFor(ZONE, '?postkill=v2', ids), null);
});

test('respawnDue: the new opponent stands respawnSeconds after the kill, not before', () => {
  const s = zoneLoopFor(ZONE, '', ids).spawn;
  assert.equal(respawnDue(s, 0), false); assert.equal(respawnDue(s, 39.99), false);
  assert.equal(respawnDue(s, 40), true);
});

test('roamStep: the hero walks on the sim\'s own movement, is stopped by the corpse and the wall', () => {
  const hero = initialState(), corpse = initialTarget();
  const side = roamStep(hero, { x: 1, z: 0, yaw: 0, run: false }, corpse, RADIUS);
  assert.ok(Math.hypot(side.x - hero.x, side.z - hero.z) > 0, 'he moves');
  let b = hero; for (let i = 0; i < 600; i++) b = roamStep(b, { x: 1, z: 0, yaw: 0, run: true }, corpse, RADIUS);
  assert.ok(Math.hypot(b.x, b.z) <= RADIUS + 1e-9, 'the wall holds him');
  let c = { ...hero, z: corpse.z - 3, x: corpse.x }; for (let i = 0; i < 600; i++) c = roamStep(c, { x: 0, z: -1, yaw: 0, run: true }, corpse, RADIUS);
  assert.ok(Math.hypot(c.x - corpse.x, c.z - corpse.z) > 0.3, 'the corpse blocks him');
});

test('the duel sim stays stopped after the kill: bodies do not step, so the walk is presentation-only', () => {
  let p = initialPractice(731);
  p = { ...p, duel: { ...p.duel, fighters: [p.duel.fighters[0], { ...p.duel.fighters[1], health: 0 }] } };
  const after = stepPractice(p, { move: { x: 1, z: 0, yaw: 0, run: false }, action: null, guard: false, held: false, lock: false, cancel: false });
  assert.deepEqual(after.duel.fighters[0].body, p.duel.fighters[0].body);
  assert.deepEqual(after.duel.fighters[1].body, p.duel.fighters[1].body);
});

test('a respawn: the opponent stands at the pit mark and the hero where he is, never closer than spawn.minDistance (he is stepped back); out of the wall = the pit marks', () => {
  const mark = initialTarget(), min = ROWS.spawn.minDistance, far = { x: 0, z: mark.z + min + 0.5 };
  assert.equal(min, 3.25);
  const pose = respawnPose(far, mark, RADIUS, min);
  assert.deepEqual(pose.foe, mark); assert.deepEqual(pose.hero, far, 'far enough: he stays where he stood');
  const p = initialPractice(731, OPPONENTS.pitborn, undefined, null, undefined, undefined, undefined, pose);
  assert.ok(Math.abs(p.fighter.x - far.x) < 1e-3 && Math.abs(p.fighter.z - far.z) < 1e-3, 'the hero starts where he stood');
  assert.ok(Math.abs(p.enemy.x - mark.x) < 1e-3 && Math.abs(p.enemy.z - mark.z) < 1e-3);
  // the hazard: he walked up to the corpse at the mark; the new opponent never stands within minDistance of him
  for (const near of [{ x: mark.x, z: mark.z + 0.3 }, { x: mark.x + 0.5, z: mark.z }, { x: mark.x, z: mark.z }, { x: mark.x - 1, z: mark.z + 1 }]) {
    const q = respawnPose(near, mark, RADIUS, min);
    if (q === null) continue;   // outside the wall once stepped back: the pit's marks, below
    assert.ok(Math.hypot(q.hero.x - q.foe.x, q.hero.z - q.foe.z) >= min - 1e-9, `stepped back from ${JSON.stringify(near)} to ${JSON.stringify(q.hero)}`);
    assert.ok(Math.hypot(q.hero.x, q.hero.z) <= RADIUS, 'and still inside the wall');
    assert.doesNotThrow(() => initialPractice(731, OPPONENTS.pitborn, undefined, null, undefined, undefined, undefined, q));
  }
  const edge = { x: 0, z: RADIUS - 0.1 };
  assert.equal(respawnPose(edge, edge, RADIUS, min), null, 'standing on the mark at the wall, no room to step back: the pit marks');
  assert.equal(respawnPose({ x: RADIUS + 5, z: 0 }, mark, RADIUS, min), null);
});

test('the spawn row is validated', () => {
  assert.throws(() => validateLoop(loop((d) => { d.spawn.minDistance = 0; }), ZONE, ids), /minDistance/);
  assert.throws(() => validateLoop(loop((d) => { d.spawn.minDistance = 99; }), ZONE, ids), /minDistance/);
  assert.equal(zoneLoopFor(ZONE, '', ids).minDistance, 3.25);
});

test('the hero\'s death fall is a row: 1.4 s (V1 world rule `fall`), inside the died beat, validated, off under ?postkill=v1', () => {
  assert.equal(ROWS.heroDeath.fallSeconds, 1.4);
  assert.equal(ROWS.heroDeath.fallSeconds, read('../src/fight/world-rules-defs.json').rules.find((r) => r.id === 'fall').value, 'V1\'s own fall');
  assert.ok(ROWS.heroDeath.fallSeconds <= ZONE.respawn.downSeconds, 'the fall ends before the warp');
  for (const bad of [0, -1, 11, NaN, '1.4']) assert.throws(() => validateLoop(loop((d) => { d.heroDeath.fallSeconds = bad; }), ZONE, ids), /fallSeconds/);
  assert.throws(() => validateLoop(ROWS, zone((z) => { z.respawn.downSeconds = 1; }), ids), /longer than/);
  assert.equal(zoneLoopFor(ZONE, '?postkill=v1', ids), null, 'no loop, no fall: the scene is told 0');
});

test('the page wires the fall: main tells the scene the row (0 without the loop), the scene drives the Death clip on a clock and holds it', () => {
  const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8'), main = src('../src/client/main.ts'), scene = src('../src/fight/scene.ts');
  assert.match(main, /view\.heroFall\(ZONE \? ZONE\.fallSeconds : 0\)/);
  assert.match(scene, /heroFall\(seconds: number\) \{ fallSeconds = seconds; \}/);
  assert.match(scene, /const mine = heroFalls\(stand\([^\n]*practice\.finish\?\.victim === 0, animationDt\)/);
  assert.match(scene, /pose: 'death', progress: Math\.min\(1, fallAge \/ fallSeconds\)/);
});

test('the page wires the loop: the zone row via zoneFor, the corpse left BEFORE his sim body resets, the HUD drops the Rematch in the zone', () => {
  const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8'), main = src('../src/client/main.ts'), hud = src('../src/fight/hud.ts');
  assert.match(main, /zoneLoopFor\(zoneFor\(search\), search/);
  assert.match(main, /zone: heroStands\(\) \|\| heroDied\(\)/);
  assert.match(main, /diedSeconds\) \{ const who = killedBy \?\? current; rematch\(poseFor\(who, heroStart\), who\); \}/);
  assert.match(main, /if \(ZONE\) view\.respawnFoe\(\);[^\n]*\n\s*seed = nextSeed/);
  assert.match(src('../src/fight/scene.ts'), /respawnFoe\(\): boolean \{ return ragdoll\?\.leaveCorpse\(\)/);
  assert.match(hud, /resetButton\.hidden = !!view\.zone/);
});
