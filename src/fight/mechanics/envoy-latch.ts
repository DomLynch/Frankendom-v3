// LATCH, The Titan's Envoy's signature (profile `parasite`, data/mechanics.json `envoy-latch`). He crouches (the tell: a green line runs from him to the hero), lunges along it and latches on.
// Latched, the hero's stamina drains to a floor and his walk is slowed (no sprint) until he breaks it: ROLL, or land breakHits cuts inside breakWindowTicks, or the latch times out. Counters: a hit on
// the crouch cancels the lunge; GUARD the lunge and the Envoy bounces off, open; ROLL out of the line and he whiffs, open. Fair by construction: it never deals health, the stamina floor sits above the
// roll cost (the roll is always affordable), the latch is a crowd-control kind (cc-defs.json `latch`: full, half, quarter, then a harmless bump) and it ends the tick either body dies (the corpse cut).
// Reads the duel and the hero's intent, returns them changed (`pre`, before the tick); every blow, roll and guard is still stepDuel's. No per-tick allocation unless the hero is latched or the Envoy moves.
import { idleIntent, type CombatEvent, type Duel, type Fighter, type Intent } from '../duel.ts';
import { M } from '../detmath.ts';
import { RADIUS, STEP } from '../sim.ts';
import { ccApply, CC_LADDER, emptyLadder, type CcLadder } from '../cc-ladder.ts';
import MECHANICS from '../../../data/mechanics.json' with { type: 'json' };

export type EnvoyLatchRow = {
  type: 'envoy-latch'; boss: string;
  firstCooldownTicks: number; cooldownTicks: number; lungeMinM: number; lungeMaxM: number; tellTicks: number; lungeTicks: number; contactM: number; latchGapM: number;
  drainPerSecond: number; drainFloor: number; slowPct: number; breakHits: number; breakWindowTicks: number; maxLatchTicks: number; guardChipStamina: number;
  blockedRecoverTicks: number; whiffRecoverTicks: number; breakRecoverTicks: number; breakKnockM: number;
  tell: { colour: string; alpha: number; widthM: number; latchedAlpha: number; liftM: number; beyondM: number };
};
export const ENVOY_LATCH_ROW = (MECHANICS.mechanics as unknown as Record<string, EnvoyLatchRow>)['envoy-latch']!;

/** What the tell line draws this frame: `phase`, a line from the Envoy (from) to the hero (to) in metres, and `t` 0..1 through the phase. The object is reused: read it, never keep it. */
export type LatchView = { phase: 'tell' | 'lunge' | 'latched'; fromX: number; fromZ: number; toX: number; toZ: number; t: number };
/** The reused result of a step: the duel to step, the hero's intent to step it with, and whether the Envoy's own intent is replaced by standing still. */
export type LatchStep = { duel: Duel; intent: Intent; hold: boolean };
export type EnvoyLatch = { readonly id: string; step(duel: Duel, hero: Intent): LatchStep; view(): LatchView | null; reset(): void };

type Stage = 'idle' | 'tell' | 'lunge' | 'latched' | 'recover';
const PERCENT = 100, TICKS_PER_S = Math.round(1 / STEP);
const REST_HOLD = 2;   // stepDuel counts `rest` down before it regenerates: 2 in, 1 left, no regen this tick (the sprint's way, duel.ts)
const isHit = (e: CombatEvent): boolean => e.type === 'Hit' && e.actor === 0;   // the hero's blow that landed on the Envoy (a blocked or parried cut is not a hit)
const HOLD: Intent = idleIntent();   // stands and faces (lock): the Envoy's own intent while the mechanic holds him
/** The stepPractice layer (combat.ts) that stands the Envoy still for the tick: the crouch, the lunge, the recovery. */
export const heldBoss = (_duel: Duel, _warden: Intent): Intent => HOLD;

