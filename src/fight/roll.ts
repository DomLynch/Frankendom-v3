// The world-mob damage roll, defined ONCE (Dom's rule: one engine for the Pit and the world; the Origins luck ruling, +/-10% on every blow of a world-mob fight). Its only import is the shared row loader (the swarm rows):
// src/fight/duel.ts applies it inside the duel step (Duel.roll) and origins/luck/luck.ts shows the same numbers on the HUD, both importing THESE functions, so they cannot drift.
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
loadRegistry([SWARM_TABLE]);
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
