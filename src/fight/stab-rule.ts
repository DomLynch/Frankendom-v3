// The Goblin's stab (AiProfile.stab, COMBAT-001 3/3, 2026-10-06) is a rule of this build's fights: a record older than FIRST_STAB_VERSION was
// fought without it and must replay without it (detmath.ts underRecord sets this for the run it wraps, as play-radius.ts does for the circle).
// A leaf of the simulation (no imports). It is an ERA flag like play-radius.ts LATE_NOTICE: off for a headless run (which a record stamps with the version before it),
// turned on by a live fight (match.ts begin) or a replay of a record at FIRST_STAB_VERSION or later (underRecord), so a record's version always names the rules it ran.
export const FIRST_STAB_VERSION = 25;
export let STAB_ON = false;
export function setStab(on: boolean): void { STAB_ON = on; }
export function underStab<T>(version: number, run: () => T): T {
  const outer = STAB_ON; STAB_ON = version >= FIRST_STAB_VERSION;
  try { return run(); } finally { STAB_ON = outer; }
}
