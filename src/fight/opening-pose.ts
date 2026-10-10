// The open stagger (Lead's brief item 2): a foe opened by a parry or a broken posture drops his guard and shield and leans off balance for
// exactly as long as the sim's opening lasts (Practice.opening: `left` ticks of `of`). View only: radians added after the mixer, like the tired body.
import type { Opening } from './combat.ts';

const ramp = (v: number, a: number, b: number): number => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const IN = .12, OUT = .2;   // the share of the opening spent falling off balance, and recovering; the rest holds, so it ends with the opening, never after
// 0..1: 0 once no opening is left, up fast at the start, held through the middle, easing out over the last OUT of it.
export const openWeight = (o: Pick<Opening, 'left' | 'of'> | null): number => {
  if (!o || o.of <= 0 || o.left <= 0) return 0;
  const done = 1 - o.left / o.of;
  return ramp(done, 0, IN) * (1 - ramp(done, 1 - OUT, 1));
};
export type OpenPose = { lean: number; tilt: number; arm: number; guard: number };   // spine_01.x forward, spine_01.z off-balance side, upperarm_r.x tip down, raised-guard multiplier
export const NO_OPEN: OpenPose = { lean: 0, tilt: 0, arm: 0, guard: 1 };
export const openPose = (w: number, kind: Opening['kind'] = 'parry'): OpenPose =>
  w <= 0 ? NO_OPEN : { lean: .22 * w, tilt: (kind === 'posture' ? .22 : .16) * w, arm: .45 * w, guard: 1 - .85 * w };
