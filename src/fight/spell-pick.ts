import { BRICKS, isSpellId } from './spell-cast.ts';
import { SHEET_SKILLS } from './sheet-rows.ts';
import SPELL_INDEX from './spell-index.json' with { type: 'json' };

// The client's spell pick (Combat, the wire from the grimoire to Match's `spell` port; Dom's bar: data only). The equipped id and the account's owned ids come from the player's grimoire and pick (Web); this resolves them
// through the rows alone: the spell must be a spell-index row AND owned, and the skill it is cast at is the character's current skill in the spell's school (a sheet-defs skill row), whole, between that row's base and cap.
// The server stays the authority: origins/server/spell-check.ts re-checks the grimoire and the stored skill ceiling when the record settles, so a wrong claim here pays nothing. No spell id, number or colour in this file.
const INDEX = (SPELL_INDEX as unknown as { spells: Record<string, readonly [string, number]> }).spells;
export const schoolOfSpell = (id: string): string | undefined => (isSpellId(id) ? BRICKS[INDEX[id]![0]]?.school : undefined);
/** `skills` is the character's current value per skill id (the stored build's `values`); a skill absent from it is at its base. */
export function pickSpell(equipped: string | undefined, owned: readonly string[], skills: Readonly<Record<string, number>>): { id: string; skill: number } | undefined {
  if (equipped === undefined || !isSpellId(equipped) || !owned.includes(equipped)) return undefined;
  const school = schoolOfSpell(equipped), row = SHEET_SKILLS.find((s) => s.id === school);
  if (!row) return undefined;
  const value = skills[row.id], skill = Math.floor(Math.min(row.cap, Math.max(row.base, Number.isFinite(value) ? value! : row.base)));
  return { id: equipped, skill };
}
