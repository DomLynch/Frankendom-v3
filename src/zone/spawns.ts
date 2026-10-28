// Live-zone phase 1b (Dom 2026-10-27: "walk around normally, and the bosses just spawn"): several bosses at their spots, each with its own timers.
// Pure rules over the zone row (data/zones/zone1.row.json via zone-rows.ts) and data/respawn.json `world`; no scene, no sim, no clock of its own. The page
// (src/client/main.ts) keeps ONE duel sim, as it always did: it holds the spawn the hero is nearest to, the others stand as frozen copies at their spots, and
// the hero's walking into a standing spawn's aggro hands the sim to that spawn (`inAggro`). A kill starts only that spawn's timer (`kill`, `tick`), a hero
// beyond the held spawn's leash resets it (`leashed`). Every number is a row (the zone row's aggro, leash, respawnSeconds, position; respawn.json world).
// No string or number literal lives here: scripts/as-data/check.mjs scans src/zone/ at zero.
import ROWS from '../../data/respawn.json' with { type: 'json' };
import { M } from '../fight/detmath.ts';
import { respawnPose, intoPit } from '../fight/zone-loop.ts';
import { OPEN_RADIUS } from '../fight/play-radius.ts';
import type { Duel, DuelPose } from '../fight/duel.ts';
import type { ZoneRow } from '../stubs.ts';
import { ringLoadAfterKill } from './rings.ts';

export type WorldRows = { pitArea: string; centre: number; retargetMargin: number; edgeMetres: number; minSpacing: number; startClearance: number; leashMargin: number; pitScale: number; spreadRadiusMetres: number; loadWithinMetres: number; loadAfterKill: boolean; loadRadiusAfterKillMetres: number; loadQuery: string; loadOff: string };   // loadWithinMetres: a spawn in another body than the live rig loads that body's file only when the hero is within this many metres (first-visit weight)
type Limits ={ retargetMargin: [number, number]; edgeMetres: [number, number]; centre: [number, number]; minSpacing: [number, number]; startClearance: [number, number]; leashMargin: [number, number]; pitScale: [number, number]; spreadRadiusMetres: [number, number]; loadWithinMetres: [number, number]; loadRadiusAfterKillMetres: [number, number] };
export const WORLD = ROWS.world as WorldRows;
const LIMITS = ROWS.limits as unknown as Limits;

type At = { x: number; z: number };
/** A boss's spot in the pit's own frame (metres, the sim's axes) with the zone row's behaviour. */
export type Spot = { id: string; kind: string; x: number; z: number; aggro: number; leash: number; respawnSeconds: number; body?: string };   // body: the zone row's per-spawn body (a data/rig.json files stem), absent for its kind's profile body
/** A spawn: its spot and how long it has been dead (null = standing). The state machine is these two fields plus which spawn the sim holds (main.ts). */
export type Spawn = Spot & { deadFor: number | null };

const dist = (a: At, b: At): number => M.hypot(a.x - b.x, a.z - b.z);

/** The pit's centre in the zone's frame: the zone area `pitArea`, `centre` of the way across each axis. Throws when the zone has no such area. */
export function pitOrigin(zone: ZoneRow, world: WorldRows = WORLD): At {
  const area = zone.areas.find((a) => a.id === world.pitArea);
  if (!area) throw new Error(`zone ${zone.id} has no area "${world.pitArea}" (respawn.json world.pitArea)`);
  return { x: area.min[0] + (area.max[0] - area.min[0]) * world.centre, z: area.min[1] + (area.max[1] - area.min[1]) * world.centre };
}

/** Every spawn row of the zone as a spot in the pit's frame. */
export function spotsFor(zone: ZoneRow, world: WorldRows = WORLD): Spot[] {
  const o = pitOrigin(zone, world);
  return zone.spawns.map((s) => ({ id: s.id, kind: s.kind, x: s.position.x - o.x, z: s.position.z - o.z, aggro: s.behaviour.aggro, leash: s.behaviour.leash, respawnSeconds: s.respawnSeconds, ...(s.body === undefined ? {} : { body: s.body }) }));
}

/**
 * Throws on a bad row or a spot the page cannot stand a boss at: world rows out of range, a spot whose reach is past the spawn extent (its distance from the pit area's centre plus the larger of
 * its leash and `wall`, the drawn floor's play radius, is over `spreadRadiusMetres`: the ground itself is unbounded, this is only how far out spots go), a leash shorter than the aggro plus
 * `leashMargin`, the hero's start inside a spot's aggro (the page would open with a fight), two spots inside each other's aggro (an engage would be
 * ambiguous) or closer than `minSpacing`, or a spawn kind that is no profile row (`kinds`, optional: the data/profiles.json ids; every spawn fights as its own kind, src/fight/spawn-kind.ts).
 */
