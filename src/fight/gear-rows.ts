// Gear pieces as rows (Wave A1, PR1): armour, resist{school}, weight, wearMax and slot, from src/fight/gear-defs.json through the shared loader. Light, medium and heavy are three PRESET
// rows in the same table, not a type: a piece names one with `extends` and overrides what it likes, and a fourth class is a fourth row. `resist` keys are rows of school-defs.json
// (an open set: negative = weak). The curve numbers are the `gear` rule row. Nothing here is read by the simulation: gear-stats.ts folds worn rows into a Loadout and then into the gear layer of the player's sheet outside the duel,
// and the duel sees only the resolved sheet (sheet-rows.ts), so a tier, a slot or a table never crosses the seam.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import { ARMOUR_SLOTS } from '../core/loot.ts';
import { SCHOOL_IDS } from './schools.ts';
import GEAR_DEFS from './gear-defs.json' with { type: 'json' };
import GEAR_MANIFEST from './gear-defs.manifest.json' with { type: 'json' };

export type GearRow = { readonly id: string; readonly slot: string | null; readonly preset: boolean; readonly armour: number; readonly weight: number; readonly wearMax: number; readonly resist: Readonly<Record<string, number>> };
export type GearRules = { readonly armourBase: number; readonly armourPerLevel: number; readonly reductionCapPermille: number; readonly weightPermille: number; readonly resistPermille: number };
export type GearTable = { readonly rows: Readonly<Record<string, GearRow>>; readonly rules: GearRules };

type RawRow = { id: string; slot?: string; preset?: boolean; extends?: string; armour: number; weight: number; wearMax: number; resist: Record<string, number> };

export function loadGearDefs(raw: { gear?: readonly unknown[]; rules?: readonly unknown[] }, schools: readonly string[] = SCHOOL_IDS, slots: readonly string[] = ARMOUR_SLOTS): GearTable {
  loadRegistry(GEAR_MANIFEST.tables.map((t) => tableFromFile(t as unknown as Manifest, raw, 'gear-defs.json')));
  const defs = (raw.gear ?? []) as readonly RawRow[], byId = new Map(defs.map((r) => [r.id, r])), rows: Record<string, GearRow> = {};
  for (const r of defs) {
    const base = r.extends === undefined ? undefined : byId.get(r.extends);
    if (r.extends !== undefined && (!base || !base.preset)) throw Error(`gear-defs "${r.id}": extends "${r.extends}", which is no preset row`);
    const slot = r.slot ?? null, preset = !!r.preset;
    if (!preset && (slot === null || !slots.includes(slot))) throw Error(`gear-defs "${r.id}": a piece names its slot (${slots.join(', ')})`);
    if (r.armour < 0 || r.weight < 0 || r.wearMax < 1) throw Error(`gear-defs "${r.id}": armour and weight are not negative and wearMax is at least 1`);
    const resist = { ...(base?.resist ?? {}), ...r.resist };
    for (const [school, n] of Object.entries(resist)) if (!schools.includes(school) || !Number.isInteger(n) || Math.abs(n) > 4) throw Error(`gear-defs "${r.id}": resist ${school} is a school row and a whole number within +-4`);
    rows[r.id] = { id: r.id, slot, preset, armour: r.armour, weight: r.weight, wearMax: r.wearMax, resist };
  }
  const rules = (raw.rules ?? []) as readonly (GearRules & { id: string })[];
  if (rules.length !== 1 || rules[0]!.id !== 'gear') throw Error('gear-defs: exactly one rule row, "gear"');
  const { armourBase, armourPerLevel, reductionCapPermille, weightPermille, resistPermille } = rules[0]!;
  if (armourBase < 1 || armourPerLevel < 0 || reductionCapPermille < 0 || reductionCapPermille > 1000 || weightPermille < 0 || resistPermille < 0) throw Error('gear-defs: the gear rule numbers are in range');
  return { rows, rules: { armourBase, armourPerLevel, reductionCapPermille, weightPermille, resistPermille } };
}

export const GEAR: GearTable = loadGearDefs(GEAR_DEFS);
