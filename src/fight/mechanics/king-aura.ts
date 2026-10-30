// THE KING's signature mechanic, AURA (data/mechanics.json "king-aura"; Strategy's brief, Dom: every boss its own fighting identity). A stage spotlight on the ground around him:
//   inside it  the hero's stamina regrows slowly and a small tick of his max health goes (never to death);
//   every period the ring flares (the tell), then a wave runs out from the King and hurts whoever it passes who is not mid-roll;
//   it shrinks as he loses health and pulses faster below a health fraction. Counter: roll through the wave, fight on the edge of a shrinking ring, or walk him out of his own light.
// A world layer like mobkit.ts and walk-back.ts: it reads the stepped practice and returns the next one (project), nothing inside the sim changes, so no record version. Pure and tick-driven (the pulse
// phase is duel.tick % period): a replay of the same inputs is the same fight. The ring is three reused meshes (scaled and faded per frame, no allocation). Every number is a row.
// The registry (index.ts) hands the page `createKingAuraRuntime`, the same MechanicRuntime shape as Lord Gourd's bombs (tick, frame, reset, group).
import * as THREE from 'three';
import { project, type Practice } from '../combat.ts';
import type { Duel, Fighter } from '../duel.ts';
import { M } from '../detmath.ts';
import { MECHANIC_SCALE, type MechanicRuntime } from './runtime.ts';

export type KingAuraLook = { core: string; edge: string; wave: string; discOpacity: number; edgeOpacity: number; tellOpacity: number; waveOpacity: number; lift: number; segments: number; edgeWidth: number };
export type KingAuraRow = {
  radiusMetres: number; minRadiusMetres: number; regenFactor: number; tickEveryTicks: number; tickDamageFraction: number; pulsePeriodTicks: number; frenzyBelowFraction: number;
  frenzyPeriodTicks: number; pulseTellTicks: number; pulseWaveTicks: number; pulseDamageFraction: number; pulseStaminaFraction: number; look: KingAuraLook;
};

const clamp = (v: number): number => Math.min(1, Math.max(0, v));
const REGEN_PHASES: readonly string[] = ['ready', 'sheathed', 'guard'];   // the phases the sim regrows stamina in (duel.ts): only that gain is slowed

/** Whether the aura is live: both stand, the fight is not over. The corpse and its cut cues are never covered. */
export const auraLive = (duel: Duel): boolean => !duel.finish && duel.fighters[0].health > 0 && duel.fighters[1].health > 0 && duel.fighters[0].phase !== 'dead' && duel.fighters[1].phase !== 'dead';
/** The ring's radius at the King's health fraction: full at full health, `minRadiusMetres` at none. */
export const auraRadius = (row: KingAuraRow, healthFraction: number): number => row.minRadiusMetres + (row.radiusMetres - row.minRadiusMetres) * clamp(healthFraction);
/** Ticks between two pulses at the King's health fraction. */
export const auraPeriod = (row: KingAuraRow, healthFraction: number): number => (healthFraction < row.frenzyBelowFraction ? row.frenzyPeriodTicks : row.pulsePeriodTicks);
/** Where a tick sits in the pulse cycle: `age` ticks since the cycle began, `tell` 0..1 through the flare before the wave (0 outside it), `wave` 0..1 through the wave (0 when none runs). */
export function auraPhase(row: KingAuraRow, tick: number, healthFraction: number): { age: number; tell: number; wave: number } {
  const period = auraPeriod(row, healthFraction), age = tick % period, tellFrom = period - row.pulseTellTicks;
  return { age, tell: age >= tellFrom ? (age - tellFrom + 1) / row.pulseTellTicks : 0, wave: age >= 1 && age <= row.pulseWaveTicks ? age / row.pulseWaveTicks : 0 };
}
const gap = (a: Fighter, b: Fighter): number => M.hypot(a.body.x - b.body.x, a.body.z - b.body.z);

