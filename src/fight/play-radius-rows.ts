// play-radius.ts's named numbers as ROWS (Dom, "centralized game engine, no hard coding"; the debt entries in scripts/as-data/allow.json). One row per dial in play-radius-defs.json, manifest-loaded through
// the shared registry; this file only hands play-radius.ts the values it always held, bit for bit. Presentation only: not a sim file, not in the record digest.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import DEFS from './play-radius-defs.json' with { type: 'json' };
import MANIFEST from './play-radius-defs.manifest.json' with { type: 'json' };

const TABLE = tableFromFile(MANIFEST.tables[0] as unknown as Manifest, DEFS, 'play-radius-defs.json');
loadRegistry([TABLE]);
const ROWS = new Map((TABLE.rows as unknown as { id: string; value: number }[]).map((r) => [r.id, r.value]));
const dial = (id: string): number => {
  const v = ROWS.get(id);
  if (v === undefined) throw Error(`play-radius-defs: no dial ${id}`);
  return v;
};
export const OPEN_RADIUS = dial('OPEN_RADIUS'), WALL_INNER = dial('WALL_INNER'), BODY_RADIUS = dial('BODY_RADIUS'), BASE_RADIUS = dial('BASE_RADIUS'), ARENA_ONE_SCALE = dial('ARENA_ONE_SCALE');
