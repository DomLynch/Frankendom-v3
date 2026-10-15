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
// The literals that sat in duel.ts, same values (sim batch C: rows with identical numbers, no fight moves). PER_MILLE: the perk scale; FULL_TURN / LORARIUS_SECTORS: a turn is PI x FULL_TURN, cut into PI / LORARIUS_SECTORS
// sectors (the lorarii's wall); BODY_SPACING: the minimum centre gap between fighters; MOVE_EPSILON: the walk magnitude that counts as moving; GAP_EPSILON: a gap below it has no direction; the three halves
// (push split, roll window, rear arc) are divisors, kept as rows so the arithmetic is the arithmetic it always was.
export const PER_MILLE = duelDial('PER_MILLE'), MAX_PERK_TEMPLATES = duelDial('MAX_PERK_TEMPLATES'), FULL_TURN = duelDial('FULL_TURN'), LORARIUS_SECTORS = duelDial('LORARIUS_SECTORS');
export const BODY_SPACING = duelDial('BODY_SPACING'), MOVE_EPSILON = duelDial('MOVE_EPSILON'), GAP_EPSILON = duelDial('GAP_EPSILON'), PUSH_SPLIT = duelDial('PUSH_SPLIT'), ROLL_HALF = duelDial('ROLL_HALF'), ARC_HALF = duelDial('ARC_HALF');
