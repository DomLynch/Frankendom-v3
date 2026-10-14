// duel.ts's named numbers as DUEL_ROW_MAP (Dom, "centralized game engine, no hard coding"; the debt entries in scripts/as-data/allow.json). One row per duelDial in duel-defs.json, manifest-loaded through
// the shared registry; this file only hands duel.ts the values it always held, bit for bit. Presentation only: not a sim file, not in the record digest.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import DUEL_DEFS from './duel-defs.json' with { type: 'json' };
import DUEL_MANIFEST from './duel-defs.manifest.json' with { type: 'json' };

const DUEL_TABLE = tableFromFile(DUEL_MANIFEST.tables[0] as unknown as Manifest, DUEL_DEFS, 'duel-defs.json');
loadRegistry([DUEL_TABLE]);
const DUEL_ROW_MAP = new Map((DUEL_TABLE.rows as unknown as { id: string; value: number }[]).map((r) => [r.id, r.value]));
const duelDial = (id: string): number => {
  const v = DUEL_ROW_MAP.get(id);
  if (v === undefined) throw Error(`duel-defs: no duelDial ${id}`);
  return v;
};
export const PERK_MAX = duelDial('PERK_MAX');
