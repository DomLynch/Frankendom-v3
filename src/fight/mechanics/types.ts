// A boss signature mechanic (data/mechanics.json, src/fight/mechanics/registry.ts). A WORLD LAYER on the shared engine like mobkit.ts: outside SIM_FILES, it reads the duel as the tick begins and returns
// the duel and the hero's intent the tick is stepped on (never a second resolver: a blow, a roll, a guard are still stepDuel's), plus whether the boss stands still this tick (the `hold` layer).
// Deterministic: no dice, no clock; every number is a row of data/mechanics.json. One instance per fight; `reset()` when the fight ends or restarts.
import type { Duel, Intent } from '../duel.ts';

/** What the scene draws for the mechanic this frame: `phase`, a line from the boss (from) to the hero (to) in metres, and `t` 0..1 through the phase. The object is reused: read it, never keep it. */
export type MechanicView = { phase: 'tell' | 'lunge' | 'latched'; fromX: number; fromZ: number; toX: number; toZ: number; t: number };
/** The reused result of a step: the duel to step, the hero's intent to step it with, and whether the boss's own intent is replaced by standing still. */
export type MechanicStep = { duel: Duel; intent: Intent; hold: boolean };
export type Mechanic = {
  readonly id: string;
  step(duel: Duel, hero: Intent): MechanicStep;
  view(): MechanicView | null;
  reset(): void;
};
