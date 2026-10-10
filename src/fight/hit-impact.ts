// Hit impact (Dom 2026-09-29, "yes, this is good" on the ?look=hitfx-impact clip): every LANDED blow adds to the hit-stop and knocks the
// camera away from it. Presentation only: the hit-stop is main.ts's presentation pause (every tick still runs, in order, so records and
// replays are unchanged) and the knock is a camera-kick Shove. Parries and blocks have their own tiers (below); a miss adds nothing. Both ALWAYS on,
// prefers-reduced-motion included (owner ruling 2026-09-29, always on).
//   full: a heavy (the heavy class or a charged blow), a guard break, a skill or special (`skill_*`): +5 frames, 4 cm
//   half: every other landed hit (a stab, a slash, a kick):                                              +3 frames, 2 cm
import { HEAVY_CLASS } from './clash-sparks.ts';
import { shoveFor, type Shove } from './camera-kick.ts';
import type { CombatEvent } from './duel.ts';
import type { Direction } from './moves.ts';

export type Tier = 'full' | 'half' | 'parry' | 'block';
// Guard tiers (Dom 2026-09-29, "implement this also"): a PARRY is the longest beat in the game (70 ms + 11 frames = 253 ms, a heavy hit is
// 90 + 5 = 173) with a small jolt TOWARD the attacker; a BLOCK is a short freeze with a half-strength knock back from the blow.
export const IMPACT = {
  full: { frames: 5, knock: 0.04, push: 0 }, half: { frames: 3, knock: 0.02, push: 0 },
  parry: { frames: 11, knock: 0, push: 0.07 }, block: { frames: 2, knock: 0.02, push: 0 },
} as const;
export const KNOCK_SETTLE = 0.12;   // seconds: the knock is back in 120 ms
// Kick and roll (Dom 2026-09-30, pick C of the ?look=hitfx-kick / hitfx-roll clips: "implement and get live"). A LANDED kick, either side,
// is its own beat: the whole stop is 2 frames (not a hit's 50 ms + 3) and the camera drops 10 cm straight down, back in 120 ms. The
// player's roll tumbles the frame: 8° into the roll, an 8 cm dip and a 4.6 cm (~3 % of the frame) shift the way of the roll, up and back
// over 0.6 s, no time change. Both presentation only, always on like the rest of this file.
export const KICK = { stopMs: 2000 / 60, drop: 0.1 } as const;
export const landedKick = (e: CombatEvent) => e.type === 'Hit' && e.move === 'kick';
export const ROLL_TUMBLE = { angle: (8 * Math.PI) / 180, seconds: 0.6, shift: 0.046, dip: 0.08 } as const;

export function impactTier(e: CombatEvent): Tier | null {
  if (e.type === 'GuardBroken') return 'full';
  if (e.type === 'Parried') return 'parry';
  if (e.type === 'Blocked') return 'block';
  if (e.type !== 'Hit') return null;
  return e.charged || HEAVY_CLASS.has(e.move ?? '') || e.move?.startsWith('skill_') ? 'full' : 'half';
}
// Event sides (duel.ts): a landed blow names the attacker `actor`; a defence (Blocked, Parried) names the DEFENDER `actor`, the attacker `target`.
export const attackerOf = (e: CombatEvent): number | undefined => (e.type === 'Blocked' || e.type === 'Parried' ? e.target : e.actor);

// Milliseconds added to the frame's hit-stop: the strongest contact of the frame decides.
export function impactStopMs(events: readonly CombatEvent[]): number {
  let frames = 0;
  for (const e of events) { const tier = impactTier(e); if (tier) frames = Math.max(frames, IMPACT[tier].frames); }
  return (frames * 1000) / 60;
}

// The knock, AWAY from the side the blow arrives from on screen. `screen` is metres along the camera's right (+ = right); 4 cm is ~2.5 %
// of a 375-wide portrait frame at duel distance (~3.5 m, 25° across). The move's direction is the attacker's side; the camera sits behind
// the player, so a blow on the player arrives mirrored (right -> from screen left: the camera goes right) and a blow on the opponent
// arrives as named (right -> from screen right: the camera goes left). An overhead, a thrust, a low blow, a kick or a skill with no side
// arrives from above or in front: the camera drops by the knock instead. A parry instead jolts the camera TOWARD the attacker (`push`,
// metres along the view: in toward the opponent, back toward the player), on top of today's sideways flick. `direction` is the
// ATTACKER's move direction. `null`: no contact, today's kick stands.
export function impactShove(e: CombatEvent, direction: Direction | undefined): Shove | null {
  if (landedKick(e)) return { along: 0, drop: KICK.drop, side: 0, hold: 0, settle: KNOCK_SETTLE };   // straight down, no push, no side
  const tier = impactTier(e), base = shoveFor(e), attacker = attackerOf(e);
  if (!tier || !base || e.target === undefined || attacker === undefined) return null;
  const { knock, push } = IMPACT[tier];
  if (push) return { ...base, push: attacker === 1 ? push : -push, hold: 0, settle: KNOCK_SETTLE };
  const lateral = direction === 'right' || direction === 'left', struck = 1 - attacker;
  const from = lateral ? ((direction === 'right') === (struck === 1) ? 1 : -1) : 0;   // +1: the blow arrives from screen right
  return { ...base, drop: base.drop + (lateral ? 0 : knock), screen: -from * knock, hold: 0, settle: KNOCK_SETTLE };
}
