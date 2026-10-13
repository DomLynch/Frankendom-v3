// The poise ladder's ERA (Combat, top-30 item 10, Lead 2026-10-13). Before v54 a creature's poise was one threshold: a plain clean hit under it shrugs, anything over it staggers in full. From v54 the hit's
// size against that poise picks a tier (poise-ladder.ts), so a record below 54 keeps the single threshold. Same pattern as the stance rows and the play circle: a leaf of the simulation (no imports),
// ON for a live fight and for a record at FIRST_POISE_LADDER_VERSION or later, OFF only while a record below it replays (detmath.ts underRecord, match.ts replay).
export const FIRST_POISE_LADDER_VERSION = 54;
export let POISE_LADDER_ON = true;
export function setPoiseLadder(on: boolean): void { POISE_LADDER_ON = on; }
export function underPoiseLadder<T>(version: number, run: () => T): T {
  const outer = POISE_LADDER_ON; POISE_LADDER_ON = version >= FIRST_POISE_LADDER_VERSION;
  try { return run(); } finally { POISE_LADDER_ON = outer; }
}
