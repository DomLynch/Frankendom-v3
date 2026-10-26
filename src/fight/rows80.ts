// RV80 (Combat, Dom 2026-10-19: "turn it on, migrate fully from the sandboxes"): the sandbox page's own defaults, as rows. The special timers are era-keyed (sandbox-era.ts rows80For: a live fight and a record at 80 or later
// read rows80-defs.json, an older record keeps rules-defs.json's 1200 / 1200 and replays byte for byte). The level the specials start at is era-keyed too: the server's verifier checks a record's specials flag against the rule the record was fought under.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import { ROWS80_ON, rows80For } from './sandbox-era.ts';
import DEFS from './rows80-defs.json' with { type: 'json' };
import MANIFEST from './rows80-defs.manifest.json' with { type: 'json' };

loadRegistry((MANIFEST.tables as unknown as Manifest[]).map((m) => tableFromFile(m, DEFS, 'rows80-defs.json')));
const TIMER = Object.fromEntries(DEFS.specialTimers.map((r) => [r.id, r.ticks])) as Record<string, number>;
const ROWS80_DIAL = Object.fromEntries(DEFS.dials.map((r) => [r.id, r.value])) as Record<string, number>;   // not named DIAL: that name is another sim file's (the digest needs every top-level name in one file)

/** Ticks until a fighter's first special is ready: the RV80 row for a live fight / a record at 80 or later, else the rules' own number (`older`). */
export const specialFirst = (older: number): number => (ROWS80_ON ? TIMER.first! : older);
const OPENER = DEFS.foeOpeners[0]!;   // the opener row: the lowest fight levels' foe waits longer for its first special
/** Ticks until the OPPONENT's first special is ready at this fight level: the opener row's for a level at or under its maxLevel (RV80 era only), else specialFirst. */
export const foeSpecialFirst = (level: number, older: number): number => (ROWS80_ON && level <= OPENER.maxLevel ? OPENER.ticks : specialFirst(older));
/** Ticks between casts (same keying as specialFirst). */
export const specialCooldown = (older: number): number => (ROWS80_ON ? TIMER.cooldown! : older);
/** The fight level specials start at: the RV80 row (level 1) for a live fight, else the rank-4 level the ladder always had (`older`, level 16). */
export const specialsFromLevel = (older: number): number => (ROWS80_ON ? ROWS80_DIAL.specialsFromLevel! : older);
/** The same, for a record of this version (the server verifier checks a record's specials flag against the rule it was fought under, before it replays it). */
export const specialsFromLevelAt = (version: number, older: number): number => (rows80For(version) ? ROWS80_DIAL.specialsFromLevel! : older);
