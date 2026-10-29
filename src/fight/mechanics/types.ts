// The boss signature-mechanic frame (Dom 2026-10-28: each boss its own fighting identity). A mechanic is a WORLD LAYER on the shared engine, the way mobkit.ts is: it rewrites the boss's
// intent AFTER the AI's decide() (stepPractice's `layer`) and, after the tick, may move bodies (`settle`); it never resolves a blow itself. Every number is a row of data/mechanics.json
// (a map id -> row; src/sim/validate.js checks it), the boss names its mechanic in data/rings.json `bosses[].mechanic`, and the code lives in its own module here plus one line in registry.ts.
// Outside the record digest on purpose, like mobkit.ts: it reads a Duel and returns an Intent or a moved Duel, with fixed ticks and no dice.
import type { Duel, Intent } from '../duel.ts';

/** What the renderer needs of a running mechanic (positions in sim metres, x/z). `stage` is the mechanic's own word; `t` the ticks spent in it; `lock` the aim is frozen (the line is now where the blow goes). */
export type MechanicView = { id: string; stage: 'idle' | 'tell' | 'lunge' | 'drag' | 'follow'; t: number; of: number; lock: boolean; x: number; z: number; dx: number; dz: number; length: number; width: number; colour: string };

export type Mechanic = {
  readonly id: string;
  /** Back to the start (a new fight, a respawn, a dead boss): the cooldown is the opening one again. */
  reset(): void;
  /** After decide(): the boss's intent for this tick. Returns `warden` itself when the mechanic is not acting. */
  layer(duel: Duel, warden: Intent): Intent;
  /** After stepDuel: the duel with any body the mechanic moves (the lunge, the drag). Returns `stepped` itself when nothing moved. `prior` is the duel the tick began on. */
  settle(prior: Duel, stepped: Duel): Duel;
  /** The picture's state, or null when there is nothing to draw. The same object every call (no per-frame allocation). */
  view(): MechanicView | null;
};
