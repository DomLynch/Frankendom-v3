// KACHUJIN'S SHADOW DASH (ring 2; row data/mechanics.json "shadow-dash"). One telegraphed body dash the sim resolves for the cut:
//   TELL     he stops; a ground line runs from him to where you stand and follows you until it LOCKS `lockBeforeTicks` before he goes (it freezes where you stood).
//   DASH     he runs the locked line at `dashSpeedMps` and stops `stopGapM` short of the locked point (or short of you, if you walked into it): this layer moves his body, nothing else.
//   CUT      if you are within `slashReachM` when he arrives he throws one ordinary `slashAction` (the engine's wind-up, guard, parry, roll and damage rules decide it); outside it he throws nothing.
//   RECOVER  `recoverTicks` in which he starts nothing: the punish window.
// Counters (all engine rules, none added here): leave the line (the dash overshoots, no cut), roll the cut, guard or parry it; a stagger cancels the move (the cooldown starts). Damage is the cut's own row, so stars,
// ring multipliers and the Daily Pit scale it like any blow. A dead boss, a dead hero or a finished duel stops it cleanly. Fixed ticks, detmath only, no dice, no per-frame allocation beyond the duel copy a moved body needs.
import { M } from '../detmath.ts';
import { legal, type Duel, type Fighter, type Intent } from '../duel.ts';
import { RADIUS, STEP } from '../sim.ts';
import * as THREE from 'three';
import type { Practice } from '../combat.ts';
import type { Mechanic, MechanicView } from './types.ts';
import type { MechanicRuntime } from './runtime.ts';
import { createLineFx } from './line-fx.ts';

export type ShadowDashRow = {
  boss: string; slashAction: 'light' | 'thrust' | 'heavy';
  firstTicks: number; cooldownTicks: number; triggerMinM: number; triggerMaxM: number;
  tellTicks: number; lockBeforeTicks: number; dashSpeedMps: number; dashMaxTicks: number; stopGapM: number;
  slashReachM: number; slashMaxTicks: number; recoverTicks: number; lineWidth: number; lineColour: string;
};
const IDLE = 0, TELL = 1, DASH = 2, SLASH = 3, RECOVER = 4;
const NAMES = ['idle', 'tell', 'lunge', 'lunge', 'idle'] as const;   // the shared ground line draws the tell and the dash; a cut and the recovery draw nothing

