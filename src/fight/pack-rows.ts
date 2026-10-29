// pack.ts's named numbers as ROWS (Dom, "centralized game engine, no hard coding"; the debt entries in scripts/as-data/allow.json). One row per dial in pack-defs.json, manifest-loaded through
// the shared registry; this file only hands pack.ts the values it always held, bit for bit. Presentation only: not a sim file, not in the record digest.
import { loadRegistry } from '../core/registry.ts';
import { rowsOf, tableOf } from '../core/rows.ts';
import DEFS from './pack-defs.json' with { type: 'json' };
import MANIFEST from './pack-defs.manifest.json' with { type: 'json' };

const TABLE = tableOf(MANIFEST.tables[0], DEFS, 'pack-defs.json');
loadRegistry([TABLE]);
const ROWS = new Map(rowsOf<{ id: string; value: number }>(TABLE).map((r) => [r.id, r.value]));
const dial = (id: string): number => {
  const v = ROWS.get(id);
  if (v === undefined) throw Error(`pack-defs: no dial ${id}`);
  return v;
};
export const THREAT_MAX = dial('THREAT_MAX'), SWITCH_MELEE = dial('SWITCH_MELEE'), SWITCH_CASTER = dial('SWITCH_CASTER');
