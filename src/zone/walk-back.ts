// The boss leash walk-back (Dom 2026-10-27: the boss that chased the hero past its leash used to reset to full health on the spot; now it walks home). Pure rules over the held boss's fighter; no scene,
// no clock, no sim of its own. Past the leash (spawns.ts `leashed`) the boss lets go and WALKS back to its spot at data/respawn.json walkBack.speedMetresPerSecond, regenerating
// walkBack.regenPerSecond of its health a second on the way; it cannot hurt the hero and cannot be hurt (its blows and his are dropped while it walks, as the open world's creatures walk home
// untargetable); on arrival (walkBack.arriveMetres) the page resets it to full health at its spot (main.ts leashReset). Walking back inside its leash with the hero inside its aggro again cancels the walk and the fight goes on.
// ?leash=v1 = the old instant reset. Every number is a row: scripts/as-data/check.mjs scans src/zone/ at zero.
import ROWS from '../../data/respawn.json' with { type: 'json' };
import { M } from '../fight/detmath.ts';
import { STEP } from '../fight/sim.ts';
import { project, type Practice } from '../fight/combat.ts';
import type { Fighter } from '../fight/duel.ts';
import { leashed, type Spawn } from '../stubs.ts';   // spawns.ts is reached through the stub boundary (scripts/check-stubs.mjs)

export type WalkBackRows = { on: boolean; query: string; off: string; speedMetresPerSecond: number; regenPerSecond: number; arriveMetres: number };
type Limits = { walkSpeedMetresPerSecond: [number, number]; walkRegenPerSecond: [number, number]; walkArriveMetres: [number, number] };
export const WALK_BACK = ROWS.walkBack as WalkBackRows;
const LIMITS = ROWS.limits as unknown as Limits;

type At = { x: number; z: number };
const dist = (a: At, b: At): number => M.hypot(a.x - b.x, a.z - b.z);

/** The walk-back is on: the row says so and the link does not carry the off switch (?leash=v1). */
export const walkBackOn = (search: string, rows: WalkBackRows = WALK_BACK): boolean => rows.on && new URLSearchParams(search).get(rows.query) !== rows.off;

/** Throws when a walkBack row is not a number inside its limits (data/respawn.json limits). */
export function validateWalkBack(rows: WalkBackRows = WALK_BACK, limits: Limits = LIMITS): void {
  const pairs: [string, number, [number, number]][] = [['speedMetresPerSecond', rows.speedMetresPerSecond, limits.walkSpeedMetresPerSecond], ['regenPerSecond', rows.regenPerSecond, limits.walkRegenPerSecond], ['arriveMetres', rows.arriveMetres, limits.walkArriveMetres]];
  for (const [name, v, [lo, hi]] of pairs) if (!(Number.isFinite(v) && v >= lo && v <= hi)) throw new Error(`respawn.json walkBack.${name} ${v} is not in ${lo}..${hi}`);
}

/** The boss is home: within `arriveMetres` of its spot. */
export const arrived = (spawn: At, boss: At, rows: WalkBackRows = WALK_BACK): boolean => dist(spawn, boss) <= rows.arriveMetres;

/** Re-aggro: the boss has walked back inside its leash and the hero stands inside its aggro (measured from the boss, where it is now). The walk is off and the fight goes on. */
export const reaggro = (spawn: Spawn, boss: At, hero: At): boolean => !leashed(spawn, boss) && dist(boss, hero) <= spawn.aggro;

/** One sim tick of the boss's walk home: a step of speed * STEP towards the spot (never past it), facing its way, health up by regen of its maximum, ready and idle (no swing, no cast). */
export function walkBackFighter(boss: Fighter, home: At, maxHealth: number, rows: WalkBackRows = WALK_BACK): Fighter {
  const gap = dist(home, boss.body), step = Math.min(gap, rows.speedMetresPerSecond * STEP);
  const body = gap > 0 ? { x: boss.body.x + ((home.x - boss.body.x) / gap) * step, z: boss.body.z + ((home.z - boss.body.z) / gap) * step, heading: M.atan2(home.x - boss.body.x, home.z - boss.body.z), distance: boss.body.distance + step } : boss.body;
  return { ...boss, body, health: Math.min(maxHealth, boss.health + maxHealth * rows.regenPerSecond * STEP), phase: 'ready', move: null, age: 0, buffer: null, attackFrom: null, missile: undefined, stun: 0 };
}

/**
 * The tick a walking boss is in: `prior` is the practice as the tick began, `stepped` the same tick stepped by stepPractice. The hero's body and moves are the stepped ones, but his health is
 * what it was (the boss struck nothing) and the tick's events are dropped (his blows land on nobody); the boss is the walker. Returns the practice projected from that duel.
 */
export function holdBack(prior: Practice, stepped: Practice, home: At, rows: WalkBackRows = WALK_BACK): Practice {
  const hero = { ...stepped.duel.fighters[0], health: Math.max(stepped.duel.fighters[0].health, prior.duel.fighters[0].health) };
  const walker = walkBackFighter(prior.duel.fighters[1], home, prior.enemyMaxHealth, rows);
  return project({ ...stepped.duel, fighters: [hero, walker], events: [], finish: null }, stepped.ai, stepped);
}