/** One tick of the aura on the stepped duel. `scale` is the King's damage multiplier (ring, star, Daily Pit: data/tune.json via the page). Returns the same practice when nothing changed. */
export function step(prior: Practice, stepped: Practice, row: KingAuraRow, scale = 1): Practice {
  const duel = stepped.duel, [hero, king] = duel.fighters;
  if (!auraLive(duel)) return stepped;
  const fraction = king.health / king.maxHealth, radius = auraRadius(row, fraction), reach = gap(hero, king);
  let health = hero.health, stamina = hero.stamina;
  if (reach <= radius) {
    const gain = hero.stamina - prior.duel.fighters[0].stamina;
    if (gain > 0 && REGEN_PHASES.includes(hero.phase)) stamina = prior.duel.fighters[0].stamina + gain * row.regenFactor;
    if (duel.tick % row.tickEveryTicks === 0) health -= Math.max(1, Math.round(hero.maxHealth * row.tickDamageFraction * scale));
  }
  const now = auraPhase(row, duel.tick, fraction);
  if (now.wave > 0 && hero.phase !== 'roll') {   // a roll is the answer (the sim's own invulnerable dodge); the wave front is where it has reached this tick
    const front = radius * now.wave, back = radius * Math.max(0, (now.age - 1) / row.pulseWaveTicks);
    if (reach > back && reach <= front) { health -= Math.max(1, Math.round(hero.maxHealth * row.pulseDamageFraction * scale)); stamina -= hero.maxStamina * row.pulseStaminaFraction; }
  }
  health = Math.max(1, health); stamina = Math.max(0, stamina);
  if (health === hero.health && stamina === hero.stamina) return stepped;
  return project({ ...duel, fighters: [{ ...hero, health, stamina }, king] }, stepped.ai, stepped);
}

/** What the runtime hands the drawing each tick (one object, refilled; nothing is copied). */
export type KingAuraCtx = { live: boolean; x: number; z: number; fraction: number; tick: number };

/** The ring on the ground: a faint disc, a bright rim that flares in the tell, and the wave front. Three meshes made once, moved by scale and opacity only. `group` is added to the scene by the page (view.addLayer). */
function createView(row: KingAuraRow, ctx: KingAuraCtx) {
  const look = row.look, group = new THREE.Group(); group.visible = false; group.renderOrder = 4; group.name = 'KingAura';   // the name is how the browser checks and the stills find the ring in the scene
  const make = (geometry: THREE.BufferGeometry, colour: string): THREE.Mesh => {
    const material = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry.rotateX(-Math.PI / 2), material); mesh.renderOrder = 4; mesh.frustumCulled = false; group.add(mesh); return mesh;
  };
  const inner = 1 - look.edgeWidth, disc = make(new THREE.CircleGeometry(1, look.segments), look.core), edge = make(new THREE.RingGeometry(inner, 1, look.segments), look.edge), wave = make(new THREE.RingGeometry(inner, 1, look.segments), look.wave);
  const opacity = (m: THREE.Mesh, v: number) => { (m.material as THREE.MeshBasicMaterial).opacity = v; };
  return {
    group,
    /** Once a frame: move the three meshes to the ctx the last tick left (hidden while the aura is not live). */
    update(): void {
      if (!ctx.live) { group.visible = false; return; }
      const radius = auraRadius(row, ctx.fraction), now = auraPhase(row, ctx.tick, ctx.fraction);
      group.visible = true; group.position.set(ctx.x, look.lift, ctx.z);
      disc.scale.setScalar(radius); edge.scale.setScalar(radius);
      opacity(disc, look.discOpacity * (1 + now.tell));
      opacity(edge, look.edgeOpacity + (look.tellOpacity - look.edgeOpacity) * now.tell);
      wave.visible = now.wave > 0; wave.scale.setScalar(Math.max(look.edgeWidth, radius * now.wave)); opacity(wave, look.waveOpacity * (1 - now.wave));
    },
  };
}

/** The registry's runtime for this mechanic (type "king-aura"): `tick` is the Practice-in, Practice-out step the page calls once per sim tick for the engaged boss; `frame` moves the ring. */
export function createKingAuraRuntime(row: KingAuraRow & { boss: string }): MechanicRuntime {
  const ctx: KingAuraCtx = { live: false, x: 0, z: 0, fraction: 1, tick: 0 }, drawing = createView(row, ctx);
  let last: Practice | null = null;   // the practice this runtime handed back on the previous tick: its stamina is what the sim's regrowth is measured against
  return {
    boss: row.boss, group: drawing.group, core: { row }, ctx,
    reset: () => { last = null; ctx.live = false; },
    tick(practice: Practice, on: boolean, _dt: number): Practice {
      if (!on || !auraLive(practice.duel)) { last = null; ctx.live = false; return practice; }
      const king = practice.duel.fighters[1], next = step(last ?? practice, practice, row, MECHANIC_SCALE.damage);
      ctx.live = true; ctx.x = king.body.x; ctx.z = king.body.z; ctx.fraction = king.health / king.maxHealth; ctx.tick = practice.duel.tick;
      last = next; return next;
    },
    frame: () => drawing.update(),
  };
}
