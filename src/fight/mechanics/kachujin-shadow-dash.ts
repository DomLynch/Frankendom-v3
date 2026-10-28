// KACHUJIN'S SHADOW DASH (ring 2). Tell: he stops, an orange line draws on the sand from him to where you stand and LOCKS `lockBeforeTicks` before he goes. Dash: he runs the locked line
// at `dashSpeedMps` and stops `stopGapM` short of the locked point (or short of you, if you walked into it). Cut: if you are still inside `slashReachM` he throws one ordinary light cut
// (the sim's own wind-up, guard, parry, roll and damage rules decide it). Recover: `recoverTicks` in which he starts nothing. COUNTER: leave the line (the dash overshoots, no cut) or
// guard the cut; PUNISH: the recovery. A stagger cancels it. Every number is a row (data/mechanics.json "shadow-dash"). Deterministic: detmath only, no randomness, no timers.
import ROWS from '../../../data/mechanics.json' with { type: 'json' };
import { M } from '../detmath.ts';
import { legal, type Duel, type Intent } from '../duel.ts';
import { RADIUS } from '../play-radius.ts';
import { STEP } from '../sim.ts';
import type { Mechanic } from './registry.ts';

export type DashRow = typeof ROWS.mechanics['shadow-dash'];
export const DASH_ROW: DashRow = ROWS.mechanics['shadow-dash'];
export type DashPhase = 'idle' | 'tell' | 'dash' | 'slash' | 'recover';
/** Plain data, mutated in place by the page's one stepper (no per-tick allocation); the effect reads it. */
export type DashState = {
  phase: DashPhase; since: number; nextAt: number;
  locked: boolean; lineX: number; lineZ: number;   // the locked point (where he was told you stand)
  stopX: number; stopZ: number; dirX: number; dirZ: number; fromX: number; fromZ: number;   // the dash: start, unit direction, where it ends
  moved: number; fired: boolean; seen: boolean; endedAt: number;   // metres run, whether the cut was thrown, whether it was seen starting, the tick the dash ended
};
export const freshDash = (row: DashRow = DASH_ROW): DashState => ({ phase: 'idle', since: 0, nextAt: row.firstDelayTicks, locked: false, lineX: 0, lineZ: 0, stopX: 0, stopZ: 0, dirX: 0, dirZ: 0, fromX: 0, fromZ: 0, moved: 0, fired: false, seen: false, endedAt: 0 });

const still = (warden: Intent, action: Intent['action'] = null): Intent => ({ ...warden, move: { x: 0, z: 0, yaw: 0, run: false }, action, guard: false });
const reset = (s: DashState, tick: number, row: DashRow): void => { s.phase = 'idle'; s.locked = false; s.nextAt = tick + row.cooldownTicks; };

/** One tick. `duel` is the state before the step; `run(w)` steps it with warden intent `w`. */
export function stepDash(s: DashState, duel: Duel, warden: Intent, run: (w: Intent) => Duel, row: DashRow = DASH_ROW): Duel {
  const [hero, boss] = duel.fighters, t = duel.tick;
  if (duel.finish || hero.health <= 0 || boss.health <= 0 || boss.phase === 'dead') { s.phase = 'idle'; s.locked = false; return run(warden); }   // a kill ends it (the corpse is not dashed)
  if (s.phase !== 'idle' && boss.phase === 'hurt') { reset(s, t, row); return run(warden); }   // a stagger cancels it
  const gap = M.hypot(hero.body.x - boss.body.x, hero.body.z - boss.body.z);
  if (s.phase === 'idle') {
    if (t < s.nextAt || boss.phase !== 'ready' || boss.special || gap < row.triggerMinM || gap > row.triggerMaxM) return run(warden);
    s.phase = 'tell'; s.since = t; s.locked = false;
  }
  if (s.phase === 'tell') {
    const n = t - s.since;
    if (!s.locked && n >= row.tellTicks - row.lockBeforeTicks) {   // the line freezes: where you stand NOW is where he goes
      s.locked = true; s.lineX = hero.body.x; s.lineZ = hero.body.z; s.fromX = boss.body.x; s.fromZ = boss.body.z;
      const dx = s.lineX - s.fromX, dz = s.lineZ - s.fromZ, d = M.hypot(dx, dz) || 1, reach = Math.max(0, Math.min(d - row.stopGapM, row.dashMaxTicks * row.dashSpeedMps * STEP));
      s.dirX = dx / d; s.dirZ = dz / d; s.stopX = s.fromX + s.dirX * reach; s.stopZ = s.fromZ + s.dirZ * reach;
    }
    if (n >= row.tellTicks) { s.phase = 'dash'; s.since = t; s.moved = 0; } else return run(still(warden));
  }
  if (s.phase === 'dash') {
    const b = boss.body, left = M.hypot(s.stopX - b.x, s.stopZ - b.z), stride = Math.min(row.dashSpeedMps * STEP, left);
    let x = b.x + s.dirX * stride, z = b.z + s.dirZ * stride;
    const wall = duel.radius ?? RADIUS, r = M.hypot(x, z);
    if (r > wall) { x *= wall / r; z *= wall / r; }
    const next = run(still(warden)), foe = next.fighters[1];
    s.moved += stride;
    const arrived = left - stride <= 0 || t - s.since + 1 >= row.dashMaxTicks || M.hypot(hero.body.x - x, hero.body.z - z) <= row.stopGapM;
    if (arrived) { s.phase = 'slash'; s.since = t + 1; s.fired = false; s.seen = false; s.endedAt = t; }
    return { ...next, fighters: [next.fighters[0], { ...foe, body: { ...foe.body, x, z, heading: M.atan2(s.dirX, s.dirZ), distance: foe.body.distance + stride } }] };
  }
  if (s.phase === 'slash') {
    if (!s.fired) {
      s.fired = true;
      if (boss.phase === 'ready' && gap <= row.slashReachM && legal(boss, row.slashAction as Intent['action'] & Parameters<typeof legal>[1])) return run(still(warden, row.slashAction as Intent['action']));
      s.phase = 'recover'; s.since = t;   // you left the line: no cut, he is open
    } else {
      if (boss.phase === 'attack') s.seen = true;
      if ((s.seen && boss.phase !== 'attack') || t - s.since > row.slashMaxTicks || (!s.seen && t - s.since > 3)) { s.phase = 'recover'; s.since = t; }
      else return run(still(warden));
    }
  }
  if (s.phase === 'recover') {
    if (t - s.since >= row.recoverTicks) { reset(s, t, row); return run(warden); }
    return run(still(warden));
  }
  return run(warden);
}

export const shadowDash: Mechanic<DashState> = {
  id: 'shadow-dash',
  create: () => freshDash(),
  step: (s, duel, warden, run) => stepDash(s, duel, warden, run),
  fx: () => import('./kachujin-shadow-dash-fx.ts').then((m) => m.createShadowDashFx),
};
