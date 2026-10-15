import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import { isSpellId, resolveSpell } from './spell-cast.ts';
import { POOLS } from './pools.ts';
import SPELL_INDEX from './spell-index.json' with { type: 'json' };
import LIST_DEFS from './spell-list-defs.json' with { type: 'json' };
import LIST_MANIFEST from './spell-list-defs.manifest.json' with { type: 'json' };
import SLOT_DEFS from './spell-slot-defs.json' with { type: 'json' };
import SLOT_MANIFEST from './spell-slot-defs.manifest.json' with { type: 'json' };

// The starter spell list and the special slots as rows (spec docs/specs/combat/spell-slots.md, rows PR: no behaviour, nothing in a fight reads these yet). A leaf: the registry loader, the spell resolver and the index.
const LIST_T = tableFromFile(LIST_MANIFEST.tables[0] as unknown as Manifest, LIST_DEFS, 'spell-list-defs.json');
const SLOT_T = tableFromFile(SLOT_MANIFEST.tables[0] as unknown as Manifest, SLOT_DEFS, 'spell-slot-defs.json');
const RULE_T = tableFromFile(SLOT_MANIFEST.tables[1] as unknown as Manifest, SLOT_DEFS, 'spell-slot-defs.json');
loadRegistry([LIST_T, SLOT_T, RULE_T]);
/** The stamina bar a spell must fit under (pool-defs.json, the same row the cost cap reads). */
export const STAMINA_BAR: number = POOLS.find((d) => d.id === 'stamina')!.default;
const INDEX = (SPELL_INDEX as unknown as { spells: Record<string, readonly [string, number]> }).spells;

export type SpellListEntry = { readonly id: string; readonly name: string; readonly level: number };
/** The starter list, in row order. The loader refuses an id that is not a catalogue spell, a level that does not match the index, a cost above the stamina bar, a blank name and a repeated id. */
export const SPELL_LIST: readonly SpellListEntry[] = (LIST_T.rows as unknown as SpellListEntry[]).map((r) => {
  if (!isSpellId(r.id)) throw Error(`spell-list-defs "${r.id}": not a spell-index id`);
  if (INDEX[r.id]![1] !== r.level) throw Error(`spell-list-defs "${r.id}": level ${r.level} is not its catalogue level ${INDEX[r.id]![1]}`);
  if (!r.name.trim()) throw Error(`spell-list-defs "${r.id}": a display name`);
  if (resolveSpell(r.id, 0)!.cost > STAMINA_BAR) throw Error(`spell-list-defs "${r.id}": costs more than the stamina bar`);
  return { id: r.id, name: r.name, level: r.level };
});

export type SpellSlot = { readonly id: string; readonly action: string; readonly order: number };
/** The slots in HUD order. An action is one verb per slot; at least one slot. */
export const SPELL_SLOTS: readonly SpellSlot[] = (SLOT_T.rows as unknown as SpellSlot[]).map((r) => ({ id: r.id, action: r.action, order: r.order })).sort((a, b) => a.order - b.order);
if (!SPELL_SLOTS.length) throw Error('spell-slot-defs: at least one slot');
if (new Set(SPELL_SLOTS.map((s) => s.action)).size !== SPELL_SLOTS.length || new Set(SPELL_SLOTS.map((s) => s.order)).size !== SPELL_SLOTS.length) throw Error('spell-slot-defs: one action and one order per slot');
const slotRule = (id: string): number => { const r = (RULE_T.rows as unknown as { id: string; value: number }[]).find((x) => x.id === id); if (!r || !(r.value === 0 || r.value === 1)) throw Error(`spell-slot-defs: the rule "${id}" needs a row that is 0 or 1`); return r.value; };
export const SHARED_COOLDOWN = slotRule('sharedCooldown') === 1, ALLOW_DUPLICATE = slotRule('allowDuplicate') === 1;