export function validateSpots(spots: readonly Spot[], heroStart: At, wall: number, world: WorldRows = WORLD, kinds?: readonly string[], limits: Limits = LIMITS): void {
  for (const key of ['retargetMargin', 'edgeMetres', 'centre', 'minSpacing', 'startClearance', 'leashMargin', 'pitScale', 'spreadRadiusMetres', 'loadWithinMetres', 'loadRadiusAfterKillMetres'] as const) {
    const [lo, hi] = limits[key], v = world[key];
    if (!(Number.isFinite(v) && v >= lo && v <= hi)) throw new Error(`respawn.json world.${key} ${v} is not in ${lo}..${hi}`);
  }
  if (!spots.length) throw new Error('the zone has no spawn spots');
  for (const s of spots) {
    if (kinds !== undefined && !kinds.includes(s.kind)) throw new Error(`spawn ${s.id} names kind "${s.kind}", which is no profile row (data/profiles.json: ${kinds.join(', ')})`);
    if (!(Number.isFinite(s.x) && Number.isFinite(s.z))) throw new Error(`spawn ${s.id} has no place`);
    const reach = M.hypot(s.x, s.z) + Math.max(s.leash, wall);
    if (reach > world.spreadRadiusMetres) throw new Error(`spawn ${s.id} stands outside the zone's spawn extent (its reach is ${reach} m, respawn.json world.spreadRadiusMetres ${world.spreadRadiusMetres} m)`);
    if (s.leash < s.aggro + world.leashMargin) throw new Error(`spawn ${s.id} leash ${s.leash} m is shorter than its aggro ${s.aggro} m plus ${world.leashMargin} m (respawn.json world.leashMargin): a roll or a step in a fight would trip it`);
    if (dist(s, heroStart) <= s.aggro) throw new Error(`spawn ${s.id} stands inside its own aggro of the hero's start`);
    for (const t of spots) if (t !== s && dist(s, t) <= s.aggro) throw new Error(`spawns ${s.id} and ${t.id} stand inside each other's aggro`);
    for (const t of spots) if (t !== s && dist(s, t) < world.minSpacing) throw new Error(`spawns ${s.id} and ${t.id} stand closer than ${world.minSpacing} m (respawn.json world.minSpacing)`);
  }
  const opener = spots.reduce((a, b) => (dist(b, heroStart) < dist(a, heroStart) ? b : a));   // the newcomer's own boss (the opener's yard Pitborn) is the one allowed near the start
  for (const s of spots) if (s !== opener && dist(s, heroStart) < world.startClearance) throw new Error(`spawn ${s.id} stands ${dist(s, heroStart)} m from the hero's start, closer than ${world.startClearance} m (respawn.json world.startClearance): only the nearest boss may be near the newcomer`);
  if (new Set(spots.map((s) => s.id)).size !== spots.length) throw new Error('two spawns share an id');
}

export const standing = (spawns: readonly Spawn[]): Spawn[] => spawns.map((s) => ({ ...s, deadFor: null }));
export const isStanding = (s: Spawn): boolean => s.deadFor === null;

/** Index of the standing spawn nearest `at`, or -1 when every spawn is dead. */
export function nearestStanding(spawns: readonly Spawn[], at: At): number {
  let best = -1;
  spawns.forEach((s, i) => { if (isStanding(s) && (best < 0 || dist(s, at) < dist(spawns[best]!, at))) best = i; });
  return best;
}

/** Is the hero close enough to `s` for its body file to be fetched (respawn.json world.loadWithinMetres)? A spawn beyond it draws nothing and requests nothing (the 2026-10-28 weight finding: both boss GLBs were fetched at load, +3.1 MB first visit). */
export const withinLoad = (s: At & { id?: string }, hero: At, world: Pick<WorldRows, 'loadWithinMetres'> & Partial<Pick<WorldRows, 'loadAfterKill' | 'loadRadiusAfterKillMetres'>> = WORLD, killed = false): boolean => dist(s, hero) <= (killed && world.loadAfterKill ? Math.max(world.loadWithinMetres, s.id === undefined ? world.loadRadiusAfterKillMetres ?? 0 : ringLoadAfterKill(s.id, world.loadRadiusAfterKillMetres ?? 0)) : world.loadWithinMetres);   // a ring 2 or 3 spawn (data/rings.json loadAfterKillMetres) is fetched only when the hero walks up to it, never in the background after the first kill
/** Dom 2026-10-28 "I don't see the new bosses 2 and 3": after the FIRST KILL (the roam starts) bosses within world.loadRadiusAfterKillMetres are fetched and stand visible at their spots; before any kill the first visit is unchanged. ?bossload=v1 (world.loadQuery/loadOff) keeps the near-only load. */
export const bossLoadAfterKill = (search: string, world: Pick<WorldRows, 'loadAfterKill' | 'loadQuery' | 'loadOff'> = WORLD): boolean => world.loadAfterKill && new URLSearchParams(search).get(world.loadQuery) !== world.loadOff;

