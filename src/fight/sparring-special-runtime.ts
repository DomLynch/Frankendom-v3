// Transient admin presets. No record, equipment, identity or global rule changes.
import { RULES, specialOf } from './moves.ts';
import { skillOf } from './loot.ts';
import { SPECIAL_TESTS, type SpecialTest } from './special-look.ts';
import { SPECIAL_CUE_OF, type SpecialCue } from './sound/special.ts';
import type { SparringKit } from '../sparring.ts';
import type { Duel, Fighter } from './duel.ts';

export const SUPPORTED_PLAYER_SPECIALS: readonly SpecialTest[] = Object.freeze(Object.keys(SPECIAL_TESTS) as SpecialTest[]);
export type SparringSpecialSelection = Readonly<{ player: SpecialTest | null; opponent?: SpecialTest | null }>;
export function validateSparringSpecialSelection(kit: SparringKit, selection: SparringSpecialSelection): void {
  for (const id of [selection.player, selection.opponent]) {
    if (id !== null && id !== undefined && !SUPPORTED_PLAYER_SPECIALS.includes(id)) throw new RangeError('Unknown Sparring special');
  }
  if (selection.player === undefined) throw new RangeError('Missing player special selection');
  if (selection.player && kit.skill) throw new RangeError('Choose a legacy skill or a registered special');
  if (kit.difficulty === 'dummy' && selection.opponent) throw new RangeError('The dummy cannot cast a special');
}
export const specialCueFor = (id: SpecialTest | null): SpecialCue | undefined => id ? SPECIAL_CUE_OF[id] : undefined;

function preset(fighter: Fighter, id: SpecialTest | null): Fighter {
  const ordinary = { ...fighter };
  delete ordinary.specialShare; delete ordinary.special; delete ordinary.specialName;
  ordinary.skillCooldown = 0;
  if (!id) return ordinary;
  const source = SPECIAL_TESTS[id], name = specialOf(source.opponent, source.level);
  return { ...ordinary, skill: skillOf(source.opponent), specialShare: source.level >= RULES.special.bossFrom ? RULES.special.bossDamage : RULES.special.damage,
    skillCooldown: source.first, ...(name ? { specialName: name } : {}) };
}
// Undefined opponent leaves the legacy native/preview decoration untouched.
export function sparringSpecialDuel(duel: Duel, selection: SparringSpecialSelection): Duel {
  return { ...duel, fighters: [preset(duel.fighters[0], selection.player), selection.opponent === undefined ? duel.fighters[1] : preset({ ...duel.fighters[1], skill: null }, selection.opponent)] };
}
