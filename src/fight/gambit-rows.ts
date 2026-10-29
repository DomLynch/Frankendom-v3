// gambit.ts's named numbers as GAMBIT_ROW_MAP (Dom, "centralized game engine, no hard coding"; the debt entries in scripts/as-data/allow.json). One row per gambitDial in gambit-defs.json, manifest-loaded through
// the shared registry; this file only hands gambit.ts the values it always held, bit for bit. Presentation only: not a sim file, not in the record digest.
import { loadRegistry } from '../core/registry.ts';
import { rowsOf, tableOf } from '../core/rows.ts';
import GAMBIT_DEFS from './gambit-defs.json' with { type: 'json' };
import GAMBIT_MANIFEST from './gambit-defs.manifest.json' with { type: 'json' };

const GAMBIT_TABLE = tableOf(GAMBIT_MANIFEST.tables[0], GAMBIT_DEFS, 'gambit-defs.json');
loadRegistry([GAMBIT_TABLE]);
const GAMBIT_ROW_MAP = new Map(rowsOf<{ id: string; value: number }>(GAMBIT_TABLE).map((r) => [r.id, r.value]));
const gambitDial = (id: string): number => {
  const v = GAMBIT_ROW_MAP.get(id);
  if (v === undefined) throw Error(`gambit-defs: no gambitDial ${id}`);
  return v;
};
export const GAMBIT_KILL_FLOOR = gambitDial('GAMBIT_KILL_FLOOR');
