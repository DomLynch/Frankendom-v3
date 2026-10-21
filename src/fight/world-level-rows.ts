// A creature's health at one open-world level, as ROWS (Combat, RV89; Dom, "centralized game engine, no hard coding"; Lead's ruling: the Zone 1 goblin fix is per-level rows that leave the Pit alone). The archetype row is shared with the
// Pit's ladder (the Pit's "the Goblin" at every level), so a global health change moves the Pit; a world level row changes the open world's creature only: moves.ts worldOpponentAt reads it, the Pit's opponentAt never does.
// The rows live in world-level-defs.json (manifest-loaded through the shared registry): `health` is the archetype health the creature has AT that level, before the novice body blend (the same number the archetype's
// `health` is, so a row of 45 at level 1 fights like an archetype of 45 would). A sim file: it imports only the shared row loader.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import WORLD_LEVEL_DEFS from './world-level-defs.json' with { type: 'json' };
import WORLD_LEVEL_MANIFEST from './world-level-defs.manifest.json' with { type: 'json' };

const WORLD_LEVEL_TABLE = tableFromFile(WORLD_LEVEL_MANIFEST.tables[0] as unknown as Manifest, WORLD_LEVEL_DEFS, 'world-level-defs.json');
loadRegistry([WORLD_LEVEL_TABLE]);
const ROWS = WORLD_LEVEL_TABLE.rows as unknown as { id: string; opponent: string; level: number; health: number }[];
for (const r of ROWS) if (r.id !== `${r.opponent}:${r.level}` || r.level < 1 || r.health < 1) throw Error(`world-level-defs: ${r.id} must be "<opponent>:<level>" with a level and a health of at least 1`);
/** The archetype health an open-world creature of `opponent` has at `level`, or undefined when the Pit's own row applies. */
const HEALTH = new Map(ROWS.map((r) => [r.id, r.health]));
export const worldLevelHealth = (opponent: string, level: number): number | undefined => HEALTH.get(`${opponent}:${level}`);
