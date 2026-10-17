// The sheet eras (Combat, group B, Lead 2026-10-13; leathers era 2026-10-17). A fight that carries a sheet is stamped no lower than the newest change to how a worn set resolves to dials, so the version on a sheet record says
// which sheet rules it was fought with, and a record below it recomputes its expected sheet with the rules of its own version: (1) FIRST_CAST_PENALTY_VERSION: from the version a weight class's row names (armour-weights.json
// `fromRecordVersion`) a worn heavy set takes its castPenalty off the sheet's spellPower (gear-rows.ts gearDeltas); (2) SHEET_ERA_VERSION: the newest set era (gear-defs.json sets `eras`), from which a set has that era's shape.
// A record below an era still verifies against the rules it was fought with. The versions are the rows' numbers, not literals here. FIRST_CAST_PENALTY_VERSION stays a version a record can be written at (record.ts allow-list);
// SHEET_ERA_VERSION is the floor a NEW sheet fight is stamped at.
// A leaf of the simulation: it imports only the data rows.
import WEIGHT_ROWS from './armour-weights.json' with { type: 'json' };
import GEAR_ROWS from './gear-defs.json' with { type: 'json' };
export const FIRST_CAST_PENALTY_VERSION: number = Math.min(...WEIGHT_ROWS.armourWeight.map((w) => w.fromRecordVersion));
export const SHEET_ERA_VERSION: number = Math.max(
  FIRST_CAST_PENALTY_VERSION,
  ...GEAR_ROWS.sets.flatMap((s) => ('eras' in s ? (s.eras as readonly { fromRecordVersion: number }[]).map((e) => e.fromRecordVersion) : [])),
);
