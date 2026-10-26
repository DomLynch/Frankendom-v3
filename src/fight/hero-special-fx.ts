// V3 (Dom 2026-10-26, twice: "they still seem a bit too much special effected"; Strategy APPROVED the audit in PR #67, hit-stop kept at 6 frames, it is the weight):
// the contact kit of the HERO's two melee specials (the Skull Crack and the Whirlwind) at a fraction of today's. data/fight.json `specialFx` holds the
// multipliers; this leaf reads them and answers "how much" for one event. The shared rows (hit-stop-defs.json, feel-rules.json, sandbox-rules-defs.json)
// also drive the opponent's and the boss's specials, so none of them is edited: the hero's share is scaled HERE, where the contact is drawn.
//
// Presentation only (camera kick, flash, sparks, trail opacity, sound gain): the sim never imports this file, so no digest or RECORD_VERSION moves and Gate 0
// never sees it. OFF (null) unless the page sets it: `?fx=v1` leaves it off = today's numbers exactly.
export type HeroSpecialFx = {
  readonly skills: readonly string[];       // the hero's picked specials (skill ids) the multipliers apply to
  readonly cameraKick: number;              // x the camera's push / knock / along / drop on the landing
  readonly flash: number;                   // x the impact flash's size
  readonly sparks: number;                  // x the impact spark count
  readonly trailSkill: string;              // the special whose swing trail is softened
  readonly trailReaping: number;            // x that swing's trail opacity
  readonly soundGain: number;               // x the gain of the specialSound rows named in soundRows
  readonly soundRows: readonly string[];    // specialSound row ids (sandbox-rules-defs.json)
};
export let HERO_SPECIAL_FX: HeroSpecialFx | null = null;
export function setHeroSpecialFx(fx: HeroSpecialFx | null): void { HERO_SPECIAL_FX = fx; }

type Row = Partial<Record<keyof HeroSpecialFx | 'about', unknown>>;
const scale = (name: string, v: unknown): number => { if (typeof v !== 'number' || !(v > 0 && v <= 1)) throw new Error(`specialFx ${name} ${String(v)} is not a multiplier in (0, 1]`); return v; };
const names = (name: string, v: unknown): readonly string[] => { if (!Array.isArray(v) || !v.length || v.some((s) => typeof s !== 'string' || !s)) throw new Error(`specialFx ${name} is not a list of ids`); return v as string[]; };

/** The effects a fight plays: `?fx=v1` (or no row) is today's (none), otherwise the data row's. */
export function heroSpecialFxFor(row: Row | undefined, search = ''): HeroSpecialFx | null {
  if (new URLSearchParams(search).get('fx') === 'v1' || !row) return null;
  const skills = names('skills', row.skills), trailSkill = row.trailSkill;
  if (typeof trailSkill !== 'string' || !skills.includes(trailSkill)) throw new Error(`specialFx trailSkill ${String(trailSkill)} is not one of skills`);
  return { skills, cameraKick: scale('cameraKick', row.cameraKick), flash: scale('flash', row.flash), sparks: scale('sparks', row.sparks), trailSkill, trailReaping: scale('trailReaping', row.trailReaping), soundGain: scale('soundGain', row.soundGain), soundRows: names('soundRows', row.soundRows) };
}

/** True for the hero's own picked special: slot 0 casting `skill_<id>` of a listed skill (an opponent's special, even the same skill, never matches). */
export const heroSpecial = (attacker: number | undefined, move: string | undefined): boolean =>
  HERO_SPECIAL_FX !== null && attacker === 0 && !!move?.startsWith('skill_') && HERO_SPECIAL_FX.skills.includes(move.slice('skill_'.length));
/** Multiplier on the camera kick (push, knock, along, drop) of a contact `attacker` lands with `move`; 1 for anything else. */
export const kickScale = (attacker: number | undefined, move: string | undefined): number => (heroSpecial(attacker, move) ? HERO_SPECIAL_FX!.cameraKick : 1);
/** Multiplier on the impact flash's size. */
export const flashScale = (attacker: number | undefined, move: string | undefined): number => (heroSpecial(attacker, move) ? HERO_SPECIAL_FX!.flash : 1);
/** Multiplier on the impact spark count. */
export const sparkScale = (attacker: number | undefined, move: string | undefined): number => (heroSpecial(attacker, move) ? HERO_SPECIAL_FX!.sparks : 1);
/** Multiplier on a specialSound row's gain (`rowId`) when `caster` plays it. */
export const soundScale = (caster: number | undefined, rowId: string): number => (HERO_SPECIAL_FX !== null && caster === 0 && HERO_SPECIAL_FX.soundRows.includes(rowId) ? HERO_SPECIAL_FX.soundGain : 1);
/** Multiplier on the swing trail's opacity of a fighter on `slot` whose last move was `move` (the Whirlwind's wide arc only). */
export const trailScale = (slot: number | undefined, move: string | undefined): number => (heroSpecial(slot, move) && move === `skill_${HERO_SPECIAL_FX!.trailSkill}` ? HERO_SPECIAL_FX!.trailReaping : 1);
