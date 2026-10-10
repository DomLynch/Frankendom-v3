// The fatigue driver (Lead's brief B, Dom: "make it realistic"; Bot report 2026-10-06): ONE read-only number per fighter that every
// presentation layer reads, so a man who has gone hard shows it on his body and in the mix. View layer only: this file is not in
// the record digest, reads the sim's stamina and writes nothing back (no cost, regen, threshold, speed, AI or camera change).
//   level  0..1  smoothed tiredness. Raw = 1 - stamina/100, raised by a shrunk ceiling (a wound) and by a leg wound. Rises over ~.75 s, falls over
//                ~2 s, so the breathing slows down after a rest and never snaps off.
//   band   0 fresh · 1 winded (level >= .5: stamina under half, or the ceiling cut hard) · 2 tired (>= .75: stamina under a quarter) · 3 gassed (exhausted)
//   gassed 0..1  smoothed `exhausted` (hands on thighs / tip down); second  1..0 for ~1.5 s after he recovers: the visible second-wind straighten.
// Bodies tune their own look (Goblin quick and shallow, Executioner slow and deep) from these; the thresholds live here, once.
import type { Fighter } from './duel.ts';

export type Fatigue = { level: number; band: 0 | 1 | 2 | 3; gassed: number; second: number };
export const FRESH: Fatigue = { level: 0, band: 0, gassed: 0, second: 0 };
const FULL = 100, RISE = 1 / 45, FALL = 1 / 120, GAS_RISE = 1 / 20, GAS_FALL = 1 / 90, SECOND = 1 / 90;   // per sim tick (60 Hz)
export const WINDED = .5, TIRED = .75;
const toward = (v: number, to: number, up: number, down: number) => to > v ? Math.min(to, v + up) : Math.max(to, v - down);

export const fatigueTarget = (f: Pick<Fighter, 'stamina' | 'maxStamina' | 'legWound'>): number =>
  Math.min(1, Math.max(0, 1 - f.stamina / FULL + (1 - f.maxStamina / FULL) * .5 + (f.legWound ? .1 : 0)));
const HYST = .06;   // a band is left only HYST below the line that entered it, so regen at a threshold cannot flicker the pose or repeat the lesson
export const bandOf = (level: number, gassed: number, was: Fatigue['band'] = 0): Fatigue['band'] =>
  gassed > .5 || (was === 3 && gassed > .3) ? 3 : level >= TIRED - (was === 2 ? HYST : 0) ? 2 : level >= WINDED - (was === 1 ? HYST : 0) ? 1 : 0;

// One tick: `previous` is last tick's value (undefined on the first: start where the body is, no ramp from fresh).
export function stepFatigue(f: Pick<Fighter, 'stamina' | 'maxStamina' | 'legWound' | 'exhausted'>, previous?: Fatigue): Fatigue {
  const target = fatigueTarget(f), was = previous ?? { level: target, band: 0 as const, gassed: +f.exhausted, second: 0 };
  const level = previous ? toward(was.level, target, RISE, FALL) : target, gassed = toward(was.gassed, +f.exhausted, GAS_RISE, GAS_FALL);
  const second = was.gassed > .5 && gassed <= .5 ? 1 : Math.max(0, was.second - SECOND);   // the tick he comes off exhaustion: the straighten starts
  return { level, band: bandOf(level, gassed, was.band), gassed, second };
}
