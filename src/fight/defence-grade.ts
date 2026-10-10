import type { CombatEvent } from './duel.ts';

// LOOK TEST behind `?look=defence` (default OFF; Lead 2026-10-07, Strategy's proposal): the player's four defence results read differently. Presentation only: no sim or record change,
// driven by the events the sim already emits (duel.ts ~361-372): `Parried` and `Blocked` name the DEFENDER as `actor`, so the player's own defence is actor 0.
//   parry   = type 'Parried'                                   (a guard in its parry window turned the blow aside)
//   perfect = type 'Blocked' with `perfect: true`              (guard raised just in time: half cost, no chip)
//   heavy   = type 'Blocked', not perfect, move in HEAVY_BLOCK (a heavy blow held: the chip damage `damage` rides on the event)
//   plain   = any other 'Blocked'                              (light or thrust, held)
// A kick, a guarded wrong-side hit and a GuardBroken are not defences won and have no grade.
export type Grade = 'plain' | 'heavy' | 'perfect' | 'parry';
export const GRADES: readonly Grade[] = ['plain', 'heavy', 'perfect', 'parry'];
// The same heavy class the clash sparks, camera kick and clang weight read (clash-sparks.ts HEAVY_CLASS).
export const HEAVY_BLOCK = new Set<string>(['heavy_overhead', 'heavy_riposte', 'heavy_counter', 'critical']);
export const GRADE_LABEL: Readonly<Record<Grade, string>> = { plain: 'BLOCK', heavy: 'HEAVY BLOCK', perfect: 'PERFECT', parry: 'PARRY' };   // the caption the GUARD button wears for half a second
export const defenceFlag = (search: string) => (new URLSearchParams(search).get('look') ?? '').split(',').includes('defence');

export function defenceGrade(event: CombatEvent): Grade | null {
  if (event.actor !== 0) return null;
  if (event.type === 'Parried') return 'parry';
  if (event.type !== 'Blocked') return null;
  if (event.perfect) return 'perfect';
  return HEAVY_BLOCK.has(event.move ?? '') ? 'heavy' : 'plain';
}

// How each grade sounds: the existing clang cues only (audio/manifest.ts names), pitch (`rate`), gain and layering. Nothing here grows the sprite. Gains MEASURED 2026-10-07 on the phone band
// (scripts/audio-preview.mjs, BS.1770 after a 300 Hz high-pass; today's block -30.5, perfect -30.1, parry -29.7): plain -30.6, heavy -30.4, perfect -29.9, parry -29.7: each grade at or just above
// today's cue, the ladder rising plain < heavy < perfect < parry, parry still loudest; peaks -19.3 dBFS everywhere (no clipping); a foe hit in the same tick moves a grade by <= .1 dB.
export type Layer = { name: 'block' | 'block_perfect' | 'parry' | 'hit_heavy'; gain: number; room: number; delay?: number; rate?: number };
export const GRADE_AUDIO: Readonly<Record<Grade, readonly Layer[]>> = {
  plain: [{ name: 'block', gain: 0.95, room: 0.35 }],
  heavy: [{ name: 'block', gain: 1, room: 0.35, rate: 0.82 }, { name: 'hit_heavy', gain: 0.35, room: 0.3, delay: 0.015 }],
  perfect: [{ name: 'block_perfect', gain: 0.6, room: 0.35, rate: 1.12 }],
  parry: [{ name: 'parry', gain: 1, room: 0.45 }, { name: 'block_perfect', gain: 0.25, room: 0.35, delay: 0.02, rate: 1.25 }],
};
