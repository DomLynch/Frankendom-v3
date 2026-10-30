// Transient admin presets. No record, equipment, identity or global rule changes.
   // V3: core/loot.ts
import { SPECIAL_TESTS, type SpecialTest } from './special-look.ts';
import { SPECIAL_CUE_OF, type SpecialCue } from './sound/special.ts';
import type { SparringKit } from '../stubs.ts';   // V3: sparring.ts
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

// Undefined opponent leaves the legacy native/preview decoration untouched.
