// characters-dials.ts's named numbers as ROWS (Dom, "centralized game engine, no hard coding"; the debt entries in scripts/as-data/allow.json). One row per dial in characters-dials-defs.json, manifest-loaded through
// the shared registry; this file only hands characters-dials.ts the values it always held, bit for bit. Presentation only: not a sim file, not in the record digest.
import { loadRegistry } from '../core/registry.ts';
import { rowsOf, tableOf } from '../rows.ts';
import DEFS from './characters-dials-defs.json' with { type: 'json' };
import MANIFEST from './characters-dials-defs.manifest.json' with { type: 'json' };

const TABLE = tableOf(MANIFEST.tables[0], DEFS, 'characters-dials-defs.json');
loadRegistry([TABLE]);
const ROWS = new Map(rowsOf<{ id: string; value: number }>(TABLE).map((r) => [r.id, r.value]));
const dial = (id: string): number => {
  const v = ROWS.get(id);
  if (v === undefined) throw Error(`characters-dials-defs: no dial ${id}`);
  return v;
};
export const DEFLECT_FROM = dial('DEFLECT_FROM');
