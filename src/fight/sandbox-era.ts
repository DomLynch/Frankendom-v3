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
let eraForced: boolean | undefined;
/** TEST SETUP ONLY (tests/lib/era-off.ts): pin the era for live play AND replay, so a fight the legacy suite records at the current version replays under the rules it was fought with. Never called by the game; undefined (the default) leaves the version to decide. */
export function forceSandbox(on: boolean | undefined): void { eraForced = on; }
/** Whether a record of this version is fought under the sandbox rules. */
export const sandboxFor = (version: number): boolean => eraForced ?? version >= FIRST_SANDBOX_VERSION;
export function underSandbox<T>(version: number, run: () => T): T {
  const outer = SANDBOX_ON; setSandbox(sandboxFor(version));
  try { return run(); } finally { setSandbox(outer); }
}
// RV79 (Combat, "port ALL of the sandbox", Dom 2026-10-18): the sandbox rows BULK-CS left out as tuning ride a second boundary of this same leaf: stances 2x (stance.ts), the Arena 1 play circle 0.36 -> 0.468
// (play-radius.ts), the plate set's shape (gear-rows.ts). ON for a live fight and for a record at 79 or later; a record below 79 replays the numbers it was fought with. The test force (forceSandbox) pins this too.
export const FIRST_ROWS79_VERSION = 79;
export let ROWS79_ON = true;
export function setRows79(on: boolean): void { ROWS79_ON = on; }
/** Whether a record of this version is fought with the RV79 rows. */
export const rows79For = (version: number): boolean => eraForced ?? version >= FIRST_ROWS79_VERSION;
/** The version a row keyed on a record version should be read at: the version itself, or the last one before RV79 while the RV79 rows are pinned off (tests). */
export const rows79Version = (version: number): number => (rows79For(version) ? version : Math.min(version, FIRST_ROWS79_VERSION - 1));
export function underRows79<T>(version: number, run: () => T): T {
  const outer = ROWS79_ON; ROWS79_ON = rows79For(version);
  try { return run(); } finally { ROWS79_ON = outer; }
}
// RV80 (Combat, "turn it on, migrate fully from the sandboxes", Dom 2026-10-19): the sandbox behaviours that were only a link flag or a sandbox-page default become the live game's: the leathers set's shape (gear-defs.json era 80) and the
// SPECIAL timers (2 s before the first special, 6 s between casts: rows80-defs.json). A third boundary of this same leaf: ON for a live fight and for a record at 80 or later; a record below 80 replays the numbers it was fought with.
export const FIRST_ROWS80_VERSION = 80;
export let ROWS80_ON = true;
export function setRows80(on: boolean): void { ROWS80_ON = on; }
/** Whether a record of this version is fought with the RV80 rows. */
export const rows80For = (version: number): boolean => eraForced ?? version >= FIRST_ROWS80_VERSION;
/** The version a row keyed on a record version should be read at: the version itself, or the last one before RV80 while the RV80 rows are pinned off (tests). */
export const rows80Version = (version: number): number => (rows80For(version) ? version : Math.min(version, FIRST_ROWS80_VERSION - 1));
export function underRows80<T>(version: number, run: () => T): T {
  const outer = ROWS80_ON; ROWS80_ON = rows80For(version);
  try { return run(); } finally { ROWS80_ON = outer; }
}
// RV83 (Combat, 2026-10-19, Backend's finding on a disposable DB at RV82): an open-world hero holding a bow-family weapon (a `bow` missile row) carries the special share like the Pit's hero (duel.ts withSpecials),
// so his picked special fires the bow special (Power Shot, Fan Volley, Pinning Shot, Quick Shot) beyond the missile gap instead of throwing the melee skill swing, which whiffed at range with no arrow
// (open-fight.ts heroSheeted). A fourth boundary of this leaf: ON for a live fight and for a record at 83 or later; a record below 83 keeps the old hero (no share without a spell).
export const FIRST_ROWS83_VERSION = 83;
export let ROWS83_ON = true;
export function setRows83(on: boolean): void { ROWS83_ON = on; }
/** Whether a record of this version is fought with the RV83 world bow share. */
export const rows83For = (version: number): boolean => eraForced ?? version >= FIRST_ROWS83_VERSION;
export function underRows83<T>(version: number, run: () => T): T {
  const outer = ROWS83_ON; ROWS83_ON = rows83For(version);
  try { return run(); } finally { ROWS83_ON = outer; }
}
// RV84 (Combat, 2026-10-20, Strategy's audit of the sandbox against trunk): (1) an open-world hero with a picked skill is a `picked` fighter like the Pit's slot-1 hero (open-fight.ts heroSheeted), so his melee
// special takes the sandbox's reach limit and 'far' cue, the 32-tick windup, the release whiff and the stagger / knock (duel.ts specialMelee rows); (2) the reach-band rows the sandbox had for the bite, the
// warhammer, the reaper, the bow and the staff (band-defs.json `weaponsRv84`) apply, so those weapons take the off-band penalty too (bands.ts). A fifth boundary of this leaf: ON for a live fight and for a record at 84 or later.
export const FIRST_ROWS84_VERSION = 84;
export let ROWS84_ON = true;
export function setRows84(on: boolean): void { ROWS84_ON = on; }
/** Whether a record of this version is fought with the RV84 world-picked specials and the added band rows. */
export const rows84For = (version: number): boolean => eraForced ?? version >= FIRST_ROWS84_VERSION;
export function underRows84<T>(version: number, run: () => T): T {
  const outer = ROWS84_ON; ROWS84_ON = rows84For(version);
  try { return run(); } finally { ROWS84_ON = outer; }
}
// RV85 (Combat, 2026-10-20, Dom: "hold heavy works in the Pit, just not in Zone 1"): the open world carries the held STRIKE into the sim (world.ts Input.held, the world record's step flag bit, open-fight.ts intentOf), so a held heavy
// chambers and charges as the Pit's does (duel.ts chamber / RULES.charge). A sixth boundary of this leaf: ON for a live fight and for a record at 85 or later; a record below 85 never carries the bit and replays the uncharged heavy.
export const FIRST_ROWS85_VERSION = 85;
export let ROWS85_ON = true;
export function setRows85(on: boolean): void { ROWS85_ON = on; }
/** Whether a record of this version is fought with the world's held STRIKE (the charged heavy). */
export const rows85For = (version: number): boolean => eraForced ?? version >= FIRST_ROWS85_VERSION;
export function underRows85<T>(version: number, run: () => T): T {
  const outer = ROWS85_ON; ROWS85_ON = rows85For(version);
  try { return run(); } finally { ROWS85_ON = outer; }
}
// RV86 (Combat, 2026-10-21, Dom's study list: Elden Ring attack timings measured, docs/specs/combat/elden-ring-timings.md): the longsword's light and thrust timings
// are the weapon row's `rv86` overlay (weapon-defs.json, moves.ts weaponOf); the other weapons are untouched because the wardens fight with them (a changed row would retime the warden too). A seventh boundary of this leaf: ON for a live fight and for a record at 86 or later; a record below 86 replays the old timings byte for byte.
export const FIRST_ROWS86_VERSION = 86;
export let ROWS86_ON = true;
export function setRows86(on: boolean): void { ROWS86_ON = on; }
/** Whether a record of this version is fought with the Elden Ring light and thrust timings. */
export const rows86For = (version: number): boolean => eraForced ?? version >= FIRST_ROWS86_VERSION;
export function underRows86<T>(version: number, run: () => T): T {
  const outer = ROWS86_ON; ROWS86_ON = rows86For(version);
  try { return run(); } finally { ROWS86_ON = outer; }
}
