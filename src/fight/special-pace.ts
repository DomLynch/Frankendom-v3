// V3 (Dom 2026-10-26, after playing: "the skull crack is good, but it's a bit slowed down ... maybe 25% faster. The whirlwind speed is
// fine"): the player's own picked melee special can run at its own pace. data/fight.json `specialPace` names the skill and the scale; every
// tick count of that special's motion (its committed windup, the no-attack recovery after the strike, the presentation's raise and return
// and its start whoosh) is multiplied by `scale` and rounded to the nearest tick (Math.round: 32 → 24, 45 → 33.75 → 34, 120 → 90).
// Its damage, reach, cooldown, stamina and the cast pushback a hit adds are not motion and stay as they are.
//
// A leaf of the simulation (no imports), an ERA flag like stab-rule.ts: OFF (null) unless a driver sets it, so a headless run (Gate 0's
// V1-vs-V3 replays) steps V1's timing byte for byte. src/client/main.ts sets it from the data row; `?skull=v1` leaves it off (today's timing).
export type SpecialPace = { readonly skill: string; readonly scale: number };
export let SPECIAL_PACE: SpecialPace | null = null;
export function setSpecialPace(pace: SpecialPace | null): void { SPECIAL_PACE = pace; }

/** The pace a fight plays: `?skull=v1` is today's timing (none), otherwise the data row's. */
export function specialPaceFor(row: SpecialPace | undefined, search = ''): SpecialPace | null {
  if (new URLSearchParams(search).get('skull') === 'v1' || !row) return null;
  if (!(row.scale > 0 && row.scale <= 1)) throw new Error(`specialPace scale ${row.scale} is not in (0, 1]`);
  return { skill: row.skill, scale: row.scale };
}

// The caster a pace applies to: the player's own picked special (duel.ts `picked`) of the paced skill, cast as a plain melee special from
// slot a: no spell, no slot b cast, no bow volley. An opponent's special, a spell and slot b (the Whirlwind) never match.
type Caster = { picked?: true; skill?: string | null; spell?: unknown; castSlot?: 1; bowSpecial?: string };
export const paced = (f: Caster): boolean => SPECIAL_PACE !== null && !!f.picked && f.skill === SPECIAL_PACE.skill && !f.spell && f.castSlot === undefined && !f.bowSpecial;
/** `ticks` at the caster's pace (unchanged for any caster the pace does not apply to). */
export const paceTicks = (f: Caster, ticks: number): number => (paced(f) ? Math.round(ticks * SPECIAL_PACE!.scale) : ticks);
/** A sound row's delay (ms) for the player's own special of `skill`, at its pace. */
export const paceDelay = (skill: string, ms: number): number => (SPECIAL_PACE !== null && skill === SPECIAL_PACE.skill ? Math.round(ms * SPECIAL_PACE.scale) : ms);
