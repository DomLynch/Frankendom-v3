// What the spell book shows for a legend id: the legend's name, its family (the opponent kind it belongs to), the spell's name, school, colour and level, read from the spell catalogue (spells-*.json, 700 rows).
// The catalogue is ~330 KB, so the page imports THIS file lazily (the spell book screen), never in the entry bundle. Keyed like boss-spells.ts: the row id without `spell:`.
import { SPELL_ROWS, legendOf, type CatalogueSpell } from './spell-legends.ts';
import SCHOOL_DEFS from './school-defs.json' with { type: 'json' };
import SCHOOL_MANIFEST from './school-defs.manifest.json' with { type: 'json' };
import SPELL_INDEX from './spell-index.json' with { type: 'json' };
import { tableFromFile, type Manifest } from '../core/registry.ts';
import type { SpellInfo } from '../core/grimoire-model.ts';
type Row = CatalogueSpell & { boss_name?: string; name?: string };   // the catalogue row (spell-legends.ts SPELL_ROWS, the one spell table) with the display fields the book shows
// The school's colour and the spell's level are rows too (school-defs.json, spell-index.json), read here so no UI file holds a colour or a level.
const SCHOOL_COLOR = new Map(tableFromFile(SCHOOL_MANIFEST.tables[0] as Manifest, SCHOOL_DEFS, 'school-defs.json').rows.map((r) => [String(r.id), String(r.color)]));
const LEVEL = (SPELL_INDEX as unknown as { spells: Record<string, readonly [string, number]> }).spells;
export const SPELL_INFO: Readonly<Record<string, SpellInfo>> = Object.fromEntries(
  (SPELL_ROWS as readonly Row[]).filter((r) => r.id.startsWith('spell:'))
    .map((r) => [legendOf(r), { legend: r.boss_legend ?? r.boss_name ?? legendOf(r), family: r.boss ?? '', spell: r.name ?? '', school: r.school ?? '', color: SCHOOL_COLOR.get(r.school ?? '') ?? '', level: LEVEL[legendOf(r)]?.[1] ?? 0 }] as const),
);
