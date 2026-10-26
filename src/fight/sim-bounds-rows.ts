// The sim's inline caps as rows (Dom, 2026-10-13: every game number lives in a data row; the sim-digest batch of 2026-10-17). Each value is byte-identical to the literal it replaced, so a replay of any record
// is unchanged. A sim file (the digest hashes it and its rows). Read once into a module const by each user, never inside a per-tick loop.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import BOUNDS from './sim-bounds-defs.json' with { type: 'json' };
import BOUNDS_MANIFEST from './sim-bounds-defs.manifest.json' with { type: 'json' };

const BOUNDS_TABLE = tableFromFile(BOUNDS_MANIFEST.tables[0] as unknown as Manifest, BOUNDS, 'sim-bounds-defs.json');
loadRegistry([BOUNDS_TABLE]);
const BOUND_VALUES = new Map((BOUNDS_TABLE.rows as unknown as { id: string; value: number }[]).map((r) => [r.id, r.value]));

/** The value of a sim bound row; a missing id throws at load rather than answering NaN. */
export function simBound(id: string): number {
  const v = BOUND_VALUES.get(id);
  if (v === undefined) throw new Error(`sim-bounds-defs.json has no row "${id}"`);
  return v;
}
