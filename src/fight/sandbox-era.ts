// The combat sandbox's ERA (Combat, BULK-CS, RV78, Dom 2026-10-18: "whatever is in the sandboxes is approved"). Before v78 a fight had none of the sandbox's rules; from v78 every rule row of sandbox-rules-defs.json
// (melee-special windup, reach and react, bows and missiles, spell slot 2, mana, dodge pushback, wounds, reach bands, ...) applies as the sandbox had it. A record below 78 replays the old fight byte for byte:
// with the era OFF sandbox-rules.ts reads every rule as 0 and every table as empty (the sandbox's own design: a row of 0 is trunk). Same pattern as the breath cone (cone-era.ts): a leaf of the simulation (no
// imports), ON for a live fight and for a record at FIRST_SANDBOX_VERSION or later, OFF only while a record below it replays (detmath.ts underRecord, match.ts replay). setSandbox re-reads the rules (applySandboxEra).
export const FIRST_SANDBOX_VERSION = 78;
export let SANDBOX_ON = true;
const applies: (() => void)[] = [];
/** sandbox-rules.ts registers the function that re-reads every rule for the current era (it imports this leaf, never the other way round). */
export function onSandboxEra(fn: () => void): void { applies.push(fn); }
export function setSandbox(on: boolean): void { if (on !== SANDBOX_ON) { SANDBOX_ON = on; for (const fn of applies) fn(); } }
let forced: boolean | undefined;
/** TEST SETUP ONLY (tests/lib/era-off.ts): pin the era for live play AND replay, so a fight the legacy suite records at the current version replays under the rules it was fought with. Never called by the game; undefined (the default) leaves the version to decide. */
export function forceSandbox(on: boolean | undefined): void { forced = on; }
/** Whether a record of this version is fought under the sandbox rules. */
export const sandboxFor = (version: number): boolean => forced ?? version >= FIRST_SANDBOX_VERSION;
export function underSandbox<T>(version: number, run: () => T): T {
  const outer = SANDBOX_ON; setSandbox(sandboxFor(version));
  try { return run(); } finally { setSandbox(outer); }
}
