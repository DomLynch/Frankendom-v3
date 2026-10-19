import DEFS from './sandbox-rules-defs.json' with { type: 'json' };

// The size of the chip pool (special-shards.ts), read from the same `specialShards` rows the sim-listed sandbox-rules.ts declares. A view helper in its own file so the sim digest does not move: the pool of each chip shape is every row's count,
// so every row can be mid-flight at once; no rows (shipped) = 0 and the scene builds no pool.
export const shardCapacity = (): number => (DEFS.specialShards as readonly { count: number }[]).reduce((sum, r) => sum + r.count, 0);
