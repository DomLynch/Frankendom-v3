// Resource pool DEFINITIONS (PURE DATA, on the data-only path like catalogue-data.ts; Combat, 2026-10-12, Dom: nothing is locked, 150+ games are being decoded and pools will grow).
// A pool is one row here: `id`, the `default` a character starts with when its row does not name it, `min` (and an optional `max`) a row's value must respect. A character row carries an optional
// map { poolId: value } (catalogue stats.pools); anything it does not name takes the default. Adding a pool (intelligence, rage, a new attribute) is ONE row below: no type to edit, no code, no schema.
// The sim reads `health` and `stamina` by name (the bars it has always had) and every other pool is carried as data until a rule reads it. `health`'s default is the man's RULES.health (moves.ts), pinned by a test.
const POOL_DEFS = [
  { id: "health", default: 150, min: 1 },
  { id: "stamina", default: 100, min: 1 },
  { id: "mana", default: 0, min: 0 },
  { id: "focus", default: 0, min: 0 },
] as const;
export default POOL_DEFS;
