import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import SLOT_DEFS from './spell-slot-defs.json' with { type: 'json' };
import SLOT_MANIFEST from './spell-slot-defs.manifest.json' with { type: 'json' };

// The special slots as rows (spec docs/specs/combat/spell-slots.md). A leaf of its own: the sim (duel.ts coolSlot, the replay's duplicate rule) and the entry chunk's equip and HUD read it; it must not import the spell catalogue. Read once at load.
const SLOT_T = tableFromFile(SLOT_MANIFEST.tables[0] as unknown as Manifest, SLOT_DEFS, 'spell-slot-defs.json');
const SLOT_RULE_T = tableFromFile(SLOT_MANIFEST.tables[1] as unknown as Manifest, SLOT_DEFS, 'spell-slot-defs.json');
loadRegistry([SLOT_T, SLOT_RULE_T]);
export type SpellSlot = { readonly id: string; readonly action: string; readonly order: number };
/** The slots in HUD order. An action is one verb per slot; at least one slot. */
export const SPELL_SLOTS: readonly SpellSlot[] = (SLOT_T.rows as unknown as SpellSlot[]).map((r) => ({ id: r.id, action: r.action, order: r.order })).sort((a, b) => a.order - b.order);
if (!SPELL_SLOTS.length) throw Error('spell-slot-defs: at least one slot');
if (new Set(SPELL_SLOTS.map((s) => s.action)).size !== SPELL_SLOTS.length || new Set(SPELL_SLOTS.map((s) => s.order)).size !== SPELL_SLOTS.length) throw Error('spell-slot-defs: one action and one order per slot');
const slotRule = (id: string): number => { const r = (SLOT_RULE_T.rows as unknown as { id: string; value: number }[]).find((x) => x.id === id); if (!r || !(r.value === 0 || r.value === 1)) throw Error(`spell-slot-defs: the rule "${id}" needs a row that is 0 or 1`); return r.value; };
export const SHARED_COOLDOWN = slotRule('sharedCooldown') === 1, ALLOW_DUPLICATE = slotRule('allowDuplicate') === 1;
