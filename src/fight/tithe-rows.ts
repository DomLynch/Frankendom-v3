// Blood Tithe's look and timing numbers as ROWS (Dom, "centralized game engine, no hard coding"; the debt entries in scripts/as-data/allow.json for special-tithe.ts). One row per dial in tithe-defs.json,
// manifest-loaded through the shared registry; this file only hands special-tithe.ts the values it always held, bit for bit. Presentation only: not a sim file, not in the record digest.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import TITHE_DEFS from './tithe-defs.json' with { type: 'json' };
import TITHE_MANIFEST from './tithe-defs.manifest.json' with { type: 'json' };

const TITHE_TABLE = tableFromFile(TITHE_MANIFEST.tables[0] as unknown as Manifest, TITHE_DEFS, 'tithe-defs.json');
loadRegistry([TITHE_TABLE]);
const ROWS = new Map((TITHE_TABLE.rows as unknown as { id: string; value: number }[]).map((r) => [r.id, r.value]));
const dial = (id: string): number => {
  const v = ROWS.get(id);
  if (v === undefined) throw Error(`tithe-defs: no dial ${id}`);
  return v;
};
export const DUST = dial('DUST'), MOTE_MAX = dial('MOTE_MAX'), CHARGE = dial('CHARGE'), BURST = dial('BURST'), BURST_LIFE = dial('BURST_LIFE'), BURST_ALPHA = dial('BURST_ALPHA'), BURST_SPREAD = dial('BURST_SPREAD');
export const CONE = dial('CONE'), SETTLE_FADE = dial('SETTLE_FADE'), LIGHT_PEAK = dial('LIGHT_PEAK'), LIGHT_FADE = dial('LIGHT_FADE'), RADIUS = dial('RADIUS'), RISE = dial('RISE'), KEEP_OFF = dial('KEEP_OFF');
export const ARM_OUT = dial('ARM_OUT'), ARM_EASE = dial('ARM_EASE'), AIM_HOLD = dial('AIM_HOLD');
