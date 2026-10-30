// Tap-to-switch the soft lock (Dom 2026-10-28; PR #177 left it as a hook). While locked on a boss in the zone, a TAP on another boss that is on him moves the lock to it. The page holds ONE fight in the duel
// sim (the held boss, `practice`) and every other boss on him as an attacker with its own duel on the hero's one health pool (attacker-bout.ts), so a switch is a swap: the tapped attacker's fight becomes the
// held one (adopt) and the held fight becomes an attacker. Nobody's health, the hero's body and the hero's health are untouched. Pure: no scene, no clock. Every number is a row (data/respawn.json lockSwitch).
import ROWS from '../../data/respawn.json' with { type: 'json' };
import { adopt, joinAttacker, type Attacker } from './attacker-bout.ts';

type LockSwitchRows = { on: boolean; query: string; off: string; tapMaxMs: number; tapMaxMovePx: number; pickRadiusPx: number; aimHeightMetres: number };
type LockSwitchLimits = { [K in keyof Omit<LockSwitchRows, 'on' | 'query' | 'off'>]: [number, number] };

/** Throws on a bad lock-switch row. */
export function validateLockSwitch(rows: LockSwitchRows, limits: LockSwitchLimits): void {
  for (const k of Object.keys(limits) as (keyof LockSwitchLimits)[]) {
    const v = rows[k], [lo, hi] = limits[k];
    if (!(Number.isFinite(v) && v >= lo && v <= hi)) throw new Error(`respawn.json lockSwitch.${k} ${v} is not in ${lo}..${hi}`);
  }
  if (typeof rows.on !== 'boolean') throw new Error('respawn.json lockSwitch.on is true or false');
  if (!rows.query || !rows.off) throw new Error('respawn.json lockSwitch.query and off are words');
}

type Shipped = { lockSwitch: LockSwitchRows; limits: { lockSwitch: LockSwitchLimits } };
const SHIPPED = ROWS as unknown as Shipped;

/** The rows this page plays: null when there is no soft lock (`soft` false: no zone, ?lock=v1, ?freecam=v1), the row is off, or the link says `?lockswitch=v1`. Throws on a bad row. */
export function lockSwitchFor(soft: boolean, search = '', rows: Shipped = SHIPPED): LockSwitchRows | null {
  validateLockSwitch(rows.lockSwitch, rows.limits.lockSwitch);
  if (!soft || !rows.lockSwitch.on || new URLSearchParams(search).get(rows.lockSwitch.query) === rows.lockSwitch.off) return null;
  return rows.lockSwitch;
}

export type Press = { x: number; y: number; t: number; id: number };

/** A press is a tap when the same pointer lifts within tapMaxMs and moved no further than tapMaxMovePx (a drag is the look thumb's, a hold is nothing). */
export const isTap = (rows: LockSwitchRows, down: Press | null, up: Press): boolean =>
  !!down && down.id === up.id && up.t - down.t >= 0 && up.t - down.t <= rows.tapMaxMs && Math.hypot(up.x - down.x, up.y - down.y) <= rows.tapMaxMovePx;

/** The boss a tap at (x, y) picks: the nearest candidate whose screen point is within pickRadiusPx (ties to the earlier), never `held` (already locked); null = none (empty ground, a corpse). */
export function pickTarget(rows: LockSwitchRows, tap: { x: number; y: number }, candidates: readonly { index: number; x: number; y: number }[], held: number): number | null {
  let best: number | null = null, bestD = Infinity;
  for (const c of candidates) {
    if (c.index === held || !Number.isFinite(c.x) || !Number.isFinite(c.y)) continue;
    const d = Math.hypot(c.x - tap.x, c.y - tap.y);
    if (d <= rows.pickRadiusPx && d < bestD) { best = c.index; bestD = d; }
  }
  return best;
}

/**
 * The lock moves to attacker `target`: its fight becomes the held one with the hero as he stands, and the held fight (`current`, whose AI profile is `heldProfile`) becomes an attacker.
 * null when it cannot: the held fight is over, or `target` is not a live attacker. The list keeps its order otherwise (the old held boss takes the target's place).
 */
export function swapHeld(primary: Attacker['practice'], list: readonly Attacker[], current: number, target: number, heldProfile?: Attacker['profile']): { practice: Attacker['practice']; list: Attacker[]; index: number } | null {
  const a = list.find((x) => x.index === target && !x.dead);
  if (!a || primary.finish || target === current) return null;
  const old: Attacker = joinAttacker(current, primary, heldProfile);
  return { practice: adopt(a, primary.duel.fighters[0]), list: list.map((x) => (x === a ? old : x)), index: target };
}
