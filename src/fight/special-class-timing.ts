import { RULES } from './moves.ts';
import type { Fighter } from './duel.ts';
import { LAND_AT } from './special-timing.ts';
import { smooth } from './fx-math.ts';

// The class specials' three-free timing (the Witch, the Plague Doctor, the Knight; effects in special-fx-class.ts, loaded lazily): the registry (special-modes.ts) reads the gait from here
// without pulling the effect's chunk into the main bundle.
export type ClassSpecial = 'wake' | 'stirring' | 'tempo' | 'pulse' | 'drag' | 'swing';
// The rig plays a slow gait through each of the Doctor's three steps and through the Knight's drag (special-modes.ts `travel`); the anchor does the actual moving.
// The camera sits behind the player, so what the walkers leave behind them is hidden under the two bodies unless it lies in the open ground BEHIND the caster (first clips, 2026-10-02):
// both walkers first back off BACK metres (the rig walks backwards, BACK_AT..BACK_AT + BACK_TICKS), then walk in from there, so the trench and the prints are laid in the clear.
export const BACKS = { tempo: 0.9, drag: 1.2 } as const, BACK_TICKS = 30, BACK_PACES = { tempo: -1.8, drag: -2.4 } as const, BACK_AT = { tempo: 0, drag: 4 } as const;
export const LATERAL = 0.8;   // Ground Drag walks a gentle arc this wide (metres), so the rut curves out beside the two bodies instead of running behind them
export const STEP_BEATS = [56, 88, LAND_AT] as const, STEP_WINDOW = 26, DRAG_FROM = 36;
export const classTravel = (kind: ClassSpecial) => (side: 0 | 1, fighters: readonly [Fighter, Fighter]): number | undefined => {
  const left = fighters[1].special ?? 0;
  if (side !== 1 || left <= 0) return undefined;
  const age = RULES.special.windup - left;
  if ((kind === 'tempo' || kind === 'drag') && age >= BACK_AT[kind] && age < BACK_AT[kind] + BACK_TICKS) return BACK_PACES[kind];
  if (kind === 'tempo') return STEP_BEATS.some((b) => age >= b - STEP_WINDOW && age < b) ? 1.8 : undefined;
  return kind === 'drag' && age >= DRAG_FROM ? 1.4 : undefined;
};
// Where the walker stands along the line to the foe, metres off his sim spot, `age` ticks into the cast (negative while he is backed off); `dist` is the gap to the foe.
export const walkOffset = (kind: 'tempo' | 'drag', age: number, dist: number): number => {
  const reach = Math.max(0, dist - (kind === 'tempo' ? 1.1 : 1.0)), back = smooth((age - BACK_AT[kind]) / BACK_TICKS);
  const fwd = kind === 'tempo' ? STEP_BEATS.reduce((sum, beat) => sum + smooth((age - (beat - STEP_WINDOW)) / STEP_WINDOW), 0) / 3 : smooth((age - DRAG_FROM) / (LAND_AT - DRAG_FROM));
  return -BACKS[kind] * back + (reach + BACKS[kind]) * fwd;
};
// ...and how far to the side of that line (the Knight's arc; the Doctor walks straight).
export const walkLateral = (kind: 'tempo' | 'drag', age: number): number => (kind === 'drag' ? LATERAL * Math.sin(Math.PI * Math.min(1, Math.max(0, (age - DRAG_FROM) / (LAND_AT - DRAG_FROM)))) : 0);
