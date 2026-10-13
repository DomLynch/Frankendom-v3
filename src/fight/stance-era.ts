// The stance rows' ERA (Dom/Strategy 2026-10-13: timing is sacred). Before v52 the Defensive stance lengthened the parry window and the guard-counter window by a quarter; from v52 a stance moves
// numbers, never a window, so those two deltas are gone from the rows (stance-defs.json) and a record below 52 keeps them through the LEGACY table in stance.ts. Same pattern as the play circle,
// late notice and the Goblin's stab: a leaf of the simulation (no imports), ON for a live fight and for a record at FIRST_STANCE_ROWS_VERSION or later, OFF only while a record below it replays
// (detmath.ts underRecord, match.ts replay), so a record's version always names the rules it ran.
export const FIRST_STANCE_ROWS_VERSION = 52;
export let STANCE_ROWS_ON = true;
export function setStanceRows(on: boolean): void { STANCE_ROWS_ON = on; }
export function underStanceRows<T>(version: number, run: () => T): T {
  const outer = STANCE_ROWS_ON; STANCE_ROWS_ON = version >= FIRST_STANCE_ROWS_VERSION;
  try { return run(); } finally { STANCE_ROWS_ON = outer; }
}
