// moves-dials.ts's named numbers as MOVES_DIALS_ROW_MAP (Dom, "centralized game engine, no hard coding"; the debt entries in scripts/as-data/allow.json). One row per movesDialsDial in moves-dials-defs.json, manifest-loaded through
// the shared registry; this file only hands moves-dials.ts the values it always held, bit for bit. Presentation only: not a sim file, not in the record digest.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import MOVES_DIALS_DEFS from './moves-dials-defs.json' with { type: 'json' };
import MOVES_DIALS_MANIFEST from './moves-dials-defs.manifest.json' with { type: 'json' };

const MOVES_DIALS_TABLE = tableFromFile(MOVES_DIALS_MANIFEST.tables[0] as unknown as Manifest, MOVES_DIALS_DEFS, 'moves-dials-defs.json');
loadRegistry([MOVES_DIALS_TABLE]);
const MOVES_DIALS_ROW_MAP = new Map((MOVES_DIALS_TABLE.rows as unknown as { id: string; value: number }[]).map((r) => [r.id, r.value]));
const movesDialsDial = (id: string): number => {
  const v = MOVES_DIALS_ROW_MAP.get(id);
  if (v === undefined) throw Error(`moves-dials-defs: no movesDialsDial ${id}`);
  return v;
};
export const LEVELS = movesDialsDial('LEVELS'), LATE_NOTICE_FROM = movesDialsDial('LATE_NOTICE_FROM');
