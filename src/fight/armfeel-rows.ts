// The Armfeel look test's numbers as ROWS (Dom, "centralized game engine, no hard coding"; the debt entries in scripts/as-data/allow). The handoff's feel numbers (the victim's lean / nudge / decay / hold, the
// Low energy, the weapon's hit hold by tier) and the spark gravity live in armfeel-defs.json, manifest-loaded through the shared registry; armfeel.ts re-exports them under the names it always had.
// Presentation only: nothing here is read by the simulation.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import ARMFEEL_DEFS from './armfeel-defs.json' with { type: 'json' };
import ARMFEEL_MANIFEST from './armfeel-defs.manifest.json' with { type: 'json' };

const ARMFEEL_TABLE = tableFromFile(ARMFEEL_MANIFEST.tables[0] as unknown as Manifest, ARMFEEL_DEFS, 'armfeel-defs.json');
loadRegistry([ARMFEEL_TABLE]);
const ARMFEEL_ROW_MAP = new Map((ARMFEEL_TABLE.rows as unknown as { id: string; value: number }[]).map((r) => [r.id, r.value]));
const armfeelDial = (id: string): number => {
  const v = ARMFEEL_ROW_MAP.get(id);
  if (v === undefined) throw Error(`armfeel-defs: no dial ${id}`);
  return v;
};
export const ARMFEEL = {
  lean: armfeelDial('lean'), leanKill: armfeelDial('leanKill'),
  nudge: armfeelDial('nudge'),
  decay: armfeelDial('decay'), decayKill: armfeelDial('decayKill'),
  hold: armfeelDial('hold'), holdKill: armfeelDial('holdKill'),
  lowEnergy: armfeelDial('lowEnergy'),
  weaponHoldMs: { half: armfeelDial('weaponHoldHalf'), full: armfeelDial('weaponHoldFull'), kill: armfeelDial('weaponHoldKill') },
} as const;
export const GRAVITY = armfeelDial('gravity');
