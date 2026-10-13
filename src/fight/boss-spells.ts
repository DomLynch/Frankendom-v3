// The spell each boss legend teaches: the spell catalogue's own rows (src/fight/spells-*.json, one row per legend, `bricks` {root, modifiers, suffix}), keyed by the LEGEND id = the row id
// without `spell:`. One place holds the data and the legend key (spell-legends.ts SPELL_ROWS / legendOf: the SAME key a kill's Provenance.legendId writes); a legend with no spell row teaches nothing. Not in the sim: it moves no fight.
import { SPELL_ROWS, legendOf } from './spell-legends.ts';

export type SpellBricks = { readonly root: string; readonly modifiers: readonly string[]; readonly suffix: string | null };

export const SPELL_BRICKS: Readonly<Record<string, SpellBricks>> = Object.fromEntries(
  SPELL_ROWS.filter((r) => r.id.startsWith('spell:')).map((r) => [legendOf(r), r.bricks] as const),
);
