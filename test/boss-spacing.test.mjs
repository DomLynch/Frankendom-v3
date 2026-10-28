// BOSS SPACING (Dom 2026-10-28, playing live: 'all these bosses seem very very far away ... we need quite frequent combat ... a bit closer together, not crazy close like last time').
// The layout contract is the data/rings.json `spacing` row; every number below is a row or derived from rows (run speed = world-rules playerRun, aggro and leash = the bosses rows).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RINGS, ringOfSpawn } from '../src/zone/rings.ts';
import { ringedZoneFor as zoneFor } from '../src/zone/zone-rows.ts';
import { WORLD, spotsFor, withinLoad } from '../src/zone/spawns.ts';
import { worldRule } from '../src/fight/world-rules.ts';
import { RADAR, place } from '../src/fight/radar.ts';

const RUN = worldRule('playerRun'), SP = RINGS.spacing, spots = spotsFor(zoneFor('')), ring = (s) => ringOfSpawn(s.id)?.id ?? 'ring-1';
const ringBosses = spots.filter((s) => ring(s) !== 'ring-1'), hero = { x: 0, z: 0 };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z), secs = (m, aggro) => Math.max(0, (m - aggro) / RUN);
const nearest = (s) => spots.filter((t) => t !== s).reduce((m, t) => (dist(s, t) < dist(s, m) ? t : m));

test('min separation: no ring 2 or 3 boss stands closer to any other boss than two leashes + an aggro + the margin (two fights never bleed into each other)', () => {
  for (const s of ringBosses) for (const t of spots) {
    if (t === s) continue;
    const floor = s.leash + t.leash + Math.max(s.aggro, t.aggro) + SP.marginMetres;
    assert.ok(dist(s, t) >= floor - 1e-9, `${s.id} to ${t.id}: ${dist(s, t).toFixed(1)} m, floor ${floor} m`);
  }
  assert.ok(ringBosses.length === 9 && spots.length === 12);
});

test('max nearest-neighbour: every boss has another within hopSeconds[1] of running, and none is closer than hopSeconds[0] (ring 1\'s own pair, 33 m apart since #166, is the one exception to the floor)', () => {
  for (const s of spots) {
    const n = nearest(s), t = secs(dist(s, n), n.aggro);
    assert.ok(t <= SP.hopSeconds[1], `${s.id}: nearest boss ${n.id} is ${t.toFixed(1)} s away, target at most ${SP.hopSeconds[1]} s`);
    if (ring(s) !== 'ring-1') assert.ok(t >= SP.hopSeconds[0] - 1, `${s.id}: nearest boss ${n.id} only ${t.toFixed(1)} s away`);
  }
  // the bosses are one connected chain of hops of at most hopSeconds[1]: from any boss you can run to the next in that time, so the walk never strands
  const seen = new Set([spots[0]]), todo = [spots[0]];
  while (todo.length) { const a = todo.pop(); for (const b of spots) if (!seen.has(b) && secs(dist(a, b), b.aggro) <= SP.hopSeconds[1]) { seen.add(b); todo.push(b); } }
  assert.equal(seen.size, spots.length, 'every boss is within a hop of another');
});

test('from the pit: the first boss of ring 2 and of ring 3 is firstBossSeconds away at run speed; ring 1 is the start and does not move', () => {
  for (const id of ['ring-2', 'ring-3']) {
    const t = Math.min(...ringBosses.filter((s) => ring(s) === id).map((s) => secs(dist(s, hero), s.aggro)));
    assert.ok(t >= SP.firstBossSeconds[0] && t <= SP.firstBossSeconds[1], `${id}: first boss ${t.toFixed(1)} s from the pit, wanted ${SP.firstBossSeconds.join('-')} s`);
  }
  assert.deepEqual(spots.slice(0, 3).map((s) => [s.id, +s.x.toFixed(2), +s.z.toFixed(2)]), [['yard-pitborn', 0, -6.17], ['pit-pitborn-east', 28, 12], ['pit-pitborn-west', -14, 31]]);
});

test('the rings still hold their order: ring 2 nearer than ring 3, every spawn inside its band, difficulty rises with the ring', () => {
  const [r1, r2, r3] = RINGS.rings;
  assert.ok(r1.maxDist < r2.minDist && r2.maxDist < r3.minDist);
  assert.ok(Math.max(...ringBosses.filter((s) => ring(s) === 'ring-2').map((s) => dist(s, hero))) < Math.min(...ringBosses.filter((s) => ring(s) === 'ring-3').map((s) => dist(s, hero))));
  assert.ok(r1.health <= r2.health && r2.health < r3.health);
  for (const r of RINGS.rings.slice(1)) { assert.ok(r.spawns.every((s) => s.distance === r.blendAtMetres), `${r.id}: the look is full where its bosses stand (one knob)`); }
});

test('the radar still shows a dot for every boss at the new distances (in range as a dot, beyond range held on the rim at its bearing)', () => {
  for (const s of spots) {
    const p = place(RADAR, s.x - hero.x, s.z - hero.z, 0, { x: 0, y: 0, clamped: false });
    assert.ok(Math.hypot(p.x, p.y) <= 1 - RADAR.rimInset + 1e-9, `${s.id} is drawn on the disc`);
    assert.equal(p.clamped, dist(s, hero) > RADAR.rangeMetres);
  }
});

test('lazy load: nothing is fetched at the pit (first visit weight unchanged), and the body is being fetched loadAfterKillMetres out, seconds before the hero is in aggro', () => {
  for (const s of ringBosses) {
    assert.equal(withinLoad(s, hero, undefined, false), false, `${s.id}: not fetched at the start`);
    assert.equal(withinLoad(s, hero, undefined, true), false, `${s.id}: not fetched after a kill at the pit`);
    const lead = secs(Math.min(ringOfSpawn(s.id).loadAfterKillMetres, WORLD.loadWithinMetres) + 0, s.aggro);   // the near-load (24 m) is the tighter of the two before the first kill
    assert.ok(lead >= 4, `${s.id}: ${lead.toFixed(1)} s from the fetch to the aggro`);
    assert.ok(ringOfSpawn(s.id).loadAfterKillMetres < s.leash + s.leash + s.aggro + SP.marginMetres, 'a fetch reaches at most the next camp\'s edge: one boss body at a time');
  }
});
