// Which named specials an opponent casts, and at which ladder levels, as ROWS (Dom, "centralized game engine, no hard coding"; recce #2554 group B slice 3; the shape of rules.ts and move-rows.ts).
// The ids live in special-set-defs.json (manifest-loaded through the shared registry, never a hand list): one `sets` row per opponent naming its specials in rank order, and the `ranks` rows giving the
// ladder level each rank begins at (career.ts: five levels a rank, so ranks 8 / 9 / 10 begin at 36 / 41 / 46). This file only builds the record src/fight/moves.ts always exported as SPECIAL_SETS, key for key
// and in the same order. Identity only: windup, share, cooldown and the unblockable release are RULES.special for every special. The notes that sat beside the old literal are in docs/specs/combat/special-set-notes.md.
// A sim file: it imports only the shared row loader.
import { loadRegistry } from '../core/registry.ts';
import { rowsOf, tableOf } from '../rows.ts';
import SET_DEFS from './special-set-defs.json' with { type: 'json' };
import SET_MANIFEST from './special-set-defs.manifest.json' with { type: 'json' };

const SPECIAL_SET_TABLE = tableOf(SET_MANIFEST.tables[0], SET_DEFS, 'special-set-defs.json');
const SPECIAL_RANK_TABLE = tableOf(SET_MANIFEST.tables[1], SET_DEFS, 'special-set-defs.json');
loadRegistry([SPECIAL_SET_TABLE, SPECIAL_RANK_TABLE]);
/** The ladder level each rank begins at, in rank order (ascending: the loader refuses anything else). */
export const SPECIAL_RANK_LEVELS: readonly number[] = rowsOf<{ id: string; level: number }>(SPECIAL_RANK_TABLE).map((r, i, all) => {
  if (r.level < 1 || (i > 0 && r.level <= all[i - 1]!.level)) throw Error(`special-set-defs rank "${r.id}": levels start at 1 and climb`);
  return r.level;
});
const SET_ROWS = rowsOf<{ id: string; specials: string[]; from?: number }>(SPECIAL_SET_TABLE);
/** Opponent id -> its specials in rank order, one per rank. */
export const SPECIAL_SETS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(SET_ROWS.map((r) => {
  if (r.specials.length !== SPECIAL_RANK_LEVELS.length || r.specials.some((s) => typeof s !== 'string' || !s)) throw Error(`special-set-defs set "${r.id}": one special id per rank (${SPECIAL_RANK_LEVELS.length})`);
  return [r.id, r.specials];
}));
/** Opponent id -> the level its named specials begin at, only for a set whose row says `from` (a creature boss below the ladder's rank 8, e.g. the Cave Troll); absent = the first rank level, as every ladder opponent. */
export const SPECIAL_FROM: Readonly<Record<string, number>> = Object.fromEntries(SET_ROWS.filter((r) => r.from !== undefined).map((r) => [r.id, r.from!]));
/** The level an opponent's named specials begin at. */
export const specialStartOf = (opponent: string): number => (Object.hasOwn(SPECIAL_FROM, opponent) ? SPECIAL_FROM[opponent]! : SPECIAL_RANK_LEVELS[0]!);
