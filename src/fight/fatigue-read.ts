// The fatigue read (presentation only, ON by default since 2026-10-08; `?off=fatigue-read` returns the live layer alone; an old `?look=fatigue-read` link still shows it): the tired body made to READ from behind the hero at the 375 fight camera. The live layer
// (fatigue-layer.ts) hunches spine_01 by about 10 degrees and heaves the chest by ~3, which from behind is a foreshortened nothing; only the sword
// arm's sag shows. This pose pitches the whole spine ~34 degrees at gassed, ~15 winded (spine_01..03; measured at the fight camera: under ~25 it does not read from behind), drops the head, raises and lowers the shoulders on a slow breath
// and sinks the guard hand. Bones only: no sim state, no hitbox, no blade table; the sword arm keeps the live layer's sag. `?off=fatigue-read` = fatigueLayer alone.
// Reads `Fatigue.level` (band 1 starts at .5; w is 0 at .2, 1 at .85, so stamina 10 -> level .9 is full), `gassed` (forces full) and `second`
// (the second wind straightens it), via the `tired` value characters.ts already holds (fed by scene.ts from practice.fatigue[side]).
import type { Fatigue } from './fatigue.ts';
import type { FatigueTune } from './fatigue-layer.ts';
import { offFlag } from '../off-flag.ts';

export const fatigueReadFrom = (search: string): boolean => !offFlag(search, 'fatigue-read');

type In = Pick<Fatigue, 'level' | 'gassed' | 'second'>;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** How much of the full tired pose shows: 0 fresh, partial when winded, 1 by level .85 or when gassed; the second wind lifts it off. */
export const readWeight = (f: In): number => clamp01(Math.max((f.level - .2) / .65, f.gassed)) * (1 - clamp01(f.second) * .7);
/** Breath phase rate (rad/s): a 1.6 s cycle when winded, 1.2 s when gassed, scaled by the body's own `rate`. */
export const readRate = (f: In, t?: FatigueTune): number => 2 * Math.PI * (1 / 1.6 + (1 / 1.2 - 1 / 1.6) * clamp01(Math.max((f.level - .5) / .4, f.gassed))) * (t?.rate ?? 1);

export type FatigueReadPose = { spine1: number; spine2: number; spine3: number; neck: number; head: number; shrug: number; heave: number; guard: number; arm: number };
// Radians, rig convention (+x on a spine bone leans forward). `shrug` and `heave` are the shoulder lift (both clavicles, about the fighter's forward axis)
// and its breath term. `guard` is 0..1 of the off hand's extra sink. `arm` is the live layer's sword-arm sag, passed through unchanged.
export function fatigueRead(f: In, phase: number, calm: number, live: { arm: number }, t?: FatigueTune): FatigueReadPose {
  const w = readWeight(f) * calm, depth = Math.max(.6, Math.min(1.1, t?.depth ?? 1)), b = Math.sin(phase) * (1 + Math.sin(phase * .37) * .25 * f.gassed);
  const pitch = .6 * w * depth;   // 34 degrees over the three spine bones at full (15 when winded): from behind a smaller pitch is foreshortened to nothing
  return {
    spine1: pitch * .4, spine2: pitch * .35 - b * .035 * w, spine3: pitch * .25 - b * .05 * w,
    neck: .5 * w, head: .3 * w + b * .03 * w,
    shrug: .6 * w, heave: b * .15 * w,
    guard: w, arm: live.arm,
  };
}
