// The practice HUD's one-line report as data (data/practice-hints.json; src/fight/combat.ts practiceHint reads it): the move names a result line wears and the text of every state. The file is checked at load
// (validateFile 'practice-hints'), so a missing line or an unknown {piece} stops the page, not a fight. Sim boundary: JSON and a replace, no DOM, no clock.
import HINTS_JSON from '../../data/practice-hints.json' with { type: 'json' };
import { validateFile } from '../sim/validate.js';

type Parts = { wall: string; chip: string; hitKind: Record<'stop' | 'counter' | 'clean', string>; hurtKind: Record<'stop' | 'trip' | 'counter' | 'plain', string>; blockedKind: Record<'perfect' | 'plain', string>; wallText: Record<'hit' | 'hurt', string> };
export type PracticeHints = { defaultFoe: string; followUp: string; moves: Readonly<Record<string, string>>; lines: Readonly<Record<string, string>>; parts: Parts };

const problems = validateFile('practice-hints', HINTS_JSON);
if (problems.length) throw Error(`data/practice-hints.json: ${problems.join('; ')}`);
export const HINTS = HINTS_JSON as unknown as PracticeHints;

/** Fill the {pieces} of a hint text; a piece the caller did not pass reads as the word the old template literal printed ("undefined"). */
export const fmt = (text: string, vars: Readonly<Record<string, unknown>>): string => text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k]));
