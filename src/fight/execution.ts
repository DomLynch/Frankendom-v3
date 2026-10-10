import { selectFinisher, type FinisherId } from './finishers.ts';
import type { Finish } from './duel.ts';
import type { WeaponId } from './moves.ts';
import type { OpponentId } from '../roster.ts';
import { HAMSTRUNG_SOURCE_PELVIS, HAMSTRUNG_VICTIMS, poseOf as hamstrungPoseOf } from './hamstrung.ts';

// Execution: a paired finisher (Death_Execution on the victim, Fin_Execution on the killer), GAME_SPEC's "the one ceremonial beat: a held
// half-second before the blow lands". The victim is forced to his knees and turned away, his weapon let go; the killer steps in behind him,
// raises the blade and HOLDS it; one downward cut to the nape; he pitches forward onto his face. Presentation only, beside Hamstrung for the same
// reason (finishers.ts and roster.ts are in the kill-link guard's digest): the pick is unchanged and NOT in ROTATION, only the dev picker plays it.

// The authored beats, shared by the offline clip build (scripts/build-execution.mjs) and the runtime. Fractions of `duration` (authored seconds).
// The scene paces the clip at `speed` (the spec's 0.75x for a cinematic finisher), so the scene lasts duration / speed seconds. The held half-second is
// baked INTO the clips and the finisher clock: both rigs hold one pose from `raise` to `release` while the clock keeps running (no frame-loop hit-stop: the
// 220 ms Killed hit-stop stays the only owner of the impact pause), and `hold` is on-screen seconds.
const duration = 2.6, speed = .75, hold = .5, raise = .36;
export const EXECUTION_BEATS = {
  drop: .06,       // the victim's weapon leaves his hand (he still stands)
  kneel: .3,       // forced down and turned away, head bowed
  raise,           // the blade is overhead
  release: raise + (hold * speed) / duration,   // the held half-second ends: the cut comes down
  strike: .62,     // the blade meets the nape
  fall: .92,       // he is down on his face
  duration, speed, hold,
} as const;
// Where on the scene's own clock (on-screen seconds from the kill) a beat lands.
export const executionAt = (beat: number): number => (beat * duration) / speed;

// Every playable (not held) body on the hero rig, exactly Hamstrung's victims; the clip is built on warrior.glb's proportions (the same pelvis).
export const EXECUTION_VICTIMS: readonly OpponentId[] = HAMSTRUNG_VICTIMS;
export const EXECUTION_SOURCE_PELVIS = HAMSTRUNG_SOURCE_PELVIS;
// Where adoptClip measures the body's own skin against the floor (the kneel and the fall differ in feet, chest and face from one body to the next): the pelvis path is lifted between these.
export const EXECUTION_FLOOR_MARKS: readonly number[] = [.15, .2, EXECUTION_BEATS.kneel, EXECUTION_BEATS.strike, .66, .72, .78, .84, .87, EXECUTION_BEATS.fall];

// resolveHamstrung's rule for the other paired pick: the picker never overrides kill eligibility, and a body without the clip plays no ceremony for it.
export function resolveExecution(id: OpponentId, finish: Finish, weapons: readonly [WeaponId, WeaponId], override: FinisherId | null, previous: FinisherId | null, resolved: FinisherId | null): FinisherId | null {
  if (override !== 'execution') return resolved;
  return EXECUTION_VICTIMS.includes(id) && selectFinisher(finish, weapons, previous) ? 'execution' : null;
}

// poseOf (src/fight/hamstrung.ts) with Execution's pose word added; finishers.ts's table stays as it was.
export const poseOf = (id: FinisherId): ReturnType<typeof hamstrungPoseOf> | 'execution' => id === 'execution' ? 'execution' : hamstrungPoseOf(id);

// One id for picture and audio, as hamstrungPick: clips not installed by the kill means the plain death for both.
export const executionPick = (pick: FinisherId | null, installed: boolean): FinisherId | null => pick === 'execution' && !installed ? 'plainDeath' : pick;
