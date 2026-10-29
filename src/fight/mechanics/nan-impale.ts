// Nan the Impaler's signature move, IMPALE AND DRAG (Dom 2026-10-28; row data/mechanics.json "nan-impale"). One telegraphed blow the sim itself resolves:
//   TELL    she starts a heavy stab (the sim's `heavy_thrust`) and HOLDS it chambered (Intent.held, the engine's own charge: parked long enough it is a charged blow). A ground line shows the stab's path;
//           it follows her aim until the last `freezeTicks` of the hold, then freezes red where the blow will go.
//   LUNGE   she lets the stab go and runs down the frozen line (this layer moves her body, `lungeSpeed` m/tick); the engine decides whether it lands, is dodged, blocked or parried, exactly as for any blow.
//   DRAG    if it landed (Hit or GuardBroken) she hooks him and pulls him `dragM` toward her over `dragTicks`.
//   FOLLOW  one poke (`followMove`, the thrust row) once she is ready again, if it is within `followWithinTicks`.
// Counters (all engine rules, none added here): roll out of the frozen line (the stab meets the roll's invulnerable ticks or empty air), parry it, or hit her during the hold (she is `hurt`, the move is cancelled
// and the cooldown is the shorter `abortCooldownTicks`). Damage is the stab's and the poke's own rows, so stars, ring multipliers, difficulty and the Daily Pit scale it like any blow; there is no instant kill.
// A dead boss, a dead hero or a finished duel stops it cleanly. Fixed ticks, no dice, no per-frame allocation beyond the duel copy a moved body needs.
import { distance, idleIntent, legal, type Duel, type Fighter, type Intent } from '../duel.ts';
import { RADIUS, type State } from '../sim.ts';
import { M } from '../detmath.ts';
import * as THREE from 'three';
import type { Practice } from '../combat.ts';
import type { Mechanic, MechanicView } from './types.ts';
import type { MechanicRuntime } from './runtime.ts';
import { createLineFx } from './line-fx.ts';

export type ImpaleRow = {
  boss: string; move: 'heavy_thrust'; followMove: 'thrust';
  firstTicks: number; cooldownTicks: number; abortCooldownTicks: number;
  gapMin: number; gapMax: number; backTo: number; backSpeed: number; parkTicks: number; freezeTicks: number;
  lungeSpeed: number; lungeTicks: number; stopGap: number;
  dragM: number; dragTicks: number; dragStop: number; followWithinTicks: number;
  lineWidth: number; lineColour: string;
  giveUpTicks: number; wallPadM: number; lineOvershootM: number; lungeGraceTicks: number; attackStartTicks: number;   // a tell that never parks is dropped after giveUpTicks; the arena wall's pad; the drawn line's length past the stop gap; the stab's grace after the lunge; ticks before the attack phase must show
};
const IDLE = 0, TELL = 1, LUNGE = 2, DRAG = 3, FOLLOW = 4;
const NAMES = ['idle', 'tell', 'lunge', 'drag', 'follow'] as const;

