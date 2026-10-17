// The world-mob damage roll, defined ONCE (Dom's rule: one engine for the Pit and the world; the Origins luck ruling, +/-10% on every blow of a world-mob fight). Its only import is the shared row loader (the swarm rows):
// src/fight/duel.ts applies it inside the duel step (Duel.roll) and src/core/luck.ts shows the same numbers on the HUD, both importing THESE functions, so they cannot drift.
// A sim file: the draw is a pure function of (fight seed, blow index) with no Math.random and no transcendental, so a replay reproduces it on any engine.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import SWARM_DEFS from './swarm-defs.json' with { type: 'json' };
import SWARM_MANIFEST from './swarm-defs.manifest.json' with { type: 'json' };
import { ROLL_BAND } from './roll-rows.ts';   // the dials are rows (roll-defs.json)
export { ROLL_BAND };
// percent: a blow is scaled by a uniform whole percent from -10 to +10
// The unit draw in [0, 1) for blow number `hit` of the fight seeded `seed`.
export const rollUnit = (seed: number, hit: number): number => {
  let h = Math.imul((seed >>> 0) ^ Math.imul(hit + 1, 0x9e3779b1), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;   // 2^32, a literal: the sim uses no **
};
// The swarm band (programme item 6, world fights only: a duel with no roll is untouched): each foe on the target past the first (the swarm) widens the band
// by its rank's `perFoe` percent, at most `cap`. One ROW per rank in swarm-defs.json through the shared loader; all zero as shipped, so the band stays ROLL_BAND.
export type SwarmRow = { readonly id: string; readonly rank: number; readonly perFoe: number; readonly cap: number };
const SWARM_TABLE = tableFromFile(SWARM_MANIFEST.tables[0] as unknown as Manifest, SWARM_DEFS, 'swarm-defs.json');
const SLOT_TABLE = tableFromFile(SWARM_MANIFEST.tables[1] as unknown as Manifest, SWARM_DEFS, 'swarm-defs.json');
loadRegistry([SWARM_TABLE, SLOT_TABLE]);
export const SWARM_ROWS: readonly SwarmRow[] = (SWARM_TABLE.rows as unknown as SwarmRow[]).map((r) => {
  if (r.rank < 1 || r.perFoe < 0 || r.cap < 0) throw Error(`swarm-defs "${r.id}": rank from 1, perFoe and cap from 0`);
  return r;
});
export const swarmBand = (swarm = 1, rank = 1, rows = SWARM_ROWS): number => {
  const r = rows.find((x) => x.rank === rank);
  return ROLL_BAND + (r ? Math.min(r.cap, r.perFoe * Math.max(0, swarm - 1)) : 0);
};
export const percentOf = (u: number, band = ROLL_BAND): number => Math.min(band, Math.floor(u * (2 * band + 1)) - band);
export const rolledDamage = (base: number, percent: number): number => Math.max(1, Math.round(base * (1 + percent / 100)));
export const rollPercent = (seed: number, hit: number): number => percentOf(rollUnit(seed, hit));

// The many-on-one cut (Dom via Strategy, 2026-10-13; reverses the 10-07 drop): the Nth attacker on one target lands `percent` of its blow, 1st full, 2nd 50, 3rd and later 30. One ROW per (kind, slot) in swarm-defs.json, so
// PvP can diverge from mobs by editing a row. `crowdPercent` is the ONLY reader: the duel step applies it (Duel.crowd), so a world creature on a hero and any future player-on-player crowd share the one engine.
export type SlotRow = { readonly id: string; readonly kind: string; readonly slot: number; readonly percent: number };
export type CrowdKind = 'mob' | 'pvp';
export const SLOT_ROWS: readonly SlotRow[] = (SLOT_TABLE.rows as unknown as SlotRow[]).map((r) => {
  if (r.slot < 1 || r.percent < 1 || r.percent > 100) throw Error(`swarm-defs "${r.id}": slot from 1, percent 1..100`);
  return r;
});
export const crowdPercent = (slot: number, kind: CrowdKind = 'mob', rows = SLOT_ROWS): number => {
  const mine = rows.filter((x) => x.kind === kind);
  return (mine.find((x) => x.slot === slot) ?? mine.reduce<SlotRow | undefined>((a, x) => (x.slot <= slot && (!a || x.slot > a.slot) ? x : a), undefined))?.percent ?? 100;   // past the last row: the last row
};
