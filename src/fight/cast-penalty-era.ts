// The cast penalty's ERA (Combat, group B, Lead 2026-10-13). From the record version a weight class's row names (armour-weights.json `fromRecordVersion`) a worn heavy set takes its castPenalty off the
// sheet's spellPower (gear-rows.ts gearDeltas); a record below it recomputes its expected sheet WITHOUT the penalty, so every older heavy-armour link still verifies. A fight that carries a sheet is
// stamped no lower than this (record.ts createRecorder), so the version on a sheet record says whether its sheet had the penalty. The version is the row's number, not a literal here.
// A leaf of the simulation: it imports only the data row.
import WEIGHT_ROWS from './armour-weights.json' with { type: 'json' };
export const FIRST_CAST_PENALTY_VERSION: number = Math.min(...WEIGHT_ROWS.armourWeight.map((w) => w.fromRecordVersion));
