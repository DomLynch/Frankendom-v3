// The game's blood: a thin spray with a few heavier drops, stretched along their flight into strands. Dom 2026-10-06 chose it over the old square burst
// through preview options (a streaks, b spray + drops, b2 30% thinner, b3 35% thinner again / 20% longer / 15% darker, b4 = b3 with 10% less spray, 10% narrower, 20% longer, 10% darker).
// Presentation only (nothing here is read by the simulation) and allocation-free per hit: it fills the pooled slots armfeel-fx.ts owns, with a seeded
// generator, so the same fight draws the same blood on every run.
import type { Feel, Particle } from './armfeel.ts';

// slots: the pool's size; hit/kill: particles a hit/kill takes (Low takes a third, at least 2); drops: how many of those are the heavy ones; start/end: the colour over a life.
export const BLOOD = { slots: 112, hit: 15, kill: 25, drops: { hit: 2, kill: 3 }, start: '#690f0d', end: '#200504' } as const;
const THIN = 0.7 * 0.65 * 0.9, LONG = 1.2 * 1.2 / (0.65 * 0.9);   // width x the first spray's; stretch x the first spray's (strand length = width x stretch), so the strands read as strands, not ovals
export const bloodCount = (feel: Feel, kill: boolean): number =>
  feel === 'off' ? 0 : Math.max(feel === 'low' ? 2 : 0, Math.round(BLOOD[kill ? 'kill' : 'hit'] * (feel === 'low' ? 0.35 : 1)));

// mulberry32: one tiny seeded stream per pool (state is a number, nothing allocated per draw).
export const makeRng = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const between = (rnd: () => number, lo: number, hi: number) => lo + (hi - lo) * rnd();

// Fills slot `p`; (x, y, z) the contact, (dx, dz) the blow's unit direction. Size is the DIAMETER of the unit sphere the pool scales: width = size, length = size x stretch.
// `grow` scales the size (1 = as drawn): the burst on the far fighter is made as big on screen as the near one's (Dom: blood appeared when he was hit, rarely when he hit).
export const bloodGrow = (far: number, near: number): number => Math.min(3, Math.max(1, far / (near || 1)));
// Where the foe's burst starts: the contact, pulled TOWARD THE CAMERA along the camera-to-contact ray, so it keeps the wound's screen position (it stays on his body) but sits
// in front of the hero, whose torso otherwise covers a close foe's hit (Lead 10-07: a sideways offset left it floating in clear air). `far` / `near`: camera distance to the foe's
// contact / to the hero's chest. The pull lands FRONT m in front of the hero's centre depth, and never brings the spawn within MIN_CAM m of the lens.
const FRONT = 0.35, MIN_CAM = 1.5;
export const foeBurstPull = (far: number, near: number): number => Math.max(0, Math.min(Math.max(0, far - near) + FRONT, far - MIN_CAM));
export function spawnBlood(p: Particle, i: number, x: number, y: number, z: number, dx: number, dz: number, kill: boolean, feel: Feel, rnd: () => number, grow = 1): void {
  p.x = x; p.y = y; p.z = z;
  const low = feel === 'low' ? 0.7 : 1, a = rnd() * Math.PI * 2;   // no ring: a random bearing each, never evenly spaced
  if (i < BLOOD.drops[kill ? 'kill' : 'hit']) {   // the first few are the heavy drops, the rest the mist
    p.life = p.total = between(rnd, 0.5, 0.72); p.size = between(rnd, 0.07, 0.12) * low * THIN; p.stretch = between(rnd, 1.1, 1.5) * LONG;
    p.vx = Math.cos(a) * between(rnd, 0.3, 1.1) + dx * between(rnd, 0.3, 1.0); p.vz = Math.sin(a) * between(rnd, 0.3, 1.1) + dz * between(rnd, 0.3, 1.0); p.vy = between(rnd, 1.6, 3.0);
  } else {
    p.life = p.total = between(rnd, 0.14, 0.4); p.size = between(rnd, 0.018, 0.05) * low * THIN; p.stretch = between(rnd, 1.3, 2.4) * LONG;
    const speed = between(rnd, 1.2, 3.6);
    p.vx = Math.cos(a) * speed * 0.6 + dx * between(rnd, 0.5, 2.4); p.vz = Math.sin(a) * speed * 0.6 + dz * between(rnd, 0.5, 2.4); p.vy = between(rnd, 0.2, 2.6);
  }
  p.size *= grow;
}
