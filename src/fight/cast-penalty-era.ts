// The sheet era (Combat, group B, Lead 2026-10-13; leathers era 2026-10-17). A fight that carries a sheet is stamped no lower than the newest change to how a worn set resolves to dials, so the version on
// a sheet record says which sheet rules it was fought with, and a record below it recomputes its expected sheet with the rules of its own version: (1) from the version a weight class's row names
// (armour-weights.json `fromRecordVersion`) a worn heavy set takes its castPenalty off the sheet's spellPower (gear-rows.ts gearDeltas), (2) from a set era's version (gear-defs.json sets `eras`) the set
// has that era's shape. So every older heavy-armour and goblin-set link still verifies. The version is the row's number, not a literal here.
// A leaf of the simulation: it imports only the data rows.
import WEIGHT_ROWS from './armour-weights.json' with { type: 'json' };
import GEAR_ROWS from './gear-defs.json' with { type: 'json' };
export const FIRST_CAST_PENALTY_VERSION: number = Math.max(
  Math.min(...WEIGHT_ROWS.armourWeight.map((w) => w.fromRecordVersion)),
  ...GEAR_ROWS.sets.flatMap((s) => ('eras' in s ? (s.eras as readonly { fromRecordVersion: number }[]).map((e) => e.fromRecordVersion) : [])),
);
