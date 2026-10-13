// The ONE legend key (Lead 2026-10-13) is a spell row's id without `spell:` ("alvis"), the key Backend's grimoire grants by and a kill's provenance writes. A legend row's id is that key;
// a legend with no spell row is listed `spellless: true` (52 of the 100 rank legends today) and its id is a slug of its name. The page reads only that flag (the 700-row spell catalogue stays out of the entry bundle); tests/legend-families.test.ts checks every id against the spell rows.
// Legend families as data: a family row names the legends that may wear one opponent's rank, any number per rank. The two tables (legend-rows.json, legend-families.json)
// load through the shared loader (src/core/registry.ts); a family's legendIds are checked against the legend table at load. Cosmetic only, like src/legends.ts.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import { makeRng } from './blood-style.ts';
import FAMILIES from './legend-families.json' with { type: 'json' };
import LEGENDS from './legend-rows.json' with { type: 'json' };
import MANIFEST from './legend-families.manifest.json' with { type: 'json' };

export type FamilyLegend = { name: string; source: string; backstory: string };
type Entry = { legendId: string; rank: number };
export type LegendFamily = { id: string; opponent: string; region: string; legends: readonly Entry[] };

const [LEGEND_MANIFEST, FAMILY_MANIFEST] = MANIFEST.tables as unknown as Manifest[];
const LEGEND_TABLE = tableFromFile(LEGEND_MANIFEST!, LEGENDS, 'legend-rows.json');
loadRegistry([LEGEND_TABLE, tableFromFile(FAMILY_MANIFEST!, FAMILIES, 'legend-families.json')]);

const TEXT = new Map(LEGEND_TABLE.rows.map((r) => [r.id as string, { name: r.name, source: r.source, backstory: r.backstory } as FamilyLegend]));
export const LEGEND_FAMILIES: readonly LegendFamily[] = FAMILIES.families;
export const familyOf = (opponent: string): LegendFamily | null => LEGEND_FAMILIES.find((f) => f.opponent === opponent) ?? null;
export const isSpellless = (legendId: string): boolean => (LEGEND_TABLE.rows.find((r) => r.id === legendId)?.spellless ?? false) === true;
export const legendText = (legendId: string): FamilyLegend | null => TEXT.get(legendId) ?? null;

// The legends that may wear `rank` (1..10), in the family row's order.
export const candidatesAt = (family: LegendFamily, rank: number): readonly string[] => family.legends.filter((e) => e.rank === rank).map((e) => e.legendId);

// The legend a fight wears at `rank`: one of the family's candidates, chosen by the fight seed alone (a replay of the seed shows the same legend; no clock, no Math.random).
// One candidate is that candidate whatever the seed, which is every rank today.
export function pickLegend(family: LegendFamily, rank: number, seed: number): string | null {
  const c = candidatesAt(family, rank);
  return c.length ? c[Math.floor(makeRng((seed ^ Math.imul(rank, 0x9e3779b1)) >>> 0)() * c.length)]! : null;
}
