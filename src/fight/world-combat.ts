// The mount of Zone 1's own combat loop (Combat's pure src/fight/world.ts) in the walk: no duel, no ring, no fight start or end (Dom 2026-10-08). The page walks the hero (collisions,
// relief) and tells this his position; the loop owns hits, creature chase/telegraph/bite/leash. This file: which creatures are in the loop (those that come within the aggro ring, until they are
// home again), the fixed 1/60 accumulator, and turning the events into what the page shows (a procedural lunge / hit pulse / fall on the creature, bars, the hero's clips, kill and death).
import { AGGRO_M, creature, duelFor, duelOf, newWorld, pairs, player, stepCombat, type Event, type Fighter, type World } from './world.ts';
import { NAKED, type Loadout } from '../gear-stats.ts';
import { OPPONENTS } from '../moves.ts';
import type { Duel } from '../duel.ts';

export const ME = 'me', STEP = 1 / 60, JOIN_M = AGGRO_M + 3, DROP_M = AGGRO_M + 8, FALL_S = 1.4, PULSE_S = 0.18, MAX_STEPS = 15;   // 15 steps = 0.25 s of catch-up per frame (was 6: any frame over 100 ms silently dropped fight time). No higher: a creature acts inside the catch-up while the page was frozen, and the fastest creature cycle is longer than 15 ticks, so at most ONE swing can land in a frame (tested).
/** The roster kind a Zone 1 body fights as, or null (it cannot be fought yet: it only wanders). */
export const kindOf = (body: string): string | null => (Object.prototype.hasOwnProperty.call(OPPONENTS, body) ? body : null);

/** What the loop needs to know of a creature and of the client that draws them (the page's mob layer fits both structurally; the engine imports nothing from a client). */
export type FightMob = { id: string; body: string; level: number; name: string };
export type MobPose = { x: number; z: number; facing: number; moving: boolean; duel?: Duel; fall?: number };
export type MobsPort<S extends FightMob> = { drive(id: string, pose: MobPose | null): void; within(x: number, z: number, r: number): { spec: S; x: number; z: number; dist: number }[] };
export type WorldCombatDeps<S extends FightMob = FightMob> = {
  mobs: () => MobsPort<S> | null;
  onKill(spec: S): void;      // the creature has fallen: loot, toast, respawn timer
  onHeroDied(): void;               // the 2 s dim and the walk back to town
  onHeroHit(amount: number): void;  // red flash + the Hit clip
  onSwing?(): void;                 // the hero's own cut began (the page poses the hero from heroDuel() with the Pit's actor now; kept for hosts that want the beat)
  onTelegraph?(id: string, ms: number): void;
  onEvent?(ev: Event): void;       // every combat event, after the page has shown it (the spawn client, spawn-net.ts onCombatEvent)
  hero?: () => { gear: Loadout; level: number; health?: number };   // his resolved gear and career level (default: naked, level 1); health: a test seed for his starting and maximum health; a creature's level is its spec's
};
type Fx = { hurtT: number; fallT: number; windupT: number; windupMs: number; swingT: number };

