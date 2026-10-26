// V3 (Dom 2026-10-26: the Minotaur's special lands, with the hit sound and the hero's reaction, from any distance: "the distance isn't matching
// the reactions"): an opponent's plain MELEE special obeys the reach rules the player's does. It is pressed (by the AI and by the sim's gate)
// only inside `start` metres, and at its release tick it fizzles (SpecialFizzled: no damage, no hit pose, no hit sound) when the target is
// farther than `release`. Spells, bow volleys and cone breaths keep their own range rules; heavies are untouched. The values mirror the player's
// sandbox rows (specialMeleeReach 2.2 m start, + slack 0.4 = 2.6 m release), which V3 already runs for the hero.
//
// A leaf of the simulation (no imports), an ERA flag like special-pace.ts: OFF (null) unless a driver sets it, so a headless run (Gate 0's
// V1-vs-V3 replays, the V3-only golden rows) steps V1's reach byte for byte. src/client/main.ts sets it from data/fight.json `foeSpecialReach`;
// `?special=v1` leaves it off (V1's 3.0 m start, no release check).
export type FoeSpecialReach = { readonly start: number; readonly release: number };
export let FOE_SPECIAL_REACH: FoeSpecialReach | null = null;
export function setFoeSpecialReach(r: FoeSpecialReach | null): void { FOE_SPECIAL_REACH = r; }

/** The rule a fight plays: `?special=v1` is V1's (none), otherwise the data row's (`on` 0 = off). */
export function foeSpecialReachFor(row: { on: number; start: number; release: number } | undefined, search = ''): FoeSpecialReach | null {
  if (new URLSearchParams(search).get('special') === 'v1' || !row || !row.on) return null;
  if (!(row.start > 0)) throw new Error(`foeSpecialReach start ${row.start} is not a positive distance in metres`);
  if (!(row.release >= row.start)) throw new Error(`foeSpecialReach release ${row.release} is not at least start ${row.start}`);
  return { start: row.start, release: row.release };
}

// The caster the rule applies to: an opponent (never the player's picked fighter) with no spell, no bow volley and no cone breath.
type Caster = { picked?: true; spell?: unknown; bowSpecial?: string };
const applies = (f: Caster, coned: boolean): boolean => FOE_SPECIAL_REACH !== null && !f.picked && !f.spell && !f.bowSpecial && !coned;
/** The metres a melee special may be pressed from (`trunk` = today's reach, for anyone the rule does not apply to). */
export const foeStartReach = (f: Caster, coned: boolean, trunk: number): number => (applies(f, coned) ? FOE_SPECIAL_REACH!.start : trunk);
/** True when the special released now misses: the target is farther than the release reach. */
export const foeSpecialFizzles = (f: Caster, coned: boolean, gap: number): boolean => applies(f, coned) && gap > FOE_SPECIAL_REACH!.release;
