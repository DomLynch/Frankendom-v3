// mobkit.ts's named numbers as ROWS (Dom, "centralized game engine, no hard coding"; the debt entries in scripts/as-data/allow.json). One row per dial in mobkit-defs.json, manifest-loaded through
// the shared registry; this file only hands mobkit.ts the values it always held, bit for bit. Presentation only: not a sim file, not in the record digest.
import { loadRegistry } from '../core/registry.ts';
import { rowsOf, tableOf } from '../core/rows.ts';
import DEFS from './mobkit-defs.json' with { type: 'json' };
import MANIFEST from './mobkit-defs.manifest.json' with { type: 'json' };

const TABLE = tableOf(MANIFEST.tables[0], DEFS, 'mobkit-defs.json');
loadRegistry([TABLE]);
const ROWS = new Map(rowsOf<{ id: string; value: number }>(TABLE).map((r) => [r.id, r.value]));
const dial = (id: string): number => {
  const v = ROWS.get(id);
  if (v === undefined) throw Error(`mobkit-defs: no dial ${id}`);
  return v;
};
export const CHAIN_CAP = dial('CHAIN_CAP'), AFTER_HIT_TICKS = dial('AFTER_HIT_TICKS'), EXHAUSTED_BELOW = dial('EXHAUSTED_BELOW');
