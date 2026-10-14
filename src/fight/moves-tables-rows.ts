// moves-tables's tables as MOVES_TABLES_ROW_MAP (Dom, "centralized game engine, no hard coding"; the debt entries in scripts/as-data/allow.json). The numbers live in moves-tables-defs.json, manifest-loaded through the shared
// registry; this file only rebuilds, key for key and in the same order, the objects the sim files always held. A sim file: it imports only the shared row loader.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import MOVES_TABLES_DEFS from './moves-tables-defs.json' with { type: 'json' };
import MOVES_TABLES_MANIFEST from './moves-tables-defs.manifest.json' with { type: 'json' };

// PROFILES as the code held it before it became rows (comments are the owners' rulings):
// | {
// |   // discipline sits above a heavy's cost so the warden rests instead of swinging itself into exhaustion.
// |   easy: { reaction: 24, accuracy: .5, parry: .1, dodge: .1, aggression: .45, pressure: 0, discipline: 60, lapse: .45, read: .5 },
// |   normal: { reaction: 14, accuracy: .75, parry: .3, dodge: .2, aggression: .65, pressure: 0, discipline: 50, lapse: .3, read: .7 },   // read (directional guard, owner 2026-09-20): the side he guards on is right 7 times in 10; the lead's per-rung numbers, swept by the battery
// |   hard: { reaction: 10, accuracy: .95, parry: .6, dodge: .35, aggression: .85, pressure: .5, discipline: 40, lapse: .1, read: .85 },   // 167 ms: hard is decisions and feints, not input-reading (was 7)
// | }
const PROFILES_T = tableFromFile(MOVES_TABLES_MANIFEST.tables[0] as unknown as Manifest, MOVES_TABLES_DEFS, 'moves-tables-defs.json');
loadRegistry([PROFILES_T]);
export const PROFILES_ROWS = Object.fromEntries((PROFILES_T.rows as unknown as { id: string }[]).map(({ id, ...rest }) => [id, rest]));

// OWN_KNOBS as the code held it before it became rows (comments are the owners' rulings):
// | { veteran: { tellReaction: 15, braceHeavy: 1, spamRun: 5 }, pitborn: { spamRun: 6 }, dwarf: { spamRun: 6 }, knight: { spamRun: 5 }, shieldmaiden: { spamRun: 5, spamBoth: 1 } }
const OWN_KNOBS_T = tableFromFile(MOVES_TABLES_MANIFEST.tables[1] as unknown as Manifest, MOVES_TABLES_DEFS, 'moves-tables-defs.json');
loadRegistry([OWN_KNOBS_T]);
export const OWN_KNOBS_ROWS = Object.fromEntries((OWN_KNOBS_T.rows as unknown as { id: string }[]).map(({ id, ...rest }) => [id, rest]));

// ABSENT as the code held it before it became rows (comments are the owners' rulings):
// | { read: 1, feint: 0, guard: 1, disengage: 0, circle: 0, regen: 1, step: 0, interrupt: 0, kick: 0, dash: 0, stab: 0, anticipate: 8, tellReaction: 99, braceHeavy: 0, spamRun: 0, spamBoth: 0 }
const ABSENT_T = tableFromFile(MOVES_TABLES_MANIFEST.tables[2] as unknown as Manifest, MOVES_TABLES_DEFS, 'moves-tables-defs.json');
loadRegistry([ABSENT_T]);
export const ABSENT_ROWS = Object.fromEntries((ABSENT_T.rows as unknown as { id: string; value: number }[]).map((r) => [r.id, r.value])) as unknown as { readonly read: number; readonly feint: number; readonly guard: number; readonly disengage: number; readonly circle: number; readonly regen: number; readonly step: number; readonly interrupt: number; readonly kick: number; readonly dash: number; readonly stab: number; readonly anticipate: number; readonly tellReaction: number; readonly braceHeavy: number; readonly spamRun: number; readonly spamBoth: number };

// POISE_FULL_AT as the code held it before it became rows (comments are the owners' rulings):
// | { pitborn: 18, shieldmaiden: 18 }
const POISE_FULL_AT_T = tableFromFile(MOVES_TABLES_MANIFEST.tables[3] as unknown as Manifest, MOVES_TABLES_DEFS, 'moves-tables-defs.json');
loadRegistry([POISE_FULL_AT_T]);
export const POISE_FULL_AT_ROWS = Object.fromEntries((POISE_FULL_AT_T.rows as unknown as { id: string; value: number }[]).map((r) => [r.id, r.value])) as unknown as { readonly pitborn: number; readonly shieldmaiden: number };
