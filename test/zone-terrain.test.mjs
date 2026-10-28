// The zone's terrain from a seed (data/terrain.json, src/zone/terrain.ts, src/fight/terrain-draw.ts): a pure deterministic height(x, z), exactly flat on every pad (so a fight, its ragdoll,
// cut pieces, blood and corpse stay on the old flat floor), a slope that never passes the row, a sim that never sees it, and the page wiring (no flag of its own).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateFile } from '../src/sim/validate.js';
import { TERRAIN, bossReaches, checkTerrain, createTerrain, padsFor, terrainFor } from '../src/zone/terrain.ts';
import { initialState, initialTarget } from '../src/fight/sim.ts';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ZONE = read('../data/zones/zone1.row.json'), RESPAWN = read('../data/respawn.json');
const pit = ZONE.areas.find((a) => a.id === RESPAWN.world.pitArea);
const ORIGIN = { x: pit.min[0] + (pit.max[0] - pit.min[0]) * RESPAWN.world.centre, z: pit.min[1] + (pit.max[1] - pit.min[1]) * RESPAWN.world.centre };
const clone = (patch) => { const r = structuredClone(TERRAIN); patch(r); return r; };
const T = terrainFor(ZONE, ORIGIN);
const lcg = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

test('the rows validate, the shipped values pass, and a boss pad narrower than a leash is refused', () => {
  assert.deepEqual(validateFile('terrain', TERRAIN), []);
  assert.match(validateFile('terrain', { ...TERRAIN, extra: 1 }).join('\n'), /terrain\.extra: unknown key/);
  assert.deepEqual(checkTerrain(TERRAIN, bossReaches(ZONE)), []);
  assert.match(checkTerrain(clone((r) => { r.pads.boss.flatMetres = 20; }), bossReaches(ZONE)).join('\n'), /would stand off the pad/);
  assert.match(checkTerrain(clone((r) => { r.octaves = 99; })).join('\n'), /octaves 99 is not in/);
  assert.match(checkTerrain(clone((r) => { r.heightMetres = NaN; })).join('\n'), /heightMetres NaN/);
  assert.equal(TERRAIN.on, true);
});

test('height() is a pure function of the seed: same seed same bytes, another seed another ground', () => {
  const again = terrainFor(ZONE, ORIGIN), r = lcg(7), pts = Array.from({ length: 400 }, () => [(r() - 0.5) * 800, (r() - 0.5) * 800]);
  for (const [x, z] of pts) assert.equal(T.height(x, z), again.height(x, z));
  assert.equal(T.height(120, 90), T.height(120, 90));
  const other = createTerrain(T.pads, clone((rows) => { rows.seed += 1; }));
  assert.ok(pts.some(([x, z]) => other.height(x, z) !== T.height(x, z)));
  // pinned: a change to the noise, the hash or the rows moves these on purpose, with a reason in the PR
  assert.deepEqual([[120, 90], [-200, 60], [300, -150]].map(([x, z]) => Number(T.height(x, z).toFixed(9))), PINNED);
  assert.ok(pts.every(([x, z]) => Number.isFinite(T.height(x, z)) && T.height(x, z) >= 0));
});
const PINNED = [0, 2.247539286, 1.434060849];

test('the ground really has hills: tall enough to see, and the steepest the rows allow is never more than maxSlope', () => {
  let top = 0, raised = 0, n = 0;
  for (let x = -400; x < 400; x += 4) for (let z = -400; z < 400; z += 4) { const h = T.height(x, z); top = Math.max(top, h); n++; if (h > 0.5) raised++; }
  console.log(`terrain: effective height scale ${T.heightMetres.toFixed(2)} m (row ${TERRAIN.heightMetres}), tallest sampled ${top.toFixed(2)} m, ${(100 * raised / n).toFixed(0)}% of the ground over 0.5 m, slope guarantee ${T.slopeBound.toFixed(3)} (row ${TERRAIN.maxSlope})`);
  assert.ok(top > 1.5, `hills too low: ${top}`);
  assert.ok(raised / n > 0.1 && raised / n < 0.9);
  assert.ok(T.slopeBound <= TERRAIN.maxSlope + 1e-9);
  const r = lcg(11);
  for (let i = 0; i < 40000; i++) {
    const x = (r() - 0.5) * 900, z = (r() - 0.5) * 900, a = r() * 6.283, d = 0.05 + r() * 6, x2 = x + Math.cos(a) * d, z2 = z + Math.sin(a) * d;
    assert.ok(Math.abs(T.height(x2, z2) - T.height(x, z)) <= TERRAIN.maxSlope * d + 1e-9, `slope over the row at ${x},${z}`);
  }
});