/** The standing spawn nearest the hero among those whose aggro he is inside, or -1: the one he has walked up to. */
export function inAggro(spawns: readonly Spawn[], at: At): number {
  let best = -1;
  spawns.forEach((s, i) => { if (isStanding(s) && dist(s, at) <= s.aggro && (best < 0 || dist(s, at) < dist(spawns[best]!, at))) best = i; });
  return best;
}

/** The spawn the sim holds while nobody has engaged: `current` stays while it stands unless another standing spawn is nearer the hero by `margin` (no flicker half-way between two). -1: none stands. */
export function held(spawns: readonly Spawn[], current: number, at: At, margin: number): number {
  const best = nearestStanding(spawns, at), now = spawns[current];
  if (best < 0) return -1;
  return now && isStanding(now) && dist(now, at) - dist(spawns[best]!, at) <= margin ? current : best;
}

/** The held spawn's leash (MMO-style: the boss leaving its camp, not the hero crossing a line): `at`, the BOSS's own position, is further from the spot than the row allows. Callers pass the boss, never the hero. */
export const leashed = (spawn: Spawn, at: At, lift = 0): boolean => dist(spawn, at) > spawn.leash + lift;   // lift: the opener's reach (openers.reachMetres), 0 for every other fight

/** The spawn is killed: its timer starts, nobody else's moves. */
export const kill = (spawns: readonly Spawn[], index: number): Spawn[] => spawns.map((s, i) => (i === index ? { ...s, deadFor: 0 } : s));

/** `dt` seconds pass: every dead spawn's timer runs, and the ones whose own respawnSeconds are up stand again (`due`, their indices). */
export function tick(spawns: readonly Spawn[], dt: number): { spawns: Spawn[]; due: number[] } {
  const due: number[] = [];
  const next = spawns.map((s, i) => {
    if (s.deadFor === null) return s;
    const age = s.deadFor + dt;
    if (age < s.respawnSeconds) return { ...s, deadFor: age };
    due.push(i);
    return { ...s, deadFor: null };
  });
  return { spawns: next, due };
}

/** The spawns drawn as frozen standing copies: every standing one except the one the sim holds (that one is the live rig). */
export const idleOnes = (spawns: readonly Spawn[], current: number): Spawn[] => spawns.filter((s, i) => isStanding(s) && i !== current);

/** Whether the sim's own pose door takes this pose: both fighters inside the live wall (duel.ts validatePose, `wall` = the pit's RADIUS). A pose that does not fit is placed by `zoneDuel` instead. */
export const poseFits = (pose: DuelPose, wall: number): boolean => [pose.hero, pose.foe].every((p) => M.hypot(p.x, p.z) <= wall);

/**
 * A zone duel on the zone's ground (PR B2). The sim's circle is centred on the pit and its pose door refuses a fighter outside it (duel.ts validatePose), so a fight at a spot far from the pit
 * cannot be built or fought inside the pit's ring. Two things, both on the duel the page already built, neither in the sim:
 *  - the WALL: the zone's duels carry the open world's radius (`open`, play-radius.ts OPEN_RADIUS, V1's open-fight.ts: nothing clamps, loiters or is shoved at a wall), the field `Duel.radius`
 *    the sim already reads (duel.ts: `duel.radius ?? RADIUS`). The pair fights where they stand; the arena is the boss's leash circle around its spot (`leashed` lets the hero go and resets it);
 *  - the PLACE: a `pose` the sim's door would refuse (`poseFits` false: a fighter beyond the pit's wall) is put on the finished duel by hand, both bodies set to where the pair stand, the foe
 *    facing the hero. The caller builds that duel without a pose (the pit's marks), so nothing but the two bodies' x, z and heading differs from a fight begun at the marks. A pose that fits is the
 *    sim's own and this leaves it alone. Fights of the zone only: a duel that never passes through here (the single fight, ?postkill=v1, Gate 0) keeps `radius` absent, byte for byte.
 */
export function zoneDuel<D extends Duel>(duel: D, pose?: DuelPose, open: number = OPEN_RADIUS): D {
  const [hero, foe] = duel.fighters;
  const placed = pose ? [{ ...hero, body: { ...hero.body, x: pose.hero.x, z: pose.hero.z, heading: pose.heroFacing } }, { ...foe, body: { ...foe.body, x: pose.foe.x, z: pose.foe.z, heading: M.atan2(pose.hero.x - pose.foe.x, pose.hero.z - pose.foe.z) } }] as D['fighters'] : duel.fighters;
  const freed = [{ ...placed[0], free: true }, placed[1]] as D['fighters'];   // the zone's hero rolls, steps back and guards with the sword away too (duel.ts freeStep): never gated on a fight
  return { ...duel, fighters: freed, radius: open };
}

