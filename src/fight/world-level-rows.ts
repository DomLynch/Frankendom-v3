// A creature's open-world numbers at one level, as ROWS (Combat, RV89 / Zone 2; Dom, "centralized game engine, no hard coding"; Lead's ruling: a Zone fairness fix is per-level rows that leave the Pit alone). The archetype row is shared with the
// Pit's ladder (the Pit's "the Goblin" at every level), so a global change moves the Pit; a world level row changes the open world's creature only: moves.ts worldOpponentAt / worldProfileAt read it, the Pit's opponentAt / profileAt never do.
// One row per (opponent, level) in world-level-defs.json (manifest-loaded through the shared registry), with two optional fields:
//   `health`        the archetype health the creature has AT that level, before the novice body blend (a row of 45 at level 1 fights like an archetype of 45 would);
//   `profileLevel`  the ladder level its BRAIN (AI profile, moves.ts profileAt) is built at, while its displayed level, loot and XP stay the mob's own: a Zone 2 creature shown at level 2 that reads and answers like a level-8 one.
// Windups, windows and recoveries are never touched (timing is sacred): a profile moves who reads and answers, so the visible tells fire unchanged. A sim file: it imports only the shared row loader.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import WORLD_LEVEL_DEFS from './world-level-defs.json' with { type: 'json' };
import WORLD_LEVEL_MANIFEST from './world-level-defs.manifest.json' with { type: 'json' };

const WORLD_LEVEL_TABLE = tableFromFile(WORLD_LEVEL_MANIFEST.tables[0] as unknown as Manifest, WORLD_LEVEL_DEFS, 'world-level-defs.json');
loadRegistry([WORLD_LEVEL_TABLE]);
type WorldLevelRow = { id: string; opponent: string; level: number; health?: number; profileLevel?: number };
const ROWS = WORLD_LEVEL_TABLE.rows as unknown as WorldLevelRow[];
for (const r of ROWS) {
  if (r.id !== `${r.opponent}:${r.level}` || !Number.isInteger(r.level) || r.level < 1) throw Error(`world-level-defs: ${r.id} must be "<opponent>:<level>" with a whole level of at least 1`);
  if (r.health === undefined && r.profileLevel === undefined) throw Error(`world-level-defs: ${r.id} sets neither health nor profileLevel`);
  if (r.health !== undefined && !(r.health >= 1)) throw Error(`world-level-defs: ${r.id} health must be at least 1`);
  if (r.profileLevel !== undefined && !(Number.isInteger(r.profileLevel) && r.profileLevel >= 1)) throw Error(`world-level-defs: ${r.id} profileLevel must be a whole level of at least 1`);
}
const BY_ID = new Map(ROWS.map((r) => [r.id, r]));
/** The archetype health an open-world creature of `opponent` has at `level`, or undefined when the Pit's own row applies. */
export const worldLevelHealth = (opponent: string, level: number): number | undefined => BY_ID.get(`${opponent}:${level}`)?.health;
/** The ladder level an open-world creature of `opponent` at `level` builds its brain at, or undefined when its own level applies. */
export const worldProfileLevel = (opponent: string, level: number): number | undefined => BY_ID.get(`${opponent}:${level}`)?.profileLevel;
