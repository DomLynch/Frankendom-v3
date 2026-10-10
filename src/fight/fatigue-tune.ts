// Per-body fatigue tuning (Lead's brief B: Goblin quick and shallow, Executioner slow and deep). Render only; scales fatigue.ts's `breathe` rate,
// the chest depth and posture, and the sword arm's sag. An id not listed breathes at the default (1, 1, 1).
import type { FatigueTune } from './fatigue-layer.ts';
import type { OpponentId } from '../roster.ts';

export const FOE_TUNE: Partial<Record<OpponentId, FatigueTune>> = {
  goblin: { rate: 1.5, depth: .55, sag: .8 },          // small lungs: quick, shallow
  executioner: { rate: .65, depth: 1.4, sag: 1.2 },    // a big man: slow, deep, the heavy blade drags
  minotaur: { rate: .7, depth: 1.4, sag: 1.2 },
  dwarf: { rate: 1.2, depth: .8, sag: 1 },
  veteran: { rate: .95, depth: 1.1, sag: 1 },
  pitborn: { rate: .9, depth: 1.2, sag: 1.1 },
};
// How far the raised guard / shield sinks at full tiredness: a share of the raise, applied to the shield carry (a few cm on screen).
export const GUARD_DROP = .3;