export function createNanImpale(row: ImpaleRow): Mechanic {
  const s = { stage: IDLE, t: 0, cd: row.firstTicks, last: -1, dx: 0, dz: 1, locked: false, x: 0, z: 0, charge: 0 };
  const v: MechanicView = { id: 'nan-impale', stage: 'idle', t: 0, of: 1, lock: false, x: 0, z: 0, dx: 0, dz: 1, length: row.lungeSpeed * row.lungeTicks + row.stopGap + row.lineOvershootM, width: row.lineWidth, colour: row.lineColour };
  const halt = (cooldown: number): void => { s.stage = IDLE; s.t = 0; s.cd = cooldown; s.locked = false; };
  const reset = (): void => { halt(row.firstTicks); s.last = -1; };
  const inWall = (duel: Duel, x: number, z: number): boolean => M.hypot(x, z) <= (duel.radius ?? RADIUS) - row.wallPadM;
  const moved = (b: State, x: number, z: number, heading = b.heading): State => ({ ...b, x, z, heading });

  function layer(duel: Duel, warden: Intent): Intent {
    if (duel.tick < s.last) reset();   // a new duel (a retry, a respawn) starts the clock over
    s.last = duel.tick;
    const hero = duel.fighters[0], me = duel.fighters[1];
    if (duel.finish || me.phase === 'dead' || hero.phase === 'dead' || me.health <= 0 || hero.health <= 0) { if (s.stage !== IDLE) halt(row.cooldownTicks); return warden; }   // a fallen boss (or hero) ends it cleanly
    s.x = me.body.x; s.z = me.body.z; s.charge = me.charge;
    if (s.stage === IDLE) {
      if (s.cd > 0) { s.cd--; return warden; }
      const gap = distance(me.body, hero.body);
      if (me.phase !== 'ready' || gap < row.gapMin || gap > row.gapMax || !legal(me, row.move)) return warden;
      s.stage = TELL; s.t = 0; s.locked = false;
    }
    switch (s.stage) {
      case TELL: {
        if (me.phase === 'hurt' || s.t > row.giveUpTicks || (s.t > 0 && me.phase !== 'attack')) { halt(row.abortCooldownTicks); return warden; }   // she was hit (or thrown off) in the hold: it is cancelled
        const ready = me.charge >= row.parkTicks;
        if (ready) { s.stage = LUNGE; s.t = 0; return { ...idleIntent(), held: false, lock: false }; }
        const frozen = me.charge >= row.parkTicks - row.freezeTicks;
        if (frozen) s.locked = true;
        if (!s.locked) { s.dx = M.sin(me.body.heading); s.dz = M.cos(me.body.heading); }   // the line follows her aim until the freeze, then stays
        s.t++;
        return { ...idleIntent(), action: s.t === 1 ? row.move : null, held: true, lock: !frozen };
      }
      case LUNGE:
        s.t++;
        if (s.t > row.lungeTicks + row.lungeGraceTicks || (s.t > row.attackStartTicks && me.phase !== 'attack')) { halt(row.cooldownTicks); return warden; }   // the stab has run its course without landing
        return { ...idleIntent(), held: false, lock: false };
      case DRAG:
        s.t++;
        if (s.t >= row.dragTicks) { s.stage = FOLLOW; s.t = 0; }
        return { ...idleIntent(), lock: true };
      default: {   // FOLLOW
        s.t++;
        if (s.t > row.followWithinTicks) { halt(row.cooldownTicks); return warden; }
        if (me.phase !== 'ready' || !legal(me, row.followMove)) return { ...idleIntent(), lock: true };
        halt(row.cooldownTicks);
        return { ...idleIntent(), action: row.followMove, lock: true };
      }
    }
  }

  const landed = (stepped: Duel): boolean => stepped.events.some((e) => (e.type === 'Hit' || e.type === 'GuardBroken') && e.actor === 1 && e.target === 0 && e.move === row.move);

  function settle(_prior: Duel, stepped: Duel): Duel {
    if (s.stage !== LUNGE && s.stage !== DRAG && s.stage !== TELL) return stepped;
    const hero = stepped.fighters[0] as Fighter, me = stepped.fighters[1] as Fighter;
    if (s.stage === TELL) {   // a spear wants room: while the aim still follows, she backs away from him to `backTo` (the held stab keeps its pose; the line is what she is lining up)
      const away = distance(me.body, hero.body);
      if (s.locked || me.phase !== 'attack' || !(away > 0) || away >= row.backTo) return stepped;
      const back = Math.min(row.backSpeed, row.backTo - away), x = me.body.x + ((me.body.x - hero.body.x) / away) * back, z = me.body.z + ((me.body.z - hero.body.z) / away) * back;
      return inWall(stepped, x, z) ? { ...stepped, fighters: [hero, { ...me, body: moved(me.body, x, z) }] } : stepped;
    }
    if (s.stage === LUNGE) {
      if (landed(stepped)) { s.stage = DRAG; s.t = 0; return stepped; }
      if (s.t > row.lungeTicks || me.phase !== 'attack') return stepped;
      const along = (hero.body.x - me.body.x) * s.dx + (hero.body.z - me.body.z) * s.dz;   // how far down the line he stands: past her, she has run by him
      const step = Math.min(row.lungeSpeed, along - row.stopGap);
      if (!(step > 0)) return stepped;
      const x = me.body.x + s.dx * step, z = me.body.z + s.dz * step;
      if (!inWall(stepped, x, z)) return stepped;
      return { ...stepped, fighters: [hero, { ...me, body: moved(me.body, x, z, M.atan2(s.dx, s.dz)) }] };
    }
    const gap = distance(me.body, hero.body), step = Math.min(row.dragM / row.dragTicks, gap - row.dragStop);
    if (!(step > 0) || gap <= 0) return stepped;
    const x = hero.body.x + ((me.body.x - hero.body.x) / gap) * step, z = hero.body.z + ((me.body.z - hero.body.z) / gap) * step;
    return { ...stepped, fighters: [{ ...hero, body: moved(hero.body, x, z) }, me] };
  }

  function view(): MechanicView | null {
    if (s.stage === IDLE) return null;
    v.stage = NAMES[s.stage]!; v.lock = s.locked || s.stage !== TELL; v.x = s.x; v.z = s.z;
    v.t = s.stage === TELL ? s.charge : s.t; v.of = s.stage === TELL ? row.parkTicks : s.stage === LUNGE ? row.lungeTicks : s.stage === DRAG ? row.dragTicks : row.followWithinTicks;
    v.dx = s.dx; v.dz = s.dz;
    return v;
  }
  return { id: 'nan-impale', reset, layer, settle, view };
}

/** The registry's runtime (type "nan-impale"): the page applies `layer` and `settle` around the sim tick while this boss is engaged (src/client/main.ts), `tick` wipes the move when he is not, `frame` draws the ground line. */
export function createNanImpaleRuntime(row: ImpaleRow): MechanicRuntime {
  const core = createNanImpale(row), group = new THREE.Group(), line = createLineFx(group);
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
