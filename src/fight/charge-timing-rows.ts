// charge-timing.ts's named numbers as ROWS (Dom, "centralized game engine, no hard coding"; the debt entries in scripts/as-data/allow.json). One row per dial in charge-timing-defs.json, manifest-loaded through
// the shared registry; this file only hands charge-timing.ts the values it always held, bit for bit. Presentation only: not a sim file, not in the record digest.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import DEFS from './charge-timing-defs.json' with { type: 'json' };
import MANIFEST from './charge-timing-defs.manifest.json' with { type: 'json' };

const TABLE = tableFromFile(MANIFEST.tables[0] as unknown as Manifest, DEFS, 'charge-timing-defs.json');
loadRegistry([TABLE]);
const ROWS = new Map((TABLE.rows as unknown as { id: string; value: number }[]).map((r) => [r.id, r.value]));
const dial = (id: string): number => {
  const v = ROWS.get(id);
  if (v === undefined) throw Error(`charge-timing-defs: no dial ${id}`);
  return v;
};
export const RACE = dial('RACE'), DISSOLVE = dial('DISSOLVE'), CUE_LEAD = dial('CUE_LEAD'), GATHER = dial('GATHER'), RIDE = dial('RIDE'), BACK_PACE = dial('BACK_PACE'), RUN_PACE = dial('RUN_PACE');
