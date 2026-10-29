// roll.ts's named numbers as ROLL_ROW_MAP (Dom, "centralized game engine, no hard coding"; the debt entries in scripts/as-data/allow.json). One row per rollDial in roll-defs.json, manifest-loaded through
// the shared registry; this file only hands roll.ts the values it always held, bit for bit. Presentation only: not a sim file, not in the record digest.
import { loadRegistry } from '../core/registry.ts';
import { rowsOf, tableOf } from '../rows.ts';
import ROLL_DEFS from './roll-defs.json' with { type: 'json' };
import ROLL_MANIFEST from './roll-defs.manifest.json' with { type: 'json' };

const ROLL_TABLE = tableOf(ROLL_MANIFEST.tables[0], ROLL_DEFS, 'roll-defs.json');
loadRegistry([ROLL_TABLE]);
const ROLL_ROW_MAP = new Map(rowsOf<{ id: string; value: number }>(ROLL_TABLE).map((r) => [r.id, r.value]));
const rollDial = (id: string): number => {
  const v = ROLL_ROW_MAP.get(id);
  if (v === undefined) throw Error(`roll-defs: no rollDial ${id}`);
  return v;
};
export const ROLL_BAND = rollDial('ROLL_BAND');
