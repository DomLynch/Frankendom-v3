// The boss specials' own presentation timing (Multi Chars; special-fx-boss.ts draws them). Pure and three-free like
// special-timing.ts beside it: ticks at the sim's 60 Hz from the SpecialStarted tick, the strike landing at LAND_AT (the one 120 of RULES.special.windup).
import type { OpponentId } from '../roster.ts';
import { LAND_AT } from './special-timing.ts';

export type BossKind = 'mist' | 'echo' | 'price' | 'flies' | 'stain' | 'breath' | 'sling' | 'haze' | 'storm';   // the ?special= ids special-fx-boss.ts draws
export const BUILD = 30;   // the visible build-up: the last half second before the landing (Dom: a 1-2 s build-up was too slow on Red Wind)
export const BUILD_AT = LAND_AT - BUILD;
// The Knight's Sling (rank 8): he turns one full circle in the build-up, slow into fast, and steps out of it into the blow (the scene turns his heading by this).
export const slingAngle = (age: number) => { const k = Math.min(1, Math.max(0, (age - BUILD_AT) / BUILD)); return Math.PI * 2 * k * k * (3 - 2 * k); };
// The Knight's Wrath (rank 9): his body trembles, harder through the build-up, until the blow (metres of sway on his x).
export const wrathTremor = (age: number) => Math.min(1, Math.max(0, (age - BUILD_AT) / BUILD)) * 0.018 * Math.sin(age * 2.3);

// Which cast each boss effect is for: the lane's own class skill, on the opponent's side (advanceCast's `is`; special-timing.ts is not edited for it).
const CLASS_SKILL: Partial<Record<OpponentId, string>> = { witch: 'skill_witchfire', plaguedoctor: 'skill_miasma', knight: 'skill_ironrush' };
export const isBossCast = (opponent: OpponentId, actor: number, move?: string) => actor === 1 && move !== undefined && CLASS_SKILL[opponent] === move;
