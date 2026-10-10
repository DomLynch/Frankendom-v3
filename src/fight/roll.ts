// The world-mob damage roll, defined ONCE (Dom's rule: one engine for the Pit and the world; the Origins luck ruling, +/-10% on every blow of a world-mob fight). Dependency-free on purpose:
// src/fight/duel.ts applies it inside the duel step (Duel.roll) and origins/luck/luck.ts shows the same numbers on the HUD, both importing THESE functions, so they cannot drift.
// A sim file: the draw is a pure function of (fight seed, blow index) with no Math.random and no transcendental, so a replay reproduces it on any engine.
export const ROLL_BAND = 10;   // percent: a blow is scaled by a uniform whole percent from -10 to +10
// The unit draw in [0, 1) for blow number `hit` of the fight seeded `seed`.
export const rollUnit = (seed: number, hit: number): number => {
  let h = Math.imul((seed >>> 0) ^ Math.imul(hit + 1, 0x9e3779b1), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;   // 2^32, a literal: the sim uses no **
};
export const percentOf = (u: number, band = ROLL_BAND): number => Math.min(band, Math.floor(u * (2 * band + 1)) - band);
export const rolledDamage = (base: number, percent: number): number => Math.max(1, Math.round(base * (1 + percent / 100)));
export const rollPercent = (seed: number, hit: number): number => percentOf(rollUnit(seed, hit));
