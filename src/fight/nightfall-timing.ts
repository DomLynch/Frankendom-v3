import { CAST_MARGIN, LAND_AT, type Cast } from './special-timing.ts';
import { smooth } from './fx-math.ts';

// Nyx's Nightfall, the presentation timeline (World, 2026-09-30; Lead's brief). Three-free, like special-timing.ts, whose Cast it reads: the
// arena's light drains over the windup (fully dark VEIL_HOLD ticks before the release, so the dark is held for a beat), then on
// SpecialLanded a veil sweeps from the caster through the target in VEIL ticks while the light comes back over RETURN ticks (~0.5 s).
// A fizzle returns the light from wherever the drain had got to. A cast whose end event never comes (Finishers' guard in special-timing.ts drops it
// LAND_AT + SPECIAL_RECOVER + CAST_MARGIN ticks after the start) is treated as a fizzle at LAND_AT + CAST_MARGIN, so the light is fully back (RETURN ticks
// later, before the guard's drop) and the dark never snaps off. Nothing here touches the sim.
export const STUCK_AT = LAND_AT + CAST_MARGIN;
export const VEIL_HOLD = 15, DRAIN_DONE = LAND_AT - VEIL_HOLD, RETURN = 30, VEIL = 24;

export type Nightfall = { drain: number; veil: number | null };

// `drain` 0..1 is how dark the arena is (0 = the light of the theme); `veil` 0..1 is the cloak's sweep from the caster to past the target, null when none.
export function nightfall(cast: Cast, now: number): Nightfall {
  const built = (age: number) => smooth(age / DRAIN_DONE), end = cast.landed ?? cast.fizzled ?? (now - cast.start >= STUCK_AT ? cast.start + STUCK_AT : null);
  if (end === null) return { drain: built(now - cast.start), veil: null };
  const age = now - end, from = cast.landed !== null ? 1 : built(end - cast.start);
  return { drain: from * (1 - smooth(age / RETURN)), veil: cast.landed !== null && age >= 0 && age < VEIL ? age / VEIL : null };
}