test('every pad is exactly level at 0: the pit, the camp, every boss spawn, the default hero and foe starts, out to the flat radius', () => {
  const pads = padsFor(ZONE, ORIGIN);
  assert.equal(pads.length, 2 + ZONE.spawns.length);
  for (const p of pads) {
    assert.equal(T.height(p.x, p.z), 0);
    for (let k = 0; k < 64; k++) { const a = k * 0.0981, d = p.flatMetres * (k % 4 === 3 ? 1 : (k % 4) / 4 + 0.1); assert.equal(T.height(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d), 0, `pad at ${p.x},${p.z} not flat at ${d} m`); }
  }
  // a hero dragged to the end of a boss's leash is still on its pad
  for (const [i, s] of ZONE.spawns.entries()) { const p = pads[2 + i]; assert.ok(p.flatMetres >= s.behaviour.leash + s.behaviour.aggro + TERRAIN.pads.bossMarginMetres); }
  // the sim's default first-visit places (the hero's start, the foe's start) are in the pit's frame: level
  const h = initialState(), f = initialTarget();
  assert.equal(T.height(h.x, h.z), 0); assert.equal(T.height(f.x, f.z), 0);
  // and beyond the pads there is ground that is not flat
  assert.ok(T.height(ORIGIN.x > 0 ? 400 : -400, 400) !== 0 || T.height(-400, 400) !== 0 || T.height(400, -400) !== 0 || T.height(300, 300) !== 0);
});

test('the sim never sees the terrain: no sim, duel or replay file imports it, and the flat sim is what the existing replay tests pin', () => {
  const files = [];
  const walk = (dir) => { for (const e of readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })) { if (e.isDirectory()) walk(`${dir}${e.name}/`); else if (/\.(ts|js)$/.test(e.name)) files.push(`${dir}${e.name}`); } };
  walk('../src/sim/'); walk('../src/core/');
  for (const f of ['sim', 'duel', 'replay', 'record', 'combat', 'detmath', 'moves', 'ai', 'world', 'world-combat', 'zone-loop', 'open-fight']) files.push(`../src/fight/${f}.ts`);
  files.push('../src/zone/spawns.ts', '../src/zone/attackers.ts', '../src/zone/walk-back.ts');
  for (const f of files) assert.doesNotMatch(src(f), /terrain/i, `${f} must not know about the terrain`);
  assert.doesNotMatch(src('../src/zone/terrain.ts'), /from '\.\.\/(fight|sim)\//);
});

test('the page wiring: no flag of its own, on in the zone, off with ?ground=v1 / ?postkill=v1, the hero and foes ride the ground, the camera lift comes off before the rig reads it', () => {
  const main = src('../src/client/main.ts'), scene = src('../src/fight/scene.ts');
  assert.match(main, /if \(ZONE && groundOn\(search\)\) \{ const zoneRow = [^\n]*terrainFor\(/);
  assert.doesNotMatch(src('../src/zone/terrain.ts') + src('../src/fight/terrain-draw.ts'), /location|search|URLSearchParams/);
  assert.match(scene, /player\.position\.set\(state\.x, groundH\(state\.x, state\.z\), state\.z\)/);
  assert.match(scene, /opponent\.position\.set\(practice\.enemy\.x, groundH\(practice\.enemy\.x, practice\.enemy\.z\)/);
  assert.match(scene, /entry\.group\.position\.set\(at\.x, groundH\(at\.x, at\.z\), at\.z\)/);
  assert.match(scene, /live\.group\.position\.set\(p\.enemy\.x, groundH\(p\.enemy\.x, p\.enemy\.z\)/);
  assert.match(scene, /camera\.position\.y -= terrainLift;[\s\S]*rig\.update\([\s\S]*camera\.position\.y \+= terrainLift;/);
  assert.equal(terrainFor(ZONE, ORIGIN, clone((r) => { r.on = false; })), null);
});
