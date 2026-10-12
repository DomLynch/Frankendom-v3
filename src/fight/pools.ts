// Resource pools as data (Combat, core, 2026-10-12): the bars a fighter starts a duel with come from the pool definitions (pool-defs.ts) and the character row's own { poolId: value } map, not from literals
// in the duel. There is NO union or switch over pool names here: a pool is whatever a definition row says it is. The sim reads `health` and `stamina` from the result (createFighter); every other pool is
// carried as data until a rule reads it, and the Fighter has no field for it (a new field would change hashed state). Every default equals what the duel always used, so a row without pools fights byte for byte as before.
import POOL_DEFS from './pool-defs.ts';

export type PoolValues = Readonly<Record<string, number>>;
export type PoolDef = { readonly id: string; readonly default: number; readonly min: number; readonly max?: number };
export const POOLS: readonly PoolDef[] = POOL_DEFS;
/** The pools a fighter starts with, one entry per definition: the row's own value, else the caller's `fallback` (the opponent row's health, the Pit man's RULES.health), else the definition's default. */
export const poolsOf = (fallback: PoolValues, own?: PoolValues, defs: readonly PoolDef[] = POOLS): Record<string, number> =>
  Object.fromEntries(defs.map((d) => [d.id, own?.[d.id] ?? fallback[d.id] ?? d.default]));
/** A row's pools that cannot be bars: an id with no definition, or a value that is not a finite number inside the definition's range. Empty = fine. */
export const poolProblems = (own: PoolValues | undefined, defs: readonly PoolDef[] = POOLS): string[] =>
  Object.entries(own ?? {}).flatMap(([id, v]) => {
    const d = defs.find((x) => x.id === id);
    if (!d) return [`${id}: no such pool (add a row to pool-defs.ts)`];
    return Number.isFinite(v) && v >= d.min && (d.max === undefined || v <= d.max) ? [] : [`${id}: ${v} is outside ${d.min}..${d.max ?? 'any'}`];
  });
