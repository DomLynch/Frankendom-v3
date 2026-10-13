// The spell each boss legend teaches: the spell catalogue's own rows (src/fight/spells-*.json, one row per legend, `bricks` {root, modifiers, suffix}), keyed by the LEGEND id = the row id
// without `spell:`. One place holds the data; a legend with no spell row teaches nothing. Not in the sim: it moves no fight.
import ASH_FRONTIER from './spells-ash-frontier.json' with { type: 'json' };
import BLACK_SAND from './spells-black-sand.json' with { type: 'json' };
import JADE_REACH from './spells-jade-reach.json' with { type: 'json' };
import MARBLE_SHORE from './spells-marble-shore.json' with { type: 'json' };
import RED_HOLLOW from './spells-red-hollow.json' with { type: 'json' };
import SUN_COURT from './spells-sun-court.json' with { type: 'json' };
import THORN_STEPPE from './spells-thorn-steppe.json' with { type: 'json' };

export type SpellBricks = { readonly root: string; readonly modifiers: readonly string[]; readonly suffix: string | null };
type SpellRow = { id: string; school?: string; bricks: SpellBricks };

export const SPELL_BRICKS: Readonly<Record<string, SpellBricks>> = Object.fromEntries(
  ([ASH_FRONTIER, BLACK_SAND, JADE_REACH, MARBLE_SHORE, RED_HOLLOW, SUN_COURT, THORN_STEPPE] as { spells: SpellRow[] }[])
    .flatMap((t) => t.spells).filter((r) => r.id.startsWith('spell:')).map((r) => [r.id.slice('spell:'.length), r.bricks] as const),
);

// The school each legend's spell belongs to (the practice pool's skill id: fire, shadow, poison, holy, frost, earth, wind); a legend whose row names none is absent.
export const SPELL_SCHOOL: Readonly<Record<string, string>> = Object.fromEntries(
  ([ASH_FRONTIER, BLACK_SAND, JADE_REACH, MARBLE_SHORE, RED_HOLLOW, SUN_COURT, THORN_STEPPE] as { spells: SpellRow[] }[])
    .flatMap((t) => t.spells).filter((r) => r.id.startsWith('spell:') && typeof r.school === 'string').map((r) => [r.id.slice('spell:'.length), r.school!] as const),
);
