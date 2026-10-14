// play-radius.ts's named numbers as PLAY_RADIUS_ROW_MAP (Dom, "centralized game engine, no hard coding"; the debt entries in scripts/as-data/allow.json). One row per playRadiusDial in play-radius-defs.json, manifest-loaded through
// the shared registry; this file only hands play-radius.ts the values it always held, bit for bit. Presentation only: not a sim file, not in the record digest.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import PLAY_RADIUS_DEFS from './play-radius-defs.json' with { type: 'json' };
import PLAY_RADIUS_MANIFEST from './play-radius-defs.manifest.json' with { type: 'json' };

const PLAY_RADIUS_TABLE = tableFromFile(PLAY_RADIUS_MANIFEST.tables[0] as unknown as Manifest, PLAY_RADIUS_DEFS, 'play-radius-defs.json');
loadRegistry([PLAY_RADIUS_TABLE]);
const PLAY_RADIUS_ROW_MAP = new Map((PLAY_RADIUS_TABLE.rows as unknown as { id: string; value: number }[]).map((r) => [r.id, r.value]));
const playRadiusDial = (id: string): number => {
  const v = PLAY_RADIUS_ROW_MAP.get(id);
  if (v === undefined) throw Error(`play-radius-defs: no playRadiusDial ${id}`);
  return v;
};
export const OPEN_RADIUS = playRadiusDial('OPEN_RADIUS'), WALL_INNER = playRadiusDial('WALL_INNER'), BODY_RADIUS = playRadiusDial('BODY_RADIUS'), BASE_RADIUS = playRadiusDial('BASE_RADIUS'), ARENA_ONE_SCALE = playRadiusDial('ARENA_ONE_SCALE');
