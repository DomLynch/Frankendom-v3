// What the spell book shows for a legend id: the legend's name, its family (the opponent kind it belongs to), the spell's name and school, read from the spell catalogue (spells-*.json, 700 rows).
// The catalogue is ~330 KB, so the page imports THIS file lazily (the spell book screen), never in the entry bundle. Keyed like boss-spells.ts: the row id without `spell:`.
import ASH_FRONTIER from './spells-ash-frontier.json' with { type: 'json' };
import BLACK_SAND from './spells-black-sand.json' with { type: 'json' };
import JADE_REACH from './spells-jade-reach.json' with { type: 'json' };
import MARBLE_SHORE from './spells-marble-shore.json' with { type: 'json' };
import RED_HOLLOW from './spells-red-hollow.json' with { type: 'json' };
import SUN_COURT from './spells-sun-court.json' with { type: 'json' };
import THORN_STEPPE from './spells-thorn-steppe.json' with { type: 'json' };

import type { SpellInfo } from '../core/grimoire-model.ts';
type Row = { id: string; boss?: string; boss_name?: string; boss_legend?: string; name?: string; school?: string };
export const SPELL_INFO: Readonly<Record<string, SpellInfo>> = Object.fromEntries(
  ([ASH_FRONTIER, BLACK_SAND, JADE_REACH, MARBLE_SHORE, RED_HOLLOW, SUN_COURT, THORN_STEPPE] as unknown as { spells: Row[] }[])
    .flatMap((t) => t.spells).filter((r) => r.id.startsWith('spell:'))
    .map((r) => [r.id.slice('spell:'.length), { legend: r.boss_legend ?? r.boss_name ?? r.id.slice('spell:'.length), family: r.boss ?? '', spell: r.name ?? '', school: r.school ?? '' }] as const),
);
