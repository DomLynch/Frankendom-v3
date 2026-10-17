// characters.ts's per-opponent label maps as ROWS (Dom, "always prioritise the data layer, no hard coding"; as-data check (c), scripts/as-data/map-baseline.json): which loot-palette materials each rig maps (`mapped`,
// was SOURCE_MAPPED) and how each opponent leans out of the player's way while holding a charged swing (`lean`, was CHARGE_LEAN + LEAN_OUT/LOW/HIGH). One row per opponent in character-looks-defs.json, manifest-loaded
// through the shared registry; this file hands characters.ts the values it always held, bit for bit, in the same order. Presentation only: not a sim file, not in the record digest.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import DEFS from './character-looks-defs.json' with { type: 'json' };
import MANIFEST from './character-looks-defs.manifest.json' with { type: 'json' };

export type ChargeLean = { yaw: number; side: number; chest: number; arm: number; lift?: number };   // lift: upperarm_r pitch, negative raises the arm
const TABLES = MANIFEST.tables.map((t) => tableFromFile(t as unknown as Manifest, DEFS, 'character-looks-defs.json'));
loadRegistry(TABLES);
const rows = <T>(table: string): T[] => TABLES.find((t) => t.name === table)!.rows as unknown as T[];

/** Each rig's mapped loot-palette material names, by opponent id. */
export const MAPPED_PALETTE: Readonly<Record<string, readonly string[]>> = Object.fromEntries(rows<{ id: string; names: string[] }>('mappedpalette').map((r) => [r.id, r.names]));
/** Each opponent's charged-swing lean, by opponent id. */
export const CHARGE_LEANS: Readonly<Record<string, ChargeLean>> = Object.fromEntries(rows<{ id: string } & ChargeLean>('chargelean').map(({ id, yaw, side, chest, arm, lift }) => [id, { yaw, side, chest, arm, ...(lift !== undefined ? { lift } : {}) }]));
