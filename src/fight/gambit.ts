// The Gambit, defined ONCE (Dom's rule: one engine for the Pit and the world). A chosen version of the heavy: a second heavy press after the chamber arms it, the blow keeps the heavy's
// tell and timing, and when it would connect a draw decides: it lands for `multiplier` times the heavy, or the thrower staggers and nobody is hurt. Odds are ONE constant, about 1 in 2 for about 2x
// (Dom-approved 2026-10-07); the mean equals a heavy, and the self-stagger's punish cost makes it slightly worse (condition C1). src/fight/duel.ts applies it and origins/luck/luck.ts shows the same numbers
// on the HUD, both importing THESE, so they cannot drift. A sim file: no Math.random, no clock, no transcendental.
import { rollUnit } from '../roll.ts';
export type GambitOdds = { chance: number; multiplier: number };
export const GAMBIT_ODDS: GambitOdds = Object.freeze({ chance: 1 / 2, multiplier: 2 });
export const GAMBIT_KILL_FLOOR = 0.4;   // C1: a landed Gambit never kills from above 40% of max health
// C1: the mean landed damage must not beat the plain heavy (the self-stagger's punish cost then makes it slightly worse, as ruled).
export const gambitMean = (heavy: number, odds: GambitOdds = GAMBIT_ODDS): number => heavy * odds.chance * odds.multiplier;
export type GambitResult = { landed: boolean; damage: number };   // not landed = the thrower staggers (the duel's state), no damage
export function resolveGambit(heavy: number, u: number, health: number, maxHealth: number, odds: GambitOdds = GAMBIT_ODDS): GambitResult {
  if (!(u >= 0 && u < 1)) throw new RangeError(`gambit: u must be in [0, 1), got ${u}`);
  if (u >= odds.chance) return { landed: false, damage: 0 };
  const raw = Math.round(heavy * odds.multiplier);
  return { landed: true, damage: health > maxHealth * GAMBIT_KILL_FLOOR ? Math.min(raw, health - 1) : raw };
}
// The draw for Gambit number `draw` of the fight seeded `seed`: the roll's hash on a separate stream, so a Gambit never shifts a mob roll and the reverse.
export const gambitUnit = (seed: number, draw: number): number => rollUnit((seed ^ 0x6a09e667) >>> 0, draw);
