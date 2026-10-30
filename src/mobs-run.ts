// Trash mobs on the page (data/mobs.json; Dom 2026-10-28). The pure core is src/zone/mobs.ts; this file is the wiring that keeps main.ts's diff small: it builds the core from the zone row and the
// ring rows, feeds it the hero's fighter each sim tick (src/fight/mob-swing.ts reads his blow), lays the mobs' damage on his health (never lethal while the row says so), hands the live arrays to the
// scene and the radar, and pays a kill's coins and tells the Hunter heat system (window.__v3Heat, if one installs itself) and the Pit Crawl (Mobs.onMobKilled). Presentation + the mobs' own small rules;
// the boss duel sim is not touched: a mob is never a duel.
import { Mobs, MOBS, kindIndex, type Hero, type Killed, type MobView, type Pad } from './zone/mobs.ts';
import { validateMobs } from './sim/validate-mobs.js';
import { swingOf, defenceOf } from './fight/mob-swing.ts';
import { setRoamStrikes } from './fight/free-roam.ts';
import { RINGS, ringOf } from './zone/rings.ts';
import RIG from '../data/rig.json' with { type: 'json' };
import PHYSICS from '../data/physics.json' with { type: 'json' };
import type { Fighter } from './fight/duel.ts';
import type { Practice } from './fight/combat.ts';
import type { ZoneRow } from './stubs.ts';
import type { RadarClass } from './fight/radar.ts';

export type MobsRunDeps = {
  zone: ZoneRow; origin: { x: number; z: number };
  bosses: () => readonly { x: number; z: number; leash: number }[];   // the boss spots in the pit frame (live: a lingering boss moves its spot)
  suppress: () => boolean;                                            // a boss fight is on, or the hero is down
  coins: (n: number) => void;                                         // pays a kill's coins (the corpse run's carried coins)
  rangeMetres: number;                                                // the radar's range: only mobs inside it are dots
};

/** Throws on a bad data/mobs.json row (the page stops at load, like every data row). */
export function checkMobs(areaIds: readonly string[]): void {
  const bad = validateMobs(MOBS as never, RIG, RINGS.rings.map((r) => r.id), [...areaIds], PHYSICS as never);
  if (bad.length) throw new Error(`data/mobs.json: ${bad.join('; ')}`);
}

