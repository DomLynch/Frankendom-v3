// RV80 (Combat, Dom 2026-10-19: "turn it on, migrate fully from the sandboxes"): the sandbox page's own defaults, as rows. The special timers are era-keyed (sandbox-era.ts rows80For: a live fight and a record at 80 or later
// read rows80-defs.json, an older record keeps rules-defs.json's 1200 / 1200 and replays byte for byte); the level the specials start at is a plain dial (a fight record carries its own specials flag, so no record changes).
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import { ROWS80_ON } from './sandbox-era.ts';
import DEFS from './rows80-defs.json' with { type: 'json' };
import MANIFEST from './rows80-defs.manifest.json' with { type: 'json' };

loadRegistry((MANIFEST.tables as unknown as Manifest[]).map((m) => tableFromFile(m, DEFS, 'rows80-defs.json')));
const TIMER = Object.fromEntries(DEFS.specialTimers.map((r) => [r.id, r.ticks])) as Record<string, number>;
const DIAL = Object.fromEntries(DEFS.dials.map((r) => [r.id, r.value])) as Record<string, number>;

/** Ticks until a fighter's first special is ready: the RV80 row for a live fight / a record at 80 or later, else the rules' own number (`older`). */
export const specialFirst = (older: number): number => (ROWS80_ON ? TIMER.first! : older);
/** Ticks between casts (same keying as specialFirst). */
export const specialCooldown = (older: number): number => (ROWS80_ON ? TIMER.cooldown! : older);
/** The fight level specials start at (the row; was rank 4, level 16). */
export const SPECIALS_FROM_LEVEL: number = DIAL.specialsFromLevel!;
