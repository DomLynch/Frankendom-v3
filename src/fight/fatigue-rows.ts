// The fatigue driver's numbers as ROWS (Dom, "centralized game engine, no hard coding"; recce #2554 group B slice 5; the shape of level-anchor-rows.ts). The dials (the per-tick rates as tick counts, the
// winded / tired lines, the band hysteresis, the guard sink) and the per-body tunes (Goblin quick and shallow, Executioner slow and deep) live in fatigue-defs.json, manifest-loaded through the shared registry.
// This file only builds the values fatigue.ts and fatigue-tune.ts always exported, bit for bit: a rate is 1 / its tick count, the same double the literals gave. View layer: not in the record digest.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import FATIGUE_DEFS from './fatigue-defs.json' with { type: 'json' };
import FATIGUE_MANIFEST from './fatigue-defs.manifest.json' with { type: 'json' };

const DIALS = tableFromFile(FATIGUE_MANIFEST.tables[0] as unknown as Manifest, FATIGUE_DEFS, 'fatigue-defs.json');
const TUNES = tableFromFile(FATIGUE_MANIFEST.tables[1] as unknown as Manifest, FATIGUE_DEFS, 'fatigue-defs.json');
loadRegistry([DIALS, TUNES]);
const dial = (id: string): number => {
  const row = (DIALS.rows as unknown as { id: string; value: number }[]).find((r) => r.id === id);
  if (!row) throw Error(`fatigue-defs: no dial ${id}`);
  return row.value;
};
const perTick = (id: string): number => {
  const ticks = dial(id);
  if (!(ticks >= 1)) throw Error(`fatigue-defs: ${id} is a tick count of at least 1`);
  return 1 / ticks;
};
export const FATIGUE_FULL = dial('full');
export const FATIGUE_RISE = perTick('riseTicks'), FATIGUE_FALL = perTick('fallTicks'), FATIGUE_GAS_RISE = perTick('gasRiseTicks'), FATIGUE_GAS_FALL = perTick('gasFallTicks'), FATIGUE_SECOND = perTick('secondTicks');
export const FATIGUE_WINDED = dial('winded'), FATIGUE_TIRED = dial('tired'), FATIGUE_HYST = dial('hysteresis'), FATIGUE_GUARD_DROP = dial('guardDrop');
export type FatigueRowTune = { rate: number; depth: number; sag: number };   // the shape of fatigue-layer.ts's FatigueTune (render side), kept here so this sim-listed file imports nothing outside the sim
export const FATIGUE_TUNES: Record<string, FatigueRowTune> = Object.fromEntries((TUNES.rows as unknown as ({ id: string } & FatigueRowTune)[]).map((r) => [r.id, { rate: r.rate, depth: r.depth, sag: r.sag }]));
