// moves-dials.ts's named numbers as ROWS (Dom, "centralized game engine, no hard coding"; the debt entries in scripts/as-data/allow.json). One row per dial in moves-dials-defs.json, manifest-loaded through
// the shared registry; this file only hands moves-dials.ts the values it always held, bit for bit. Presentation only: not a sim file, not in the record digest.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import DEFS from './moves-dials-defs.json' with { type: 'json' };
import MANIFEST from './moves-dials-defs.manifest.json' with { type: 'json' };

const TABLE = tableFromFile(MANIFEST.tables[0] as unknown as Manifest, DEFS, 'moves-dials-defs.json');
loadRegistry([TABLE]);
const ROWS = new Map((TABLE.rows as unknown as { id: string; value: number }[]).map((r) => [r.id, r.value]));
const dial = (id: string): number => {
  const v = ROWS.get(id);
  if (v === undefined) throw Error(`moves-dials-defs: no dial ${id}`);
  return v;
};
export const LEVELS = dial('LEVELS'), LATE_NOTICE_FROM = dial('LATE_NOTICE_FROM');