export function createShadowDash(row: ShadowDashRow): Mechanic {
  const s = { stage: IDLE, t: 0, cd: row.firstTicks, last: -1, locked: false, moving: false, fired: false, seen: false,
    fromX: 0, fromZ: 0, dx: 0, dz: 1, reach: 0, stopX: 0, stopZ: 0, bx: 0, bz: 0, hx: 0, hz: 0 };
  const v: MechanicView = { id: 'shadow-dash', stage: 'idle', t: 0, of: 1, lock: false, x: 0, z: 0, dx: 0, dz: 1, length: 1, width: row.lineWidth, colour: row.lineColour };
  const halt = (cooldown: number): void => { s.stage = IDLE; s.t = 0; s.cd = cooldown; s.locked = false; s.moving = false; };
  const reset = (): void => { halt(row.firstTicks); s.last = -1; };
  const still = (warden: Intent, action: Intent['action'] = null): Intent => ({ ...warden, move: { x: 0, z: 0, yaw: 0, run: false }, action, guard: false });

  function layer(duel: Duel, warden: Intent): Intent {
    if (duel.tick < s.last) reset();   // a new duel (a retry, a respawn) starts the clock over
    s.last = duel.tick; s.moving = false;
    const hero = duel.fighters[0], me = duel.fighters[1];
    s.bx = me.body.x; s.bz = me.body.z; s.hx = hero.body.x; s.hz = hero.body.z;
    if (duel.finish || hero.health <= 0 || me.health <= 0 || me.phase === 'dead') { if (s.stage !== IDLE) halt(row.cooldownTicks); return warden; }   // a kill ends it (the corpse is not dashed)
    if (s.stage !== IDLE && me.phase === 'hurt') { halt(row.cooldownTicks); return warden; }   // a stagger cancels it
    const gap = M.hypot(s.hx - s.bx, s.hz - s.bz);
    if (s.stage === IDLE) {
      if (s.cd > 0) { s.cd--; return warden; }
      if (me.phase !== 'ready' || me.special || gap < row.triggerMinM || gap > row.triggerMaxM) return warden;
      s.stage = TELL; s.t = 0; s.locked = false;
    }
    if (s.stage === TELL) {
      if (!s.locked && s.t >= row.tellTicks - row.lockBeforeTicks) {   // the line freezes: where you stand NOW is where he goes
        s.locked = true; s.fromX = s.bx; s.fromZ = s.bz;
        const dx = s.hx - s.bx, dz = s.hz - s.bz, d = M.hypot(dx, dz) || 1;
        s.reach = Math.max(0, Math.min(d - row.stopGapM, row.dashMaxTicks * row.dashSpeedMps * STEP));
        s.dx = dx / d; s.dz = dz / d; s.stopX = s.bx + s.dx * s.reach; s.stopZ = s.bz + s.dz * s.reach;
      }
      if (s.t >= row.tellTicks) { s.stage = DASH; s.t = 0; } else { s.t++; return still(warden); }
    }
    if (s.stage === DASH) { s.moving = true; return still(warden); }   // settle() runs the body
    if (s.stage === SLASH) {
      if (!s.fired) {
        s.fired = true;
        if (me.phase === 'ready' && gap <= row.slashReachM && legal(me, row.slashAction)) return still(warden, row.slashAction);
        s.stage = RECOVER; s.t = 0;   // you left the line: no cut, he is open
      } else {
        s.t++;
        if (me.phase === 'attack') s.seen = true;
        if ((s.seen && me.phase !== 'attack') || s.t > row.slashMaxTicks || (!s.seen && s.t > 3)) { s.stage = RECOVER; s.t = 0; }
        else return still(warden);
      }
    }
    // RECOVER
    if (s.t >= row.recoverTicks) { halt(row.cooldownTicks); return warden; }
    s.t++;
    return still(warden);
  }

  /** After the sim stepped: while he dashes, his body runs the locked line (heading follows it); the tick he arrives the cut stage starts. `prior` is the duel the tick began on. */
  function settle(prior: Duel, stepped: Duel): Duel {
    if (!s.moving || s.stage !== DASH) return stepped;
    const hero = prior.fighters[0] as Fighter, b = (prior.fighters[1] as Fighter).body;
    const left = M.hypot(s.stopX - b.x, s.stopZ - b.z), stride = Math.min(row.dashSpeedMps * STEP, left);
    let x = b.x + s.dx * stride, z = b.z + s.dz * stride;
    const wall = prior.radius ?? RADIUS, r = M.hypot(x, z);
    if (r > wall) { x *= wall / r; z *= wall / r; }
    s.t++;
    if (left - stride <= 0 || s.t >= row.dashMaxTicks || M.hypot(hero.body.x - x, hero.body.z - z) <= row.stopGapM) { s.stage = SLASH; s.t = 0; s.fired = false; s.seen = false; }
    const foe = stepped.fighters[1] as Fighter;
    return { ...stepped, fighters: [stepped.fighters[0], { ...foe, body: { ...foe.body, x, z, heading: M.atan2(s.dx, s.dz), distance: foe.body.distance + stride } }] };
  }

  function view(): MechanicView | null {
    if (s.stage !== TELL && s.stage !== DASH) return null;
    v.stage = NAMES[s.stage]!; v.lock = s.locked; v.t = s.t;
    if (s.locked) { v.x = s.fromX; v.z = s.fromZ; v.dx = s.dx; v.dz = s.dz; v.length = s.reach + row.stopGapM; v.of = s.stage === TELL ? row.tellTicks : row.dashMaxTicks; }
    else {   // the line still follows him: from the boss to where the hero stands now
      const dx = s.hx - s.bx, dz = s.hz - s.bz, d = M.hypot(dx, dz) || 1;
      v.x = s.bx; v.z = s.bz; v.dx = dx / d; v.dz = dz / d; v.length = d; v.of = row.tellTicks;
    }
    return v;
  }
  return { id: 'shadow-dash', reset, layer, settle, view };
}

/** The registry's runtime (type "shadow-dash"): the page applies `layer` and `settle` around the sim tick while this boss is engaged, `tick` wipes the move when he is not, `frame` draws the shared ground line. */
export function createShadowDashRuntime(row: ShadowDashRow): MechanicRuntime {
  const core = createShadowDash(row), group = new THREE.Group(), line = createLineFx(group);
  let tick = 0;
  return {
    boss: row.boss, group, core, ctx: null,
    reset: () => core.reset(),
    layer(duel: Duel, warden: Intent): Intent { tick = duel.tick; return core.layer(duel, warden); },
    settle: (prior: Duel, stepped: Duel): Duel => core.settle(prior, stepped),
    tick(practice: Practice, on: boolean): Practice { if (!on) core.reset(); return practice; },
    frame: () => line.update(core.view(), 0, tick),
  };
}