export function createMobsRun(d: MobsRunDeps) {
  checkMobs(d.zone.areas.map((a) => a.id));
  const areas = d.zone.areas.map((a) => ({ id: a.id, x: (a.min[0] + a.max[0]) / 2 - d.origin.x, z: (a.min[1] + a.max[1]) / 2 - d.origin.z }));
  const rings = [...RINGS.rings].sort((p, q) => p.minDist - q.minDist);
  const ringAt = (dist: number): string | undefined => ringOf(dist)?.id ?? [...rings].reverse().find((r) => r.minDist <= dist)?.id ?? rings[0]?.id;
  const C = MOBS.corpse;
  const corpses: { x: number; z: number; age: number }[] = [];   // where held bosses fell (the corpse the any-attack-press cut works on, PR #252 cut.strike.nearM)
  let lastFinish: unknown = null;
  const buf: Pad[] = [];
  const pads = (): readonly Pad[] => {   // the boss circles, then one corpse-cut pad per remembered corpse (nearMetres + the pad margin: nobody spawns or stands where the hero cuts)
    const b = d.bosses(), total = b.length + corpses.length;
    while (buf.length < total) buf.push({ x: 0, z: 0, radius: 0 });
    buf.length = total;
    for (let i = 0; i < b.length; i++) { const p = buf[i]!; p.x = b[i]!.x; p.z = b[i]!.z; p.radius = b[i]!.leash; }
    for (let i = 0; i < corpses.length; i++) { const p = buf[b.length + i]!; p.x = corpses[i]!.x; p.z = corpses[i]!.z; p.radius = C.nearMetres + MOBS.padMetres; }
    return buf;
  };
  /** Remembers a boss kill's corpse, ages the list, and says whether the hero is cutting it now: within the grace after the kill, or within nearMetres of a corpse that still stands. */
  const corpseHold = (practice: Practice, dt: number, hx: number, hz: number): boolean => {
    const fin = practice.finish;
    if (fin && fin.victim === 1 && !fin.draw) {
      if (fin !== lastFinish) { lastFinish = fin; corpses.push({ x: practice.enemy.x, z: practice.enemy.z, age: 0 }); if (corpses.length > C.max) corpses.shift(); }
    } else if (!fin) lastFinish = null;
    let hold = false;
    for (let i = corpses.length - 1; i >= 0; i--) {
      const c = corpses[i]!; c.age += dt;
      if (c.age >= C.holdSeconds) { corpses.splice(i, 1); continue; }
      if (c.age < C.graceSeconds || Math.hypot(c.x - hx, c.z - hz) <= C.nearMetres) hold = true;
    }
    return hold;
  };
  const core = new Mobs({ areas, ringAt, pads });
  setRoamStrikes(MOBS.hero.roamStrikes);   // a hero walking after a boss kill can strike (and roll and guard, as before)
  const hero: Hero = { x: 0, z: 0, heading: 0, alive: true, defence: 0, atFloor: false };
  let on = MOBS.on, last: Fighter | null = null;
  const heat = (e: Killed) => { const h = (globalThis as { __v3Heat?: (e: Killed) => void }).__v3Heat; if (typeof h === 'function') try { h(e); } catch { /* a heat system must never break a kill */ } };
  core.onMobKilled((e) => { d.coins(e.coins); heat(e); });
  let rx = 0, rz = 0, remit: ((x: number, z: number, cls: RadarClass) => void) | null = null;
  const dot = (x: number, z: number) => { if (remit && Math.hypot(x - rx, z - rz) <= d.rangeMetres) remit(x, z, 'mob'); };   // made once: the radar's frame allocates nothing
  const api = {
    core,
    view: core.view as MobView,
    get on() { return on; },
    /** For the tests and stills: where the remembered boss corpses are. */
    get corpses() { return corpses; },
    setOn(v: boolean) { on = v; if (!v) core.reset(); },
    /**
     * One sim tick. `fighter` is the hero's fighter after the tick (the free walker's after a kill); `dt` the tick's seconds. Returns `practice`, with the mobs' damage laid on the hero's health when they landed any
     * (the same object when none did). A mob never makes the lethal blow while the row says so.
     */
    tick(practice: Practice, fighter: Fighter, dt: number): Practice {
      if (!on) return practice;
      const prev = last ?? fighter; last = fighter;
      hero.x = fighter.body.x; hero.z = fighter.body.z; hero.heading = fighter.body.heading; hero.alive = fighter.health > 0 && fighter.phase !== 'dead'; hero.defence = defenceOf(fighter);
      hero.atFloor = !MOBS.hero.lethal && practice.playerHealth <= MOBS.hero.floorHealth;
      const holding = corpseHold(practice, dt, hero.x, hero.z);   // a fresh corpse (or the hero standing at one) keeps every pack quiet
      core.tick(dt, hero, swingOf(prev, fighter), holding || d.suppress() || !hero.alive);
      const hit = core.takeHeroDamage();
      if (!(hit > 0)) return practice;
      const me = practice.duel.fighters[0], floor = MOBS.hero.lethal ? 0 : Math.min(me.health, MOBS.hero.floorHealth), health = Math.max(floor, me.health - hit);
      if (health === me.health) return practice;
      return { ...practice, playerHealth: health, duel: { ...practice.duel, fighters: [{ ...me, health }, practice.duel.fighters[1]] } };
    },
    /** The radar's mob dots: those inside its range only (a swarm on the rim would drown the bosses). */
    radar(heroX: number, heroZ: number, emit: (x: number, z: number, cls: RadarClass) => void): void {
      if (!on) return;
      rx = heroX; rz = heroZ; remit = emit;
      core.forEachAlive(dot);
    },
  };
  return api;
}
export { kindIndex };