/**
 * The duel pose of a spawn engaging the hero where he stands, anywhere in the world: placed relative to the SPOT, never to a fixed start (`wall` is the page's open radius, play-radius.ts
 * OPEN_RADIUS, so nothing is out of reach); never closer than `minDistance` (he is stepped back along the line from the spot, zone-loop.ts respawnPose). With the open radius the hero is
 * never drawn anywhere on the way into a fight (zone-loop.ts intoPit only acts beyond a finite `wall`).
 */
export function poseAt(walker: At, spot: At, wall: number, minDistance: number, start: At): NonNullable<ReturnType<typeof respawnPose>> {
  const hero = intoPit(walker, wall);
  return respawnPose(hero, spot, wall, minDistance) ?? respawnPose(start, spot, wall, minDistance) ?? { hero: { x: start.x, z: start.z }, foe: { x: spot.x, z: spot.z }, heroFacing: M.atan2(spot.x - start.x, spot.z - start.z) };
}

// The opener (V1's `openers`, data/respawn.json openers): a newcomer who stands still still gets a fight. Choice (smallest correct): the opener spawn's AGGRO RANGE grows to reach the
// hero once the idle clock is due, so the page's existing engagement (inAggro -> engaged / hand, auto-draw, the boss walks up in the sim) runs unchanged; no new fight code, no walking
// rule of its own. The reach stops at `withinMetres` from the opener spawn (a row, validated: at least that spawn's aggro; the newcomer at the mark stands about 8.8 m from the yard Pitborn), so an idle hero further off is left alone (the 20 m leash plus reachMetres would have pulled a newcomer from 25 m). The page still lifts the leash by `reachMetres` for that fight.
export type OpenerRows = { on: boolean; delaySeconds: number; count: number; reachMetres: number; withinMetres: number; spawns: string[]; query: string; off: string };
type OpenerLimits = { delaySeconds: [number, number]; count: [number, number]; reachMetres: [number, number]; withinMetres: [number, number] };
export const OPENERS = ROWS.openers as OpenerRows;
const OPENER_LIMITS = ROWS.limits as unknown as OpenerLimits;

/** Throws on a bad openers row: delay or count out of range, no spawn ids, or an id that is no spawn of the zone. */
export function validateOpeners(rows: OpenerRows, spots: readonly Spot[], limits: OpenerLimits = OPENER_LIMITS): void {
  for (const key of ['delaySeconds', 'count', 'reachMetres', 'withinMetres'] as const) {
    const [lo, hi] = limits[key], v = rows[key];
    if (!(Number.isFinite(v) && v >= lo && v <= hi)) throw new Error(`respawn.json openers.${key} ${v} is not in ${lo}..${hi}`);
  }
  if (!Array.isArray(rows.spawns) || !rows.spawns.length) throw new Error('respawn.json openers.spawns names no spawn');
  for (const id of rows.spawns) if (!spots.some((s) => s.id === id)) throw new Error(`respawn.json openers.spawns names "${id}", which is no spawn of the zone`);
  for (const id of rows.spawns) { const s = spots.find((t) => t.id === id); if (s && rows.withinMetres < s.aggro) throw new Error(`respawn.json openers.withinMetres ${rows.withinMetres} is shorter than ${id}'s aggro ${s.aggro}`); }
}

/** The openers are on: the row says so and the link does not carry the off switch. */
export const openerOn = (search: string, rows: OpenerRows = OPENERS): boolean => rows.on && new URLSearchParams(search).get(rows.query) !== rows.off;

/** The leash lift of a fight with `spawn` while the opener is due: `reachMetres` for an opener spawn (rows.spawns), 0 for any other boss. */
export const openerLeashLift = (spawn: Spawn | undefined, rows: OpenerRows = OPENERS): number => (spawn && rows.spawns.includes(spawn.id) ? rows.reachMetres : 0);

/** The spawns as the engagement sees them after `idle` seconds with nobody engaged: once `delaySeconds` is up, the first `count` standing opener spawns reach the hero (aggro = his distance, at most withinMetres). */
export function openerReach(spawns: readonly Spawn[], rows: OpenerRows, idle: number, at: At): Spawn[] {
  if (!(idle >= rows.delaySeconds)) return spawns.slice();
  const open = new Set(rows.spawns.map((id) => spawns.find((s) => s.id === id)).filter((s): s is Spawn => !!s && isStanding(s)).slice(0, rows.count));
  return spawns.map((s) => (open.has(s) ? { ...s, aggro: Math.max(s.aggro, Math.min(dist(s, at), rows.withinMetres)) } : s));
}
