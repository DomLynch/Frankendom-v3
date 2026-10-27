// The soft lock (Dom 2026-10-28, on his phone: "free looking: change your direction and RUN in any direction ... I can only BACKSTEP"; ruling: keep the lock-on in combat, but a SOFT one, breakable, not too easy).
// The lock (the pair camera, the hero facing the foe and strafing / backstepping, duel.ts `lock`) holds by default. It BREAKS when the stick is pushed away from the foe beyond breakAngleDeg and held for commitSeconds
// (a tap or a drift does not), or a roll is pointed away beyond the same angle; it also lets go when nobody is fighting him (the target died, or went past its leash). A break costs stamina and is refused while the
// hero is hurt or knocked down, while the foe's attack is live, before minEngageSeconds, or with too little stamina. A broken lock gives the camera to the player (look any way) and the hero turns to face the way he runs
// (the sim is asked for lock:false, which is its own existing free-facing). It re-locks on an attack press, or when the stick runs back toward the foe (relockAngleDeg, relockSeconds). Input, camera and the hero's
// facing only: the duel sim is untouched. ?lock=v1 = the old hard lock. Every number is a row (data/respawn.json lockBreak). Target switching (a tap on another boss) is a hook, not wired: see switchTarget below.
import ROWS from '../../data/respawn.json' with { type: 'json' };
import { wrapAngle } from './sim.ts';

export type LockBreakRows = {
  on: boolean; query: string; off: string;
  breakAngleDeg: number;       // the stick must point this far from the foe (0 = at him, 180 = straight away) to break the lock
  minPush: number;             // the stick must be pushed at least this far (0..1) to count
  commitSeconds: number;       // ... and held this long; a tap or drift resets
  staminaCost: number;         // spent when the lock breaks (the sim's stamina points; a roll costs 30)
  minEngageSeconds: number;    // no break before the fight is this old
  relockAngleDeg: number;      // a stick pointing within this of the foe ...
  relockSeconds: number;       // ... for this long locks on again
};
export type LockBreakLimits = { [K in keyof Omit<LockBreakRows, 'on' | 'query' | 'off'>]: [number, number] };

/** Throws on a bad lock-break row. */
export function validateLockBreak(rows: LockBreakRows, limits: LockBreakLimits): void {
  for (const k of Object.keys(limits) as (keyof LockBreakLimits)[]) {
    const v = rows[k], [lo, hi] = limits[k];
    if (!(Number.isFinite(v) && v >= lo && v <= hi)) throw new Error(`respawn.json lockBreak.${k} ${v} is not in ${lo}..${hi}`);
  }
  if (typeof rows.on !== 'boolean') throw new Error('respawn.json lockBreak.on is true or false');
  if (!rows.query || !rows.off) throw new Error('respawn.json lockBreak.query and off are words');
  if (!(rows.relockAngleDeg < rows.breakAngleDeg)) throw new Error('respawn.json lockBreak.relockAngleDeg must be smaller than breakAngleDeg');
}

type Shipped = { lockBreak: LockBreakRows; limits: { lockBreak: LockBreakLimits } };
const SHIPPED = ROWS as unknown as Shipped;

/** The rows this page plays: null when the zone loop is off (`zone` false), the row is off, or the link says `?lock=v1`. Throws on a bad row. */
export function lockBreakFor(zone: boolean, search = '', rows: Shipped = SHIPPED): LockBreakRows | null {
  validateLockBreak(rows.lockBreak, rows.limits.lockBreak);
  if (!zone || !rows.lockBreak.on || new URLSearchParams(search).get(rows.lockBreak.query) === rows.lockBreak.off) return null;
  return rows.lockBreak;
}

/** The world direction of the stick under a view yaw (the sim's own mapping, sim.ts advance), or null when it is at rest. */
export function stickWorld(stick: { x: number; z: number }, yaw: number): { x: number; z: number; length: number } | null {
  const length = Math.hypot(stick.x, stick.z);
  if (!length || !Number.isFinite(length) || !Number.isFinite(yaw)) return null;
  return { x: (stick.x * Math.cos(yaw) + stick.z * Math.sin(yaw)) / length, z: (-stick.x * Math.sin(yaw) + stick.z * Math.cos(yaw)) / length, length: Math.min(1, length) };
}

