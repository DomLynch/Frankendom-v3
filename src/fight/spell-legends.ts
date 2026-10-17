import { catalogueRow } from './catalogue-rows.ts';
import ASH_FRONTIER from './spells-ash-frontier.json' with { type: 'json' };
import BLACK_SAND from './spells-black-sand.json' with { type: 'json' };
import JADE_REACH from './spells-jade-reach.json' with { type: 'json' };
import MARBLE_SHORE from './spells-marble-shore.json' with { type: 'json' };
import RED_HOLLOW from './spells-red-hollow.json' with { type: 'json' };
import SUN_COURT from './spells-sun-court.json' with { type: 'json' };
import THORN_STEPPE from './spells-thorn-steppe.json' with { type: 'json' };
import { fxNum } from './fx-rows.ts';
const CLAMP_10 = fxNum('clamp.spell-legends.10');

// The ONE legend key (Lead 2026-10-13): a legend is its spell row's id without `spell:` ("alvis"), the key Backend's grimoire grants by. A kill's Provenance.legendId writes exactly that.
// The spell catalogue (src/fight/spells-<region>.json, 700 rows) is the only spell table; a row names its boss (a catalogue row id) and, for a boss with ranks, the rank legend (`boss_legend`).
export type CatalogueSpell = { id: string; name?: string; boss: string; boss_legend?: string; school: string; bricks: { root: string; modifiers: readonly string[]; suffix: string | null } };
export const SPELL_ROWS: readonly CatalogueSpell[] = ([ASH_FRONTIER, BLACK_SAND, JADE_REACH, MARBLE_SHORE, RED_HOLLOW, SUN_COURT, THORN_STEPPE] as { spells: CatalogueSpell[] }[]).flatMap((t) => t.spells);
export const legendOf = (row: CatalogueSpell): string => row.id.slice('spell:'.length);
export const SPELL_OF_LEGEND: Readonly<Record<string, CatalogueSpell>> = Object.fromEntries(SPELL_ROWS.map((r) => [legendOf(r), r]));
// The legend a fight against `opponent` at rung 1..10 fights: a ranked boss's rank name resolved through its catalogue row (ranks[].name = a spell's boss_legend); a boss with no ranks is
// its own legend. A pair the catalogue has no spell for is no legend (undefined): nothing is built from a string.
export function legendIdFor(opponent: string, rung: number): string | undefined {
  const row = catalogueRow(opponent);
  if (!row) return undefined;
  const name = row.ranks.length ? row.ranks[Math.min(CLAMP_10, Math.max(1, Math.floor(rung))) - 1]?.name : undefined;
  const hit = SPELL_ROWS.find((s) => s.boss === opponent && (row.ranks.length ? s.boss_legend === name : s.boss_legend === undefined));
  return hit && legendOf(hit);
}
