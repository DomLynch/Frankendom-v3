// Live-zone phase 1b (Dom 2026-10-27: "walk around normally, and the bosses just spawn"): several bosses at their spots, each with its own timers.
// Pure rules over the zone row (data/zones/zone1.row.json via zone-rows.ts) and data/respawn.json `world`; no scene, no sim, no clock of its own. The page
// (src/client/main.ts) keeps ONE duel sim, as it always did: it holds the spawn the hero is nearest to, the others stand as frozen copies at their spots, and
// the hero's walking into a standing spawn's aggro hands the sim to that spawn (`inAggro`). A kill starts only that spawn's timer (`kill`, `tick`), a hero
// beyond the held spawn's leash resets it (`leashed`). Every number is a row (the zone row's aggro, leash, respawnSeconds, position; respawn.json world).
// No string or number literal lives here: scripts/as-data/check.mjs scans src/zone/ at zero.
import ROWS from '../../data/respawn.json' with { type: 'json' };
import { M } from '../fight/detmath.ts';
import { respawnPose, intoPit } from '../fight/zone-loop.ts';
import type { ZoneRow } from '../stubs.ts';

export type WorldRows = { pitArea: string; centre: number; retargetMargin: number; edgeMetres: number; minSpacing: number; leashMargin: number; pitScale: number };
type Limits = { retargetMargin: [number, number]; edgeMetres: [number, number]; centre: [number, number]; minSpacing: [number, number]; leashMargin: [number, number]; pitScale: [number, number] };
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
 * Throws on a bad row or a spot the page cannot stand a boss at: world rows out of range, a spot outside the pit's wall (less `edgeMetres`), the hero's start
 * inside a spot's aggro (the page would open with a fight), two spots inside each other's aggro (an engage would be ambiguous), or a spawn kind that is not the
 * one foe rig the page loads (`kind`, optional: one rig is built, so every spawn is that opponent today).
 */
export function validateSpots(spots: readonly Spot[], heroStart: At, wall: number, world: WorldRows = WORLD, kind?: string, limits: Limits = LIMITS): void {
  for (const key of ['retargetMargin', 'edgeMetres', 'centre', 'minSpacing', 'leashMargin', 'pitScale'] as const) {
    const [lo, hi] = limits[key], v = world[key];
    if (!(Number.isFinite(v) && v >= lo && v <= hi)) throw new Error(`respawn.json world.${key} ${v} is not in ${lo}..${hi}`);
  }
  if (!spots.length) throw new Error('the zone has no spawn spots');
  for (const s of spots) {
    if (kind !== undefined && s.kind !== kind) throw new Error(`spawn ${s.id} names kind "${s.kind}": the page builds one foe rig, "${kind}"`);
    if (!(Number.isFinite(s.x) && Number.isFinite(s.z)) || M.hypot(s.x, s.z) > wall - world.edgeMetres) throw new Error(`spawn ${s.id} stands outside the pit's wall (${wall} m less ${world.edgeMetres} m)`);
    if (s.leash < s.aggro + world.leashMargin) throw new Error(`spawn ${s.id} leash ${s.leash} m is shorter than its aggro ${s.aggro} m plus ${world.leashMargin} m (respawn.json world.leashMargin): a roll or a step in a fight would trip it`);
    if (dist(s, heroStart) <= s.aggro) throw new Error(`spawn ${s.id} stands inside its own aggro of the hero's start`);
    for (const t of spots) if (t !== s && dist(s, t) <= s.aggro) throw new Error(`spawns ${s.id} and ${t.id} stand inside each other's aggro`);
    for (const t of spots) if (t !== s && dist(s, t) < world.minSpacing) throw new Error(`spawns ${s.id} and ${t.id} stand closer than ${world.minSpacing} m (respawn.json world.minSpacing)`);
  }
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

/** The duel pose of a spawn engaging the hero where he stands (never closer than `minDistance`: he is stepped back, zone-loop.ts respawnPose); outside the wall, the hero's start mark. */
export function poseAt(walker: At, spot: At, wall: number, minDistance: number, start: At): NonNullable<ReturnType<typeof respawnPose>> {
  const hero = intoPit(walker, wall);   // the zone's free walk (postKill.walkRadiusMetres) can leave him beyond the pit's wall: a duel starts on the wall's edge, in line with where he stood
  return respawnPose(hero, spot, wall, minDistance) ?? respawnPose(start, spot, wall, minDistance) ?? { hero: { x: start.x, z: start.z }, foe: { x: spot.x, z: spot.z }, heroFacing: M.atan2(spot.x - start.x, spot.z - start.z) };
}

// The opener (V1's `openers`, data/respawn.json openers): a newcomer who stands still still gets a fight. Choice (smallest correct): the opener spawn's AGGRO RANGE grows to reach the
// hero once the idle clock is due, so the page's existing engagement (inAggro -> engaged / hand, auto-draw, the boss walks up in the sim) runs unchanged; no new fight code, no walking
// rule of its own. The reach stops at `withinMetres` from the opener spawn (a row, validated: at least that spawn's aggro; the newcomer at the mark stands about 6 m from the yard Pitborn), so an idle hero further off is left alone (the 20 m leash plus reachMetres would have pulled a newcomer from 25 m). The page still lifts the leash by `reachMetres` for that fight.
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
