// V3 (Dom 2026-10-26, via Lead: "Specials, all of them, can be used every 9 seconds, no stamina cost"): the HERO's specials — SPECIAL 1
// (the Skull Crack, a picked melee special) and SPECIAL 2 (the Whirlwind, slot b's melee skill), and a plain skill if the hero carries one —
// cool for `cooldown` ticks, each counted the way it is today (slot a from the strike's release, slot b and a plain skill from the press),
// and cost and need `stamina` (0) instead of their move row's. Kept: the first-ready delay (2 s), the Skull Crack's reach and its
// no-attack recovery after the strike, exhaustion (no stamina at all still refuses every attack), a spell's own cost. Opponents never change.
//
// A leaf of the simulation (no imports), an ERA flag like special-pace.ts: OFF (null) unless a driver sets it, so a headless run (Gate 0's
// V1-vs-V3 replays) steps V1's numbers byte for byte. src/client/main.ts sets it from data/fight.json `specialTerms`; `?spec=v1` leaves it off.
export type SpecialTerms = { readonly cooldown: number; readonly stamina: number };
export let SPECIAL_TERMS: SpecialTerms | null = null;
export function setSpecialTerms(terms: SpecialTerms | null): void { SPECIAL_TERMS = terms; }

/** The terms a fight plays: `?spec=v1` is V1's cooldowns and stamina (none), otherwise the data row's. */
export function specialTermsFor(row: SpecialTerms | undefined, search = ''): SpecialTerms | null {
  if (new URLSearchParams(search).get('spec') === 'v1' || !row) return null;
  if (!(Number.isInteger(row.cooldown) && row.cooldown > 0)) throw new Error(`specialTerms cooldown ${row.cooldown} is not a positive whole tick count`);
  if (!(Number.isInteger(row.stamina) && row.stamina >= 0)) throw new Error(`specialTerms stamina ${row.stamina} is not a whole number >= 0`);
  return { cooldown: row.cooldown, stamina: row.stamina };
}

// The hero: the player's own picked fighter (duel.ts `picked`, set on side 0 only). An opponent is never picked.
type Holder = { picked?: true };
export const termed = (f: Holder): boolean => SPECIAL_TERMS !== null && !!f.picked;
/** A hero special's cooldown in ticks (`ticks` = today's number, for anyone the terms do not apply to). */
export const termCooldown = (f: Holder, ticks: number): number => (termed(f) ? SPECIAL_TERMS!.cooldown : ticks);
/** A hero special's stamina cost and gate (`cost` = the move row's, for anyone the terms do not apply to). */
export const termStamina = (f: Holder, cost: number): number => (termed(f) ? SPECIAL_TERMS!.stamina : cost);
