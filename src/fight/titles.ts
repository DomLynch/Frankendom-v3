// Fame x karma titles as data (top-30 item 13). A title row is one cell of a grid: the fame band (fameFloor) and the karma band (karmaFloor) it starts at.
// Cosmetic prestige, never points. The scale (UO's 0..15000 fame, -15000..15000 karma) and the band edges are the rows' numbers, not code; Backend owns the live fame/karma values.
// Design from ModernUO's Titles.cs (a fame band, then a karma band inside it); the epithets are ours, each drawn from myth, chronicle or literature (legends-rule).
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import TITLES from './title-rows.json' with { type: 'json' };
import MANIFEST from './title-rows.manifest.json' with { type: 'json' };

export type TitleRow = { id: string; fameFloor: number; karmaFloor: number; text: string; source: string };

const TABLE = tableFromFile((MANIFEST.tables as unknown as Manifest[])[0]!, TITLES, 'title-rows.json');
loadRegistry([TABLE]);
export const TITLE_ROWS: readonly TitleRow[] = TITLES.titles;

// The row for (fame, karma): the highest fame band at or below `fame`, then the highest karma band at or below `karma` inside it; a karma under every floor takes the lowest band.
export function titleRowFor(fame: number, karma: number, rows: readonly TitleRow[] = TITLE_ROWS): TitleRow | null {
  const fameBands = [...new Set(rows.map((r) => r.fameFloor))].sort((a, b) => a - b);
  const band = [...fameBands].reverse().find((f) => f <= fame) ?? fameBands[0];
  if (band === undefined) return null;
  const cells = rows.filter((r) => r.fameFloor === band).sort((a, b) => a.karmaFloor - b.karmaFloor);
  return [...cells].reverse().find((r) => r.karmaFloor <= karma) ?? cells[0] ?? null;
}
export const titleFor = (fame: number, karma: number): string => titleRowFor(fame, karma)?.text ?? '';
