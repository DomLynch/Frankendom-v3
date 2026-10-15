import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import { isSpellId, spellUsesCap } from './spell-cast.ts';
import { POOLS } from './pools.ts';
import SPELL_INDEX from './spell-index.json' with { type: 'json' };
import LIST_DEFS from './spell-list-defs.json' with { type: 'json' };
import LIST_MANIFEST from './spell-list-defs.manifest.json' with { type: 'json' };

// The starter spell list and the special slots as rows (spec docs/specs/combat/spell-slots.md, rows PR: no behaviour, nothing in a fight reads these yet). A leaf: the registry loader, the spell resolver and the index.
const LIST_T = tableFromFile(LIST_MANIFEST.tables[0] as unknown as Manifest, LIST_DEFS, 'spell-list-defs.json');
loadRegistry([LIST_T]);
/** The stamina bar a spell must fit under (pool-defs.json, the same row the cost cap reads). */
export const STAMINA_BAR: number = POOLS.find((d) => d.id === 'stamina')!.default;
const SPELL_ROWS_INDEX = (SPELL_INDEX as unknown as { spells: Record<string, readonly [string, number]> }).spells;

export type SpellListEntry = { readonly id: string; readonly name: string; readonly level: number };
/** The starter list, in row order. The loader refuses an id that is not a catalogue spell, a level that does not match the index, a cost above the stamina bar, a blank name and a repeated id. */
export const checkSpellList = (rows: readonly SpellListEntry[]): SpellListEntry[] => rows.map((r) => {
  if (!isSpellId(r.id)) throw Error(`spell-list-defs "${r.id}": not a spell-index id`);
  if (SPELL_ROWS_INDEX[r.id]![1] !== r.level) throw Error(`spell-list-defs "${r.id}": level ${r.level} is not its catalogue level ${SPELL_ROWS_INDEX[r.id]![1]}`);
  if (!r.name.trim()) throw Error(`spell-list-defs "${r.id}": a display name`);
  if (spellUsesCap(r.id)) throw Error(`spell-list-defs "${r.id}": costs more than the stamina bar (the cost cap would hide it)`);   // the raw cost, not resolveSpell's capped one: min(COST_CAP, raw) can never exceed the bar
  return { id: r.id, name: r.name, level: r.level };
});
export const SPELL_LIST: readonly SpellListEntry[] = checkSpellList(LIST_T.rows as unknown as SpellListEntry[]);

export { SPELL_SLOTS, SHARED_COOLDOWN, ALLOW_DUPLICATE, type SpellSlot } from './spell-slot-rows.ts';   // the slot rows live in their own light module (the entry chunk reads them without the 700-row catalogue)
