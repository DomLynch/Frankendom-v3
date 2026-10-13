// What the spell book shows for a legend id: the legend's name, its family (the opponent kind it belongs to), the spell's name and school, read from the spell catalogue (spells-*.json, 700 rows).
// The catalogue is ~330 KB, so the page imports THIS file lazily (the spell book screen), never in the entry bundle. Keyed like boss-spells.ts: the row id without `spell:`.
import { SPELL_ROWS, legendOf, type CatalogueSpell } from './spell-legends.ts';
import type { SpellInfo } from '../core/grimoire-model.ts';
type Row = CatalogueSpell & { boss_name?: string; name?: string };   // the catalogue row (spell-legends.ts SPELL_ROWS, the one spell table) with the display fields the book shows
export const SPELL_INFO: Readonly<Record<string, SpellInfo>> = Object.fromEntries(
  (SPELL_ROWS as readonly Row[]).filter((r) => r.id.startsWith('spell:'))
    .map((r) => [legendOf(r), { legend: r.boss_legend ?? r.boss_name ?? legendOf(r), family: r.boss ?? '', spell: r.name ?? '', school: r.school ?? '' }] as const),
);
