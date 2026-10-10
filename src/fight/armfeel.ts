// Armfeel (Dom 2026-10-06, via Strategy and Lead; on by default since he liked the look test): the melee-relevant hit feel of his Armagedom prototype (docs/COMBAT_HANDOFF.md, "Universal
// impact effects"), as a LOOK TEST. Presentation only: nothing here is read by the simulation, so a fight's records and replays are byte-identical
// with the flag on or off (tests/armfeel.test.ts pins both). `&feel=high|low|off` scales every effect; `off` is the game as it is.
// Combat's half: the victim's flinch (a lean and a nudge on a visual pivot; the root and the collider never move) and the weapon's hit hold
// (a short extra freeze at contact, capped so a hit never freezes longer than the heaviest hit already does). World adds the
// burst pool and the layered sounds on top of this branch.
import type { CombatEvent } from './duel.ts';

export type Feel = 'high' | 'low' | 'off';
export const FEELS: readonly Feel[] = ['high', 'low', 'off'];
// On for everyone at High (Dom 2026-10-06: "likes armfeel"); `?feel=low|off` (and `?look=armfeel&feel=...`, the look test's old links) still choose, and reduced motion starts at Low
// as the prototype does. `off` is the game as it was before this.
export function armfeelFrom(search: string, reducedMotion = false): Feel {
  const feel = new URLSearchParams(search).get('feel');
  return feel === 'high' || feel === 'low' || feel === 'off' ? feel : reducedMotion ? 'low' : 'high';
}

// The handoff's numbers. Low: energy 0.4, no holds. Off: nothing added.
export const ARMFEEL = {
  lean: 0.45, leanKill: 0.9,            // rad at energy 1
  nudge: 0.16,                          // metres along the blow
  decay: 12, decayKill: 10,             // per second
  hold: 0.045, holdKill: 0.08,          // seconds the victim's reaction waits before it decays
  lowEnergy: 0.4,
  // The weapon's hit hold (40–80 ms, handoff: 40 light, 80 kill): by the blow's tier.
  weaponHoldMs: { half: 40, full: 60, kill: 80 },
} as const;
export const energyOf = (feel: Feel): number => (feel === 'high' ? 1 : feel === 'low' ? ARMFEEL.lowEnergy : 0);

// The heaviest stop a hit gets today (main.ts HEAVY_HIT 90 ms + hit-impact.ts full tier 5 frames): no armfeel hold may take a frame past it.
export const FULL_TIER_STOP_MS = 90 + (5 * 1000) / 60;
// The blade's hit hold (40–80 ms) is a FLOOR on the freeze a contact has, not an addition to it: every contact in this game already stops the picture
// at least 100 ms (main.ts HIT_STOP 50 ms + the half tier's 3 frames), so the extra milliseconds this returns are 0 on every real hit, and a light hit
// is not made to stutter by a second freeze stacked on the first (Dom 2026-10-06: "a bit more nauseous"; measured, the old top-up made a light hit
// freeze 140 ms against 100). Never past the full-tier stop either. High only.
export function weaponHoldMs(feel: Feel, stopMs: number, events: readonly CombatEvent[], tier: 'half' | 'full' | null): number {
  if (feel !== 'high' || stopMs <= 0 || !tier) return 0;
  const floor = events.some((e) => e.type === 'Killed') ? ARMFEEL.weaponHoldMs.kill : ARMFEEL.weaponHoldMs[tier];
  return Math.max(0, Math.min(floor, FULL_TIER_STOP_MS) - stopMs);
}

// How much of the flinch each fighter shows. The hero stands 4.5 m from the camera and every hit on him moves the biggest thing on the screen: at the
// handoff's full size his head swept 50 px of a 375 px screen (his feet 35 px), the sway Dom felt as nausea. He keeps a quarter of it (9 px). The
// opponent is 7 m away and moves along the view axis, so his flinch is turned to the side the blow arrives from (scene.ts) to be seen at all.
export const FLINCH_GAIN = { hero: 0.25, opponent: 1 } as const;

// The blood burst's particles (blood-style.ts fills them): life, position, velocity, size (width) and stretch (length over width), in one fixed pool.
export const GRAVITY = 8;   // m/s²
export type Particle = { life: number; total: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number; stretch: number };
export const newParticle = (): Particle => ({ life: 0, total: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, stretch: 1 });
// Only a blow that lands on the body bleeds: a Hit. A block, a parry and a guard break keep today's clash sparks and get none of this (Dom 2026-10-06).
export const isFleshHit = (e: CombatEvent): boolean => e.type === 'Hit' && e.target !== undefined;
// One tick of a live particle; returns its scale (size × remaining life) and brightness (0.6 + 0.4 × remaining life).
export function tickParticle(p: Particle, dt: number): boolean {
  p.life = Math.max(0, p.life - dt);
  if (p.life <= 0) return false;
  p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= dt * GRAVITY;
  return true;
}

// One victim's flinch: a lean about the pivot and a nudge along the blow, both scaled by an energy that starts at 1 per landed blow and decays
// exponentially after a short hold. `update` returns the pose of the visual pivot for this frame.
export type Pose = { lean: number; dx: number; dz: number };
export class Flinch {
  private energy = 0; private hold = 0; private kill = false; private dirX = 0; private dirZ = 0;
  feel: Feel;
  constructor(feel: Feel) { this.feel = feel; }
  // (dx, dz): the push direction (unit); `gain` scales this victim's whole flinch (FLINCH_GAIN).
  hit(dx: number, dz: number, kill: boolean, gain = 1): void {
    if (this.feel === 'off') return;
    this.energy = gain; this.kill = kill; this.dirX = dx; this.dirZ = dz;
    this.hold = this.feel === 'high' ? (kill ? ARMFEEL.holdKill : ARMFEEL.hold) : 0;   // Low has no holds
  }
  // dt seconds of the frame; the hold is spent first, and only what is left decays the energy (`visualDt = max(0, dt - hold)`).
  update(dt: number): Pose {
    if (this.energy <= 0) return { lean: 0, dx: 0, dz: 0 };
    const spent = Math.min(this.hold, dt); this.hold -= spent;
    this.energy *= Math.exp(-(this.kill ? ARMFEEL.decayKill : ARMFEEL.decay) * Math.max(0, dt - spent));
    if (this.energy < 0.001) { this.energy = 0; return { lean: 0, dx: 0, dz: 0 }; }
    const k = energyOf(this.feel) * this.energy;
    return { lean: (this.kill ? ARMFEEL.leanKill : ARMFEEL.lean) * k, dx: this.dirX * ARMFEEL.nudge * k, dz: this.dirZ * ARMFEEL.nudge * k };
  }
  clear(): void { this.energy = 0; this.hold = 0; }
  get active(): boolean { return this.energy > 0; }
}
