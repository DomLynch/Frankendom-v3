// Frankendom parts, stage 2: the per-body fit rows (data/parts-fit-rows.json): the measure row and the collar rows of the hero and of every boss body that can donate a part. Pure data access;
// the values are checked by src/sim/validate-parts-fit.js (validateFitRows) and the rules that read them live in src/fight/parts-fit.ts.
import ROWS from '../data/parts-fit-rows.json' with { type: 'json' };
import PROFILE_ROWS from '../data/profiles.json' with { type: 'json' };
import { PARTS, type FitRules } from './parts.ts';
import { validateFitRows } from './sim/validate-parts-fit.js';

/** Metres from a body's bind pose (the keys of validate-parts-fit.js MEASURE_KEYS); absent keys are read as missing. */
export type Measure = Partial<Record<string, number>>;
/** One collar ring: `bone`, `at` (fraction of the bone's length to its first child), radius `r` and height `h` in metres. */
export type CollarRow = { id: string; bone: string; at: number; r: number; h: number };
/** `source`, `wearable`, `quality` and `reason` are absent on the hero row. */
export type FitBody = { id: string; measuredOn: string; source?: 'derived' | 'original'; wearable?: boolean; quality?: number; reason?: string; measure: Measure | null; collars: CollarRow[] };
export type FitRowsFile = { hero: string; bodies: FitBody[] };

export const FIT_ROWS = ROWS as unknown as FitRowsFile;
const KNOWN_PROFILES: ReadonlySet<string> = new Set((PROFILE_ROWS.profiles as { id: string }[]).map((p) => p.id));

/** Why the rows are not good (one string per problem; empty = fine). */
export const validateRows = (file: FitRowsFile = FIT_ROWS, fit: FitRules = PARTS.fit, profiles: ReadonlySet<string> = KNOWN_PROFILES): string[] => validateFitRows(file, fit, profiles);

/** The row of a boss body by its data/profiles.json id, or undefined (no row: lift 0, no collars). */
export const fitBodyOf = (profile: string, file: FitRowsFile = FIT_ROWS): FitBody | undefined => file.bodies.find((b) => b.id === profile);
/** Whether a part of boss `profile` may be offered for Equip (a donor row with `wearable` true; no row = not wearable). */
export const isWearable = (profile: string, file: FitRowsFile = FIT_ROWS): boolean => fitBodyOf(profile, file)?.wearable === true;
/** The wearable donors, best quality first. */
export const wearableDonors = (file: FitRowsFile = FIT_ROWS): FitBody[] => file.bodies.filter((b) => b.wearable === true).sort((a, b) => a.quality! - b.quality!);
/** The hero's own row (the body the part is worn on). */
export const heroFitBody = (file: FitRowsFile = FIT_ROWS): FitBody | undefined => fitBodyOf(file.hero, file);
