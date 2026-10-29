import { loadRegistry } from './registry.ts';
import { rowsOf, tableOf } from '../rows.ts';
import FINISH_ROWS_MANIFEST from './finish-rows.manifest.json' with { type: 'json' };
import FINISH_ROWS from './finish-rows.json' with { type: 'json' };
import type { Finish } from './grades.ts';

// Named material finishes that are not a career rung (Dom's data-layer rule 2026-10-13): `rust` is a ground sword's dull brown-orange iron (ground-loot brief,
// Backend #2775). Pure data like GRADES: factors only, never a mesh. `finishedAs` (src/fight/rank-tint.ts) writes one onto a piece's own metal material.
const TABLE = tableOf(FINISH_ROWS_MANIFEST.tables[0], FINISH_ROWS, 'finish-rows.json');
loadRegistry([TABLE]);
const FINISHES = new Map(rowsOf<{ id: string; fields: Finish }>(TABLE).map((r) => [r.id, r.fields]));

/** The finish a row names; a missing id throws at load rather than answering a default. */
export function finishRow(id: string): Finish {
  const f = FINISHES.get(id);
  if (!f) throw new Error(`finish-rows.json has no row "${id}"`);
  return f;
}
