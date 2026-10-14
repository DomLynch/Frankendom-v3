// The breath cone's ERA (Combat, top-30 item 23, Lead 2026-10-13). Before v55 a special named in cone-defs.json landed all at once on its release tick like every other special; from v55 it breathes: a cone
// of pulses over the next ticks (cone-rules.ts). A record below 55 keeps the instant strike. Same pattern as the poise ladder and the stance rows: a leaf of the simulation (no imports), ON for a live fight
// and for a record at FIRST_CONE_VERSION or later, OFF only while a record below it replays (detmath.ts underRecord, match.ts replay).
export const FIRST_CONE_VERSION = 55;
export let CONE_ON = true;
export function setCone(on: boolean): void { CONE_ON = on; }
export function underCone<T>(version: number, run: () => T): T {
  const outer = CONE_ON; CONE_ON = version >= FIRST_CONE_VERSION;
  try { return run(); } finally { CONE_ON = outer; }
}
