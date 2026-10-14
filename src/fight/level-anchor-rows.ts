// The ladder levels the AI profile tiers are anchored at (novice L1, easy L6, normal L18, hard L46), as ROWS (Dom, "centralized game engine, no hard coding"; recce #2554 group B slice 4; the shape of
// rules.ts and special-set-rows.ts). The levels live in level-anchor-defs.json (manifest-loaded through the shared registry, never a hand list); this file only builds the record src/fight/moves.ts
// always exported as LEVEL_ANCHORS, key for key and in the same order. The tiers are the engine's four profile names (PROFILES), so the loader refuses a row set that is not exactly those four,
// climbing. A sim file: it imports only the shared row loader.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import ANCHOR_DEFS from './level-anchor-defs.json' with { type: 'json' };
import ANCHOR_MANIFEST from './level-anchor-defs.manifest.json' with { type: 'json' };

const LEVEL_ANCHOR_TABLE = tableFromFile(ANCHOR_MANIFEST.tables[0] as unknown as Manifest, ANCHOR_DEFS, 'level-anchor-defs.json');
loadRegistry([LEVEL_ANCHOR_TABLE]);
export type LevelAnchors = { readonly novice: number; readonly easy: number; readonly normal: number; readonly hard: number };
const ANCHOR_TIERS: readonly string[] = ['novice', 'easy', 'normal', 'hard'];
const ANCHOR_ROWS = LEVEL_ANCHOR_TABLE.rows as unknown as { id: string; level: number }[];
if (ANCHOR_ROWS.map((r) => r.id).join() !== ANCHOR_TIERS.join()) throw Error(`level-anchor-defs: exactly the tiers ${ANCHOR_TIERS.join(', ')}, in that order`);
if (ANCHOR_ROWS.some((r, i) => r.level < 1 || (i > 0 && r.level <= ANCHOR_ROWS[i - 1]!.level))) throw Error('level-anchor-defs: levels start at 1 and climb');
export const LEVEL_ANCHORS = Object.fromEntries(ANCHOR_ROWS.map((r) => [r.id, r.level])) as unknown as LevelAnchors;
