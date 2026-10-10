import type { OpponentId } from '../roster.ts';

// Approved presentation identities; normal A activation remains gated in Match.
const CLASS_SPECIALS = {
  witch: ['wake', 'stirring'],
  plaguedoctor: ['tempo', 'pulse'],
  knight: ['drag', 'swing'],
  nightborn: ['lunge', 'cuts'],
  veteran: ['setfoot', 'standfast'],
  goblin: ['knuckledirt', 'ratrun'],
  executioner: ['heelreap', 'blackfurrow'],
  pitborn: ['cleaverset', 'earthfold'],
  dwarf: ['groundset', 'ironsettle'],
  shieldmaiden: ['cutmark', 'gatherededge'],
} as const satisfies Partial<Record<OpponentId, readonly [string | null, string | null]>>;

export type ClassSpecialId = Exclude<typeof CLASS_SPECIALS[keyof typeof CLASS_SPECIALS][number], null>;

// The supplied fight level belongs to this actor, independently of HUD rank or side.
// Boss ranks (levels 36+) use a separate identity bridge; unknown choices stay unknown.
export function classSpecialFor(opponent: OpponentId, level: number): ClassSpecialId | null {
  if (!Number.isInteger(level) || level < 1 || level >= 36) return null;
  const slots = (CLASS_SPECIALS as Partial<Record<OpponentId, readonly [ClassSpecialId | null, ClassSpecialId | null]>>)[opponent];
  return slots?.[level < 16 ? 0 : 1] ?? null;
}
