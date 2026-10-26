// The engine's move verbs and baked-blade path specs, as ROWS (Dom, "centralized game engine, no hard coding"; recce #2554 group B slice 2; the shape of rules.ts and AzerothCore's
// spell_dbc: one row per move, the engine reads the table). The numbers live in move-defs.json (manifest-loaded through the shared registry, never a hand list); this file only builds
// the two records src/fight/moves.ts always exported as MOVES and PATHS, key for key and in the same key order, so every consumer (weapons.ts merges its rows over these) reads exactly
// what it read. A move row is the resolved MoveDef, one line each: the old `light()` / `skill()` helpers and the four timing rows are gone, their values are in the rows.
// The notes that sat beside the old literal (why each number is what it is, which ruling set it) are kept in docs/specs/combat/move-notes.md.
// A sim file: it imports only the shared row loader and the types of moves.ts, so moves.ts can import it without a cycle.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import type { MoveDef, MoveId, PathId, PathSpec } from './moves.ts';
import MOVE_DEFS from './move-defs.json' with { type: 'json' };
import MOVE_MANIFEST from './move-defs.manifest.json' with { type: 'json' };

const MOVE_TABLE = tableFromFile(MOVE_MANIFEST.tables[0] as unknown as Manifest, MOVE_DEFS, 'move-defs.json');
const PATH_TABLE = tableFromFile(MOVE_MANIFEST.tables[1] as unknown as Manifest, MOVE_DEFS, 'move-defs.json');
loadRegistry([MOVE_TABLE, PATH_TABLE]);
const MOVE_DIRECTIONS: readonly string[] = ['right', 'left', 'overhead', 'thrust', 'low'];
const checkMove = (m: MoveDef): MoveDef => {
  if (!MOVE_DIRECTIONS.includes(m.direction)) throw Error(`move-defs "${m.id}": direction ${m.direction} is not one of ${MOVE_DIRECTIONS.join(', ')}`);
  if (m.windup < 0 || m.active < 1 || m.recovery < 0) throw Error(`move-defs "${m.id}": windup and recovery from 0, active from 1`);
  return m;
};
export const MOVES: Record<MoveId, MoveDef> = Object.fromEntries((MOVE_TABLE.rows as unknown as MoveDef[]).map((m) => [m.id, checkMove(m)])) as Record<MoveId, MoveDef>;
export const PATHS: Record<PathId, PathSpec> = Object.fromEntries((PATH_TABLE.rows as unknown as (PathSpec & { id: string })[]).map(({ id, ...spec }) => [id, spec])) as Record<PathId, PathSpec>;