/** Degrees between where the stick points (world) and the direction from the hero to the foe: 0 = at him, 180 = straight away. */
export function awayAngleDeg(dir: { x: number; z: number }, hero: { x: number; z: number }, foe: { x: number; z: number }): number {
  const fx = foe.x - hero.x, fz = foe.z - hero.z;
  if (!fx && !fz) return 0;
  return Math.abs(wrapAngle(Math.atan2(dir.x, dir.z) - Math.atan2(fx, fz))) * 180 / Math.PI;
}

export type LockState = { broken: boolean; engagedFor: number; away: number; toward: number };
export const freshLock = (): LockState => ({ broken: false, engagedFor: 0, away: 0, toward: 0 });

export type LockFrame = {
  dt: number; fighting: boolean;                      // fighting: a boss (or an attacker) is engaged with him
  stick: { x: number; z: number }; yaw: number; hero: { x: number; z: number }; foe: { x: number; z: number };
  action: string | null; heroPhase: string; heroDown: boolean; foePhase: string; stamina: number;
};
const ATTACKS = new Set(['light', 'light_left', 'light_right', 'heavy', 'thrust', 'kick', 'heavy_right', 'heavy_left', 'heavy_thrust', 'skill', 'skill2']);

/** Whether a break may happen now: not hurt or knocked down, not under the foe's live attack, engaged long enough, and enough stamina. */
export const mayBreak = (rows: LockBreakRows, s: LockState, f: LockFrame): boolean =>
  f.fighting && s.engagedFor >= rows.minEngageSeconds && f.heroPhase !== 'hurt' && f.heroPhase !== 'dead' && !f.heroDown && f.foePhase !== 'attack' && f.stamina >= rows.staminaCost;

/** One sim tick of the soft lock. `cost` is the stamina to take this tick (0 unless the lock just broke). Pure: returns the next state. */
export function stepLock(rows: LockBreakRows, s: LockState, f: LockFrame): { state: LockState; cost: number } {
  if (!f.fighting) return { state: freshLock(), cost: 0 };   // the target died or went past its leash (or nobody engaged): the next fight starts locked
  const next: LockState = { ...s, engagedFor: s.engagedFor + f.dt };
  const dir = stickWorld(f.stick, f.yaw), angle = dir ? awayAngleDeg(dir, f.hero, f.foe) : 0, pushed = !!dir && dir.length >= rows.minPush;
  if (s.broken) {
    next.toward = pushed && angle <= rows.relockAngleDeg ? s.toward + f.dt : 0;
    if ((f.action && ATTACKS.has(f.action)) || next.toward >= rows.relockSeconds) return { state: { ...next, broken: false, away: 0, toward: 0 }, cost: 0 };
    return { state: next, cost: 0 };
  }
  const rollAway = f.action === 'dodge' && !!dir && angle >= rows.breakAngleDeg;
  next.away = pushed && angle >= rows.breakAngleDeg ? s.away + f.dt : 0;
  if ((rollAway || next.away >= rows.commitSeconds) && mayBreak(rows, next, f)) return { state: { ...next, broken: true, away: 0, toward: 0 }, cost: rows.staminaCost };
  return { state: next, cost: 0 };
}

/** The practice with `cost` taken off the hero's stamina (input side only, the sim's rules are untouched); the same object when there is nothing to take. */
export function spendStamina<P extends { duel: { fighters: readonly [{ stamina: number }, { stamina: number }] } }>(practice: P, cost: number): P {
  if (!(cost > 0)) return practice;
  const [hero, foe] = practice.duel.fighters;
  return { ...practice, duel: { ...practice.duel, fighters: [{ ...hero, stamina: Math.max(0, hero.stamina - cost) }, foe] } };
}

/** HOOK, not wired: a tap on another standing boss would lock onto him. The zone page holds one foe in the duel sim at a time (main.ts hand()), so a switch is hand(index, hero) for the tapped spawn; a tap picker is the missing part. */
export const switchTarget = null;
