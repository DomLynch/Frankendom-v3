// Per-body fatigue tuning (Lead's brief B: Goblin quick and shallow, Executioner slow and deep). Render only; scales fatigue.ts's `breathe` rate,
// the chest depth and posture, and the sword arm's sag. An id not listed breathes at the default (1, 1, 1).
import type { FatigueTune } from './fatigue-layer.ts';
import type { OpponentId } from '../roster.ts';
import { FATIGUE_TUNES, FATIGUE_GUARD_DROP } from './fatigue-rows.ts';

export const FOE_TUNE: Partial<Record<OpponentId, FatigueTune>> = FATIGUE_TUNES;   // fatigue-defs.json: one row per body
// How far the raised guard / shield sinks at full tiredness: a share of the raise, applied to the shield carry (a few cm on screen).
export const GUARD_DROP = FATIGUE_GUARD_DROP;