export function createWorldCombat<S extends FightMob>(d: WorldCombatDeps<S>) {
  const mine = (): { gear: Loadout; level: number; health?: number } => d.hero?.() ?? { gear: NAKED, level: 1 };
  const body = (x: number, z: number, facing: number): Fighter => { const { gear, level, health } = mine(), p = player(ME, x, z, facing, gear, level); return health ? { ...p, health, maxHealth: health } : p; };
  let world: World = newWorld([body(0, 0, 0)]), acc = 0, pendingAttack: 'light' | 'heavy' | 'thrust' | 'kick' | null = null, pendingRoll: { x: number; z: number } | null = null, guardHeld = false, heroDead = false, lostMs = 0, hitches = 0, steps = 0;
  const specs = new Map<string, S>(), fx = new Map<string, Fx>();
  const fxOf = (id: string): Fx => { let f = fx.get(id); if (!f) { f = { hurtT: 0, fallT: 0, windupT: 0, windupMs: 400, swingT: 0 }; fx.set(id, f); } return f; };
  const gearOf = () => { const { gear, level } = mine(), p = player(ME, 0, 0, 0, gear, level); return { attack: p.attack, res: p.res, level: p.level, shielded: p.shielded }; };
  const me = (): Fighter => world.fighters[0]!;
  function release(id: string) { d.mobs()?.drive(id, null); specs.delete(id); fx.delete(id); world = { ...world, fighters: world.fighters.filter((f) => f.id !== id) }; }
  function join(p: { spec: S; x: number; z: number; dist: number }) {
    const kind = kindOf(p.spec.body); if (!kind || specs.has(p.spec.id) || heroDead) return;
    specs.set(p.spec.id, p.spec); world = { ...world, fighters: [...world.fighters, creature(p.spec.id, kind, p.x, p.z, 0, p.spec.level)] };
  }
  function handle(ev: Event) {
    if (ev.type === 'Telegraph') { if (ev.id === ME) d.onSwing?.(); else { const f = fxOf(ev.id); f.windupT = 0.0001; f.windupMs = ev.ms; d.onTelegraph?.(ev.id, ev.ms); } }
    else if (ev.type === 'Swing' && ev.id !== ME) fxOf(ev.id).swingT = 0.0001;
    else if (ev.type === 'Hit') { if (ev.victim === ME) d.onHeroHit(ev.damage); else { fxOf(ev.victim).hurtT = PULSE_S; } }
    else if (ev.type === 'Evaded') release(ev.id);   // it gave up, walked home and healed: back to its own wander
    else if (ev.type === 'Died') { if (ev.id === ME) { heroDead = true; d.onHeroDied(); } else { const f = fxOf(ev.id); f.fallT = 0.0001; } }
  }
  return {
    /** An attack press (STAB / SLASH / a tap on a creature): the cut starts on the next step if he is free. */
    press(kind: 'light' | 'heavy' | 'thrust' | 'kick' = 'light') { pendingAttack = kind; },
    /** A roll / dodge pressed: the world-axis direction (zero = where he faces). */
    roll(dir: { x: number; z: number }) { pendingRoll = dir; },
    guard(held: boolean) { guardHeld = held; },
    update(dt: number, hero: { x: number; z: number; facing: number }): { dx: number; dz: number } {
      const mobs = d.mobs(); if (!mobs) return { dx: 0, dz: 0 };
      if (!heroDead) for (const p of mobs.within(hero.x, hero.z, JOIN_M)) join(p);
      const want = acc + dt, cap = STEP * MAX_STEPS; acc = Math.min(want, cap);
      if (want > cap) { lostMs += (want - cap) * 1000; hitches++; if (hitches === 1 || hitches % 10 === 0) console.warn(`world-combat: a ${Math.round(dt * 1000)} ms frame dropped ${Math.round((want - cap) * 1000)} ms of fight time (${hitches} such frame(s), ${Math.round(lostMs)} ms lost in all)`); }
      let first = true;   // the page owns the hero's walk; a ROLL is the loop's own displacement, so only the first step of a frame takes the page's position and the rest keep the loop's
      while (acc >= STEP) {
        acc -= STEP; steps++;
        const m = me(); if (first) world = { ...world, fighters: [{ ...m, ...gearOf(), x: hero.x, z: hero.z, facing: m.phase === 'roll' ? m.facing : hero.facing }, ...world.fighters.slice(1)] }; first = false;
        const r = stepCombat(world, { [ME]: { x: 0, z: 0, attack: heroDead ? null : pendingAttack, guard: guardHeld && !heroDead, roll: heroDead ? null : pendingRoll } }, STEP); pendingAttack = null; pendingRoll = null;
        world = r.world; for (const ev of r.events) { handle(ev); d.onEvent?.(ev); }
      }
      pendingAttack = null; pendingRoll = null;
      for (const f of world.fighters.slice(1)) {
        const s = specs.get(f.id); if (!s) continue; const x = fxOf(f.id);
        if (f.phase === 'dead') {
          x.fallT += dt; mobs.drive(f.id, { x: f.x, z: f.z, facing: f.facing, moving: false, fall: Math.min(1, x.fallT / FALL_S) });   // the death clip's progress
          if (x.fallT >= FALL_S) { const done = s; release(f.id); d.onKill(done); }
          continue;
        }
        x.hurtT = Math.max(0, x.hurtT - dt);
        mobs.drive(f.id, { x: f.x, z: f.z, facing: f.facing, moving: f.returning || (f.hunting && f.phase === 'ready' && Math.hypot(f.x - hero.x, f.z - hero.z) > 1.6), duel: duelFor(world, f.id) ?? undefined });   // the page poses its actor from the duel (the engine's actorPose)
        if (!f.hunting && !f.returning && Math.hypot(f.x - hero.x, f.z - hero.z) > DROP_M) release(f.id);
      }
      return { dx: me().x - hero.x, dz: me().z - hero.z };   // a roll's displacement (zero on foot); the page applies it with its own collision
    },
    /** After he died and stood up in town: a fresh body, nothing hunting him. */
    reset(hero: { x: number; z: number; facing: number }): void { for (const id of [...specs.keys()]) release(id); world = newWorld([body(hero.x, hero.z, hero.facing)]); heroDead = false; acc = 0; },
    /** The hero's own duel, for the engine's actorPose (null before his first step). */
    heroDuel() { return duelOf(world, ME); },
    hero: () => { const m = me(); return { health: m.health, max: m.maxHealth, stamina: m.stamina, maxStamina: m.maxStamina, phase: m.phase, facing: m.facing, posture: m.posture, exhausted: m.exhausted, dead: heroDead }; },
    /** The creature he is fighting now (the nearest hunting one), for the target bar. */
    target: () => { const pr = pairs(world).find((x) => x.player === ME && x.primary), live = (f: Fighter) => f.phase !== 'dead' && f.hunting; let best: Fighter | null = world.fighters.slice(1).find((f) => f.id === pr?.foe && live(f)) ?? null; if (!best) for (const f of world.fighters.slice(1)) if (live(f) && (!best || Math.hypot(f.x - me().x, f.z - me().z) < Math.hypot(best.x - me().x, best.z - me().z))) best = f; const s = best && specs.get(best.id); return best && s ? { name: s.name, health: best.health, max: best.maxHealth } : null; },   // the card names the primary pair's foe (the Pit's own nearest, S2 pairs()); it moves to the next joiner as each falls
    /** Frame health for the seamless receipt: sim steps run, fight time dropped by the 0.25 s catch-up cap, and how many frames dropped some. */
    stats: () => ({ steps, lostMs: Math.round(lostMs), hitches }),
    inCombat: () => world.fighters.slice(1).some((f) => f.phase !== 'dead' && f.hunting),
    debug: () => world.fighters.map((f) => ({ id: f.id, phase: f.phase, hp: Math.round(f.health), x: +f.x.toFixed(1), z: +f.z.toFixed(1), hunting: f.hunting, returning: f.returning })),
  };
}
