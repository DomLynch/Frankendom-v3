// The contract vocabularies that are DATA, as rows (src/core/contracts/definitions.json, manifest beside it, loaded and checked by the shared registry loader): the gates, the character relations, the quest roles,
// the attitudes and the quest scopes. A new one is a row. Ids are strings checked against the rows (an unknown id still rejects in readEnum), never a TypeScript union. What stays CODE is every list whose value
// selects its own code path: ENCOUNTER_SCOPES (world.ts), STAGE_KINDS, CONDITION_KINDS and QUEST_STATUSES (story.ts), and in items.ts/economy.ts CATEGORIES, STORY, BINDINGS, POWERS, LOCATION_KINDS, PROVENANCE_KINDS, HISTORY_KINDS, ROLL_MODES, SERVICE_KINDS
// and DISTRIBUTIONS (one value; a shared mode needs code first). The rows here also cover the item vocabularies (rarities, materials, loot presentations) and what a service accepts (flags).
import defs from './definitions.json' with { type: 'json' };

export type GateRow = { order: number; tier: string; open?: boolean; membership?: boolean };   // open: no standing is asked; membership: the realm needs a paid membership
export type AttitudeRow = { order: number; atOrBelow?: number; atOrAbove?: number; expelledCeiling?: boolean };   // a band: standing at or below / at or above; neither = the default between the bands; expelledCeiling: the best an expelled member can be
// Item rules read these flags, never a name: powers {tiered: gets a loot tier, upgradeable: the smith works it, gearOnly: only gear carries it}; categories {path: gear (a worn piece) or stock (a counted thing),
// slot: required | allowed | none, single: stack 1, craftInput: an upgrade material}; story tags {blocksTrade, single, bindsOnAcquire, staysWithCharacter}; provenance kinds {tradeable, blockReason (the trade-block
// reason a refusal carries), needsPath (an item of another category path never trades), onlyCategories (a mint limited to these categories)}.
// A DRAW material (a name on a model's material, src/core/grades.ts): class = the grade class it takes (metal, trim, leather, cloth, stone), exempt = a deliberate
// no-grade (bone, skin, wood, authored artwork), variants = `<Name>_<anything>` resolves to this row (Gambeson_veteran). A suffix row (`<Family>Iron`) classes a whole TRELLIS family.
export type DrawMaterialRow = { order: number; class?: string; exempt?: boolean; variants?: boolean };
export type DrawSuffixRow = { order: number; class: string };
// sparks: a blade of this material strikes sparks off another; dull: a weapon of this material strikes none (wood). Presentation only (src/fight/clash-sparks.ts).
export type MaterialRow = { order: number; sparks?: boolean; dull?: boolean };
export type PowerRow = { tiered?: boolean; upgradeable?: boolean; gearOnly?: boolean };
export type CategoryRow = { path: string; slot: string; single?: boolean; craftInput?: boolean; gear?: boolean };   // gear: the category that is worn gear (carries a power budget, may be a legacy loot piece)
export type StoryRow = { blocksTrade?: boolean; single?: boolean; bindsOnAcquire?: boolean; staysWithCharacter?: boolean };
export type ProvenanceRow = { tradeable: boolean; blockReason?: string; needsPath?: string; onlyCategories?: string[] };
export const DEFINITIONS = defs as unknown as { gates: Readonly<Record<string, GateRow>>; relations: Readonly<Record<string, object>>; questRoles: Readonly<Record<string, object>>; attitudes: Readonly<Record<string, AttitudeRow>>; questScopes: Readonly<Record<string, object>>; rarities: Readonly<Record<string, { order: number; sellable?: boolean }>>; powers: Readonly<Record<string, PowerRow>>; categories: Readonly<Record<string, CategoryRow>>; story: Readonly<Record<string, StoryRow>>; provenanceKinds: Readonly<Record<string, ProvenanceRow>>; materials: Readonly<Record<string, MaterialRow>>; drawMaterials: Readonly<Record<string, DrawMaterialRow>>; drawSuffixes: Readonly<Record<string, DrawSuffixRow>>; presentations: Readonly<Record<string, object>>; serviceAccepts: Readonly<Record<string, { armour: boolean; weapons: boolean }>> };
export const ids = (table: Readonly<Record<string, object>>): string[] => Object.entries(table).sort((a, b) => ((a[1] as { order?: number }).order ?? 0) - ((b[1] as { order?: number }).order ?? 0)).map(([id]) => id);   // by `order` when the rows have one, else file order
const NONE = {};
export const materialRow = (id: string): Partial<MaterialRow> => DEFINITIONS.materials[id] ?? NONE;
export const powerOf = (id: string): PowerRow => DEFINITIONS.powers[id] ?? NONE;
export const categoryOf = (id: string): Partial<CategoryRow> => DEFINITIONS.categories[id] ?? NONE;
export const storyOf = (id: string): StoryRow => DEFINITIONS.story[id] ?? NONE;
export const provenanceOf = (kind: string): Partial<ProvenanceRow> => DEFINITIONS.provenanceKinds[kind] ?? NONE;
