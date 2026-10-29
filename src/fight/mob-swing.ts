// Reads the hero's blow off the sim for the trash mobs (data/mobs.json; src/zone/mobs.ts is the pure core). No duel is spun up for a mob: when the hero's fighter is in the ACTIVE frames of a swing, the swing's own blade sweep
// (bladeImpact: the same baked sweep, the same body capsule the bosses are hit with) is tested against each mob near him, and the damage is the move row's damage times the hit location's row (RULES.location). A move with no
// blade path (a kick, a skill) hits what stands in its reach and arc on its first active tick, as duel.ts does. Also the hero's defence this tick (guard up, or inside a roll's safe frames), which is how a mob's blow is
// turned aside. Pure on the two fighters it is given; allocation-free apart from bladeImpact's own working arrays, which only run during a swing's active ticks for a mob within the swing's reach.
import { bladeImpact } from './blade.ts';
import { RULES } from './moves.ts';
import { timing, movesOf, aim, distance, type Fighter } from './duel.ts';
import { wrapAngle } from './sim.ts';
import { MOBS, type Hero, type Swing } from '../zone/mobs.ts';

let swingId = 0, wasAttacking = false;
let hero: Fighter | null = null, before: Fighter | null = null;

/** The damage the hero's current blow does to a mob at (x, z) facing `heading` (target scale `scale`), 0 for a miss. Reads the fighters set by `swingOf`. */
function hitMob(x: number, z: number, heading: number, scale: number): number {
  const a = hero, b = before;
  if (!a || !b || !a.move) return 0;
  const def = movesOf(a)[a.move], t = timing(a), target = { x, z, heading, distance: 0 };
  if (distance(a.body, target) > def.reach + MOBS.swingMetres) return 0;
  const pathId = a.chained ? def.chainPath : def.path;
  let loc: 'head' | 'torso' | 'legs' | null;
  if (pathId) {
    if (a.age < t.windup || a.age >= t.windup + t.active) return 0;
    loc = bladeImpact(a.rig, a.weapon, pathId, a.age - 1, a.age, b.body, a.body, target, target, scale);
  } else {
    loc = a.age === t.windup && distance(a.body, target) <= def.reach && Math.abs(wrapAngle(aim(a.body, target) - a.body.heading)) < RULES.kickArc ? 'torso' : null;
  }
  if (!loc) return 0;
  return def.damage * RULES.location[loc] * (a.charged ? RULES.charge.damage : 1);
}

const SWING: Swing = { active: false, id: 0, x: 0, z: 0, heading: 0, knockback: 0, hit: hitMob };

/** The hero's swing for this tick, or null when he is not in an attack. `prev` is his fighter before the tick, `cur` after it (the pair duel.ts reads). The same object every call. */
export function swingOf(prev: Fighter, cur: Fighter): Swing | null {
  if (cur.phase !== 'attack' || !cur.move) { wasAttacking = false; return null; }
  if (!wasAttacking || prev.phase !== 'attack' || cur.age < prev.age || cur.move !== prev.move) swingId++;
  wasAttacking = true;
  hero = cur; before = prev;
  const def = movesOf(cur)[cur.move];
  SWING.active = true; SWING.id = swingId; SWING.x = cur.body.x; SWING.z = cur.body.z; SWING.heading = cur.body.heading; SWING.knockback = def.knockback;
  return SWING;
}

/** The hero's defence against a mob's blow this tick: the rows' guard (guard up), the rows' roll (inside the roll's safe frames), else 0. */
export function defenceOf(f: Fighter): number {
  if (f.phase === 'guard') return MOBS.hero.guard;
  if (f.phase === 'roll' && f.age >= RULES.safeStart && f.age <= RULES.safeEnd) return MOBS.hero.roll;
  return 0;
}

/** For tests: the hero as the core reads him. */
export const heroOf = (f: Fighter): Hero => ({ x: f.body.x, z: f.body.z, heading: f.body.heading, alive: f.health > 0 && f.phase !== 'dead', defence: defenceOf(f) });