/** One Envoy's latch. `row` defaults to the shipped row; a test passes its own. */
export function createEnvoyLatch(row: EnvoyLatchRow = ENVOY_LATCH_ROW): EnvoyLatch {
  const out: LatchStep = { duel: undefined as unknown as Duel, intent: undefined as unknown as Intent, hold: false };
  const shown: LatchView = { phase: 'tell', fromX: 0, fromZ: 0, toX: 0, toZ: 0, t: 0 };
  const drain = row.drainPerSecond / TICKS_PER_S, slow = row.slowPct / PERCENT;
  let stage: Stage = 'idle', left = 0, cooldown = row.firstCooldownTicks, stepX = 0, stepZ = 0, latchTicks = 0, latchMax = 0, hits: number[] = [], ladder: CcLadder = emptyLadder, visible = false;

  const pass = (duel: Duel, intent: Intent, hold = false): LatchStep => { out.duel = duel; out.intent = intent; out.hold = hold; return out; };
  const show = (phase: LatchView['phase'], boss: Fighter, hero: Fighter, t: number): void => { visible = true; shown.phase = phase; shown.fromX = boss.body.x; shown.fromZ = boss.body.z; shown.toX = hero.body.x; shown.toZ = hero.body.z; shown.t = t; };
  const clampWall = (x: number, z: number, wall: number): [number, number] => { const r = M.hypot(x, z); return r > wall ? [x * wall / r, z * wall / r] : [x, z]; };
  const settle = (next: Stage, ticks: number, after: number): void => { stage = next; left = ticks; cooldown = after; visible = false; };
  // The Envoy shoved `metres` straight away from the hero, stood in `body`.
  const shoved = (boss: Fighter, hero: Fighter, metres: number, wall: number): Fighter => {
    const dx = boss.body.x - hero.body.x, dz = boss.body.z - hero.body.z, gap = M.hypot(dx, dz) || 1, [x, z] = clampWall(boss.body.x + dx / gap * metres, boss.body.z + dz / gap * metres, wall);
    return { ...boss, body: { ...boss.body, x, z } };
  };

  return {
    id: 'envoy-latch',
    reset(): void { stage = 'idle'; left = 0; cooldown = row.firstCooldownTicks; latchTicks = 0; latchMax = 0; hits = []; ladder = emptyLadder; visible = false; },
    view: () => (visible ? shown : null),
    step(duel, intent) {
      const [hero, boss] = duel.fighters, wall = duel.radius ?? RADIUS;
      if (duel.finish || hero.health <= 0 || boss.health <= 0) { if (stage !== 'idle') { stage = 'idle'; visible = false; hits = []; } return pass(duel, intent); }   // the corpse cut: a death ends the latch the same tick
      const dx = hero.body.x - boss.body.x, dz = hero.body.z - boss.body.z, gap = M.hypot(dx, dz);

      if (stage === 'idle') {
        if (cooldown > 0) { cooldown--; return pass(duel, intent); }
        if (boss.phase !== 'ready' || boss.special || gap < row.lungeMinM || gap > row.lungeMaxM || hero.phase === 'dead') return pass(duel, intent);
        stage = 'tell'; left = row.tellTicks;
      }

      if (stage === 'tell') {
        if (boss.phase === 'hurt') { settle('idle', 0, row.cooldownTicks); return pass(duel, intent); }   // a cut on the crouch breaks the lunge
        show('tell', boss, hero, 1 - left / row.tellTicks);
        if (--left > 0) return pass(duel, intent, true);
        const run = Math.max(0, gap - row.latchGapM) / row.lungeTicks;   // the lunge runs the line as it stood at the end of the crouch, so a hero who has left it is not followed
        stepX = gap ? dx / gap * run : 0; stepZ = gap ? dz / gap * run : 0; stage = 'lunge'; left = row.lungeTicks;
      }

      if (stage === 'lunge') {
        const [x, z] = clampWall(boss.body.x + stepX, boss.body.z + stepZ, wall), lunged: Fighter = { ...boss, body: { ...boss.body, x, z, heading: M.atan2(stepX, stepZ) } };
        const near = M.hypot(hero.body.x - x, hero.body.z - z) <= row.contactM;
        show('lunge', lunged, hero, 1 - left / row.lungeTicks);
        if (near || --left <= 0) {
          if (!near || hero.phase === 'roll') { settle('recover', row.whiffRecoverTicks, row.cooldownTicks); return pass({ ...duel, fighters: [hero, lunged] }, intent, true); }   // out of the line, or rolled through it: he whiffs, open
          if (hero.phase === 'guard') {   // guarded: he bounces off, chips the stamina and stands open
            settle('recover', row.blockedRecoverTicks, row.cooldownTicks);
            return pass({ ...duel, fighters: [{ ...hero, stamina: Math.max(0, hero.stamina - row.guardChipStamina), rest: Math.max(hero.rest, REST_HOLD) }, shoved(lunged, hero, row.breakKnockM, wall)] }, intent, true);
          }
          const landed = ccApply(ladder, 'latch', duel.tick, row.maxLatchTicks, CC_LADDER);
          ladder = landed.ladder;
          if (!landed.ticks) { settle('recover', row.whiffRecoverTicks, row.cooldownTicks); return pass({ ...duel, fighters: [hero, shoved(lunged, hero, row.breakKnockM, wall)] }, intent, true); }   // the ladder is spent: a harmless bump
          stage = 'latched'; latchTicks = 0; latchMax = landed.ticks; hits = [];
          return pass({ ...duel, fighters: [hero, lunged] }, intent);
        }
        return pass({ ...duel, fighters: [hero, lunged] }, intent, true);
      }

      if (stage === 'latched') {
        for (const e of duel.events) if (isHit(e)) hits.push(duel.tick);
        while (hits.length && duel.tick - hits[0]! > row.breakWindowTicks) hits.shift();
        if (hero.phase === 'roll' || hits.length >= row.breakHits || latchTicks >= latchMax) {   // broken (roll or cuts) or timed out: he is thrown off and stands open
          settle('recover', row.breakRecoverTicks, row.cooldownTicks); hits = [];
          return pass({ ...duel, fighters: [hero, shoved(boss, hero, row.breakKnockM, wall)] }, intent, true);
        }
        latchTicks++;
        const [x, z] = clampWall(hero.body.x - (gap ? dx / gap : 0) * row.latchGapM, hero.body.z - (gap ? dz / gap : 0) * row.latchGapM, wall);   // rides on the hero on the side he latched
        const riding: Fighter = { ...boss, body: { ...boss.body, x, z } };
        const drained: Fighter = { ...hero, stamina: Math.max(Math.min(hero.stamina, row.drainFloor), hero.stamina - drain), rest: Math.max(hero.rest, REST_HOLD) };   // never below the floor (and never lifted to it); no regen while latched
        show('latched', riding, hero, latchTicks / latchMax);
        const walking = hero.phase !== 'roll' && intent.action !== 'dodge';   // a roll keeps its own direction and speed
        return pass({ ...duel, fighters: [drained, riding] }, walking ? { ...intent, move: { x: intent.move.x * slow, z: intent.move.z * slow, yaw: intent.move.yaw, run: false } } : intent);
      }

      if (--left <= 0) { stage = 'idle'; visible = false; }   // recover: he stands open, then the cooldown runs
      return pass(duel, intent, true);
    },
  };
}
