import { RULES, SKILL_MOVE } from './moves.ts';
import type { CombatEvent, Fighter } from './duel.ts';
import type { OpponentId } from '../roster.ts';
import { SPECIAL_RECOVER } from './special-look.ts';   // Combat's: the caster's return to stance runs on the same 45 ticks

// Hades' Shadow, the presentation timeline (Finishers with Combat, 2026-09-29; brief docs/briefs/special-moves-hades-pilot.md). Three-free,
// like special-look.ts beside it. Ticks at the sim's 60 Hz from the SpecialStarted tick: the strike
// lands on SpecialLanded at start + RULES.special.windup − 1 (the cast tick counts), so the windup stays the one source of the 120.
export const DROP_TICKS = 24;   // the cloud's drop onto the head, ending on the landing tick
export { SPECIAL_RECOVER };
export const LAND_AT = RULES.special.windup - 1;
export const FALL_AT = LAND_AT - DROP_TICKS;
export const RIPPLE = 30;   // Shield Quake: the ticks the ground ripple runs, the slam to the landing (0.5 s; Dom: a 1-2 s build-up was too slow)
export const SLAM_AT = LAND_AT - RIPPLE;   // ...and the tick after the cast starts when the shield's rim meets the sand (the pose in scene.ts is timed to it)
// A wind-up that releases on an already-dead target ends with no sim event (Auditer P3 on #1186): every cast has a hard timeout, wind-up + recover + this
// margin, after which it force-ends and the effect restores, so a cast with no end never holds its effect into the next fight.
export const CAST_MARGIN = 60;
// Seven Cuts (the Nightborn's ranks 4-7, special-fx-nightborn.ts): the flurry is one stroke every CUT_GAP ticks, the seventh (the thrust) on the strike tick.
export const CUTS = 7, CUT_GAP = 4;
export const cutAt = (i: number) => LAND_AT - (CUTS - 1 - i) * CUT_GAP;   // the tick (from the cast's start) stroke i lands

// Which cast gets the shadow: Hades is the Nightborn's rank-9 boss, the opponent's side, on his class skill. Every other special draws nothing
// until it has its own art.
export const isHadesShadow = (opponent: OpponentId, actor: number, move?: string) => opponent === 'nightborn' && actor === 1 && move === 'skill_lunge';

// The Centurion's rank-10 boss special, Blood Tithe (Mars): the veteran's Scutum Shove skill on the opponent's side, previewed only on ?special=tithe: Blood Tithe passes this as advanceCast's `is`, so Hades' Shadow (the default test) never draws on the Centurion.
export const isBloodTithe = (opponent: OpponentId, actor: number, move?: string) => opponent === 'veteran' && actor === 1 && move === 'skill_shove';

export type SpecialKind = 'hades' | 'set';   // which art draws the cast; the timeline below is the same for both (the one 120)
export type Cast = { actor: number; start: number; landed: number | null; fizzled: number | null };
export type ShadowPhase = { phase: 'gather' | 'fall' | 'recover' | 'dissolve' | 'done'; k: number; age: number };

// Where a cast is at sim time `now` (fractional ticks allowed): the cloud gathers above the head from the start, drops onto it so it arrives on the
// landing tick; after SpecialLanded it covers the head, then thins and clears, after SpecialFizzled it dissolves where it hangs. k runs 0..1 in each phase.
export function shadowPhase(cast: Cast, now: number): ShadowPhase {
  const end = cast.landed ?? cast.fizzled;
  if (end !== null) {
    const age = now - end, k = age / SPECIAL_RECOVER;
    return { phase: k >= 1 ? 'done' : cast.landed !== null ? 'recover' : 'dissolve', k: Math.min(1, Math.max(0, k)), age };
  }
  const age = now - cast.start;
  if (age >= LAND_AT + SPECIAL_RECOVER + CAST_MARGIN) return { phase: 'done', k: 1, age };
  if (age < FALL_AT) return { phase: 'gather', k: Math.max(0, age / FALL_AT), age };
  return { phase: 'fall', k: Math.min(1, (age - FALL_AT) / DROP_TICKS), age };   // held at the head until the landing event arrives
}

// Fold one frame of sim events (and the fighters' own windup counters, so a cast begun before the effect loaded still draws) into the cast.
// `is`: which cast the effect is for. Hades' Shadow by default; another move's effect passes its own test (opponent, actor, move id), so a lane adds its special
// without editing this timeline.
export function advanceCast(cast: Cast | null, events: readonly CombatEvent[], fighters: readonly [Fighter, Fighter], tick: number, opponent: OpponentId, yielding: boolean, is: typeof isHadesShadow = isHadesShadow): Cast | null {
  for (const event of events) {
    const e = event as CombatEvent & { actor?: number; move?: string };
    if (e.type === 'SpecialStarted' && !yielding && is(opponent, e.actor ?? -1, e.move)) cast = { actor: e.actor!, start: e.tick, landed: null, fizzled: null };
    else if (cast && e.actor === cast.actor && cast.landed === null && cast.fizzled === null) {
      if (e.type === 'SpecialLanded') cast = { ...cast, landed: e.tick };
      else if (e.type === 'SpecialFizzled' || e.type === 'SpecialInterrupted') cast = { ...cast, fizzled: e.tick };
    }
  }
  const caster = fighters[1];
  if (!cast && !yielding && caster.special && is(opponent, 1, caster.skill ? SKILL_MOVE[caster.skill] : undefined))
    cast = { actor: 1, start: tick - (RULES.special.windup - caster.special), landed: null, fizzled: null };
  return cast && shadowPhase(cast, tick).phase === 'done' ? null : cast;
}
// Red Wind reads the same phases under its own names: gather = the low spiral (or the ground streaks), fall = it snaps into a column (or the burst), recover = the scour and the rain.
// Shield Quake reads the same phases under its own names: gather = the lift, fall = the ripple's run, recover = the burst and the settling.
export const castPhase = shadowPhase;

// The Dwarf's and the Shieldmaiden's boss moves' clock (special-fx-boss.ts), pure like shadowPhase: `rel` is ticks relative to the landing (negative before it), frozen
// where a fizzle stops the cast; `fade` is 1 while the cast stands and runs to 0 over the dissolve after a fizzle; `done` once nothing is left to draw. The landing is the
// SpecialLanded tick when it is known, else the tick the wind-up predicts; the timeout ends a cast that never gets an event.
export const DISSOLVE_TICKS = 20;
export const BOSS_TAIL = 84;   // the boss moves' payoff stays legible ~1.4 s after the landing: longer than SPECIAL_RECOVER (45), so the effect keeps its own cast past the shared timeline's end (special-fx-boss.ts), never the sim
export type BossClock = { rel: number; fade: number; struck: boolean; done: boolean };
export function bossClock(cast: Cast, now: number): BossClock {
  const land = cast.landed ?? cast.start + LAND_AT;
  if (cast.fizzled !== null) {
    const k = (now - cast.fizzled) / DISSOLVE_TICKS;
    return { rel: Math.min(now, cast.fizzled) - land, fade: Math.max(0, 1 - k), struck: false, done: k >= 1 };
  }
  const timedOut = now - cast.start >= LAND_AT + SPECIAL_RECOVER + CAST_MARGIN;
  return { rel: now - land, fade: 1, struck: cast.landed !== null, done: timedOut || (cast.landed !== null && now - cast.landed >= BOSS_TAIL) };
}
