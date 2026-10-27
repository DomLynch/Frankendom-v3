// V3 zone loop, phase 1 (Dom 2026-10-27: "once the game ends you're frozen ... it's a real-time zone like Dungeon 1"): what a page does after a
// kill, read from the zone row (data/zones/zone1.row.json via src/zone/zone-rows.ts: spawn rows, respawnSeconds, the hero's respawn point and
// downSeconds) and data/respawn.json (the roam rows and the way-back flag). Pure rules; the sim is untouched: this file is presentation timing and
// the hero's post-kill walk. No timing, label or id literal lives here, every one is a row (scripts/as-data/check.mjs scans this file at zero).
// How long a corpse stays is Physics Dev's row (data/physics.json corpse.keepSeconds, ragdoll.leaveCorpse at the respawn), not one here.
// A zone holds a LIST of spawn rows; phase 1b (src/zone/spawns.ts) plays all of them, one duel sim at a time (the held spawn), the rest standing at their spots.
import ROWS from '../../data/respawn.json' with { type: 'json' };
import { M } from './detmath.ts';
import { advance, type State } from './sim.ts';
import { OPEN_RADIUS } from './play-radius.ts';
import type { ZoneRow } from '../stubs.ts';

type Rows = { flag: { query: string; off: string }; postKill: { roam: boolean; startAfterSeconds: number; walkRadiusMetres: number | null; cameraMetres: number }; spawn: { minDistance: number }; heroDeath: { fallSeconds: number }; limits: { walkRadiusMetres: [number, number]; cameraMetres: [number, number]; startAfterSeconds: [number, number]; minDistance: [number, number]; fallSeconds: [number, number] } };
const LOOP = ROWS as unknown as Rows;

/** What the page plays: the zone's first spawn, the hero's down time, the roam hand-over. */
export type Respawn = { readonly walkRadius: number; readonly cameraMetres: number; readonly startAfterSeconds: number; readonly minDistance: number; readonly diedSeconds: number; readonly fallSeconds: number; readonly zone: string; readonly spawn: { readonly id: string; readonly kind: string; readonly respawnSeconds: number } };

/** Throws on a bad roam row, or a first spawn whose `kind` is no opponent (`opponents`, optional). */
export function validateLoop(rows: Rows, zone: ZoneRow, opponents?: readonly string[]): void {
  const [lo, hi] = rows.limits.startAfterSeconds, at = rows.postKill.startAfterSeconds;
  if (!(Number.isFinite(at) && at >= lo && at <= hi)) throw new Error(`respawn.json postKill.startAfterSeconds ${at} is not in ${lo}..${hi}`);
  const [walkLo, walkHi] = rows.limits.walkRadiusMetres, walk = rows.postKill.walkRadiusMetres;
  if (walk !== null && !(Number.isFinite(walk) && walk >= walkLo && walk <= walkHi)) throw new Error(`respawn.json postKill.walkRadiusMetres ${walk} is not in ${walkLo}..${walkHi}`);
  const [camLo, camHi] = rows.limits.cameraMetres, cam = rows.postKill.cameraMetres;
  if (!(Number.isFinite(cam) && cam >= camLo && cam <= camHi)) throw new Error(`respawn.json postKill.cameraMetres ${cam} is not in ${camLo}..${camHi}`);
  const [near, far] = rows.limits.minDistance, gap = rows.spawn.minDistance;
  if (!(Number.isFinite(gap) && gap >= near && gap <= far)) throw new Error(`respawn.json spawn.minDistance ${gap} is not in ${near}..${far}`);
  const [short, long] = rows.limits.fallSeconds, fall = rows.heroDeath.fallSeconds;
  if (!(Number.isFinite(fall) && fall >= short && fall <= long)) throw new Error(`respawn.json heroDeath.fallSeconds ${fall} is not in ${short}..${long}`);
  if (fall > zone.respawn.downSeconds) throw new Error(`respawn.json heroDeath.fallSeconds ${fall} is longer than zone ${zone.id} respawn.downSeconds ${zone.respawn.downSeconds}`);
  if (!zone.spawns[0]) throw new Error(`zone ${zone.id} has no spawn row`);
  for (const spawn of zone.spawns) if (opponents && !opponents.includes(spawn.kind)) throw new Error(`zone ${zone.id} spawn ${spawn.id} names unknown kind "${spawn.kind}"`);
}

/** The zone loop a page plays: the flag (`?postkill=v1`) or roam off is the frozen end screen (null); otherwise the zone row's first spawn. */
export function zoneLoopFor(zone: ZoneRow, search = '', opponents?: readonly string[], rows: Rows = LOOP): Respawn | null {
  validateLoop(rows, zone, opponents);
  if (new URLSearchParams(search).get(rows.flag.query) === rows.flag.off || !rows.postKill.roam) return null;
  const s = zone.spawns[0]!;
  return { walkRadius: rows.postKill.walkRadiusMetres ?? OPEN_RADIUS, cameraMetres: rows.postKill.cameraMetres, startAfterSeconds: rows.postKill.startAfterSeconds, minDistance: rows.spawn.minDistance, diedSeconds: zone.respawn.downSeconds, fallSeconds: rows.heroDeath.fallSeconds, zone: zone.id, spawn: { id: s.id, kind: s.kind, respawnSeconds: s.respawnSeconds } };   // `spawn`: the first row; the page plays every row (src/zone/spawns.ts)
}

/** Whether a spawn's new opponent stands `since` seconds after its kill. */
export const respawnDue = (spawn: { respawnSeconds: number }, since: number): boolean => since >= spawn.respawnSeconds;

/** Throws when the zone's walking radius is smaller than the pit's wall (the hero could not even stand where the fight left him). */
export function validateWalk(walkRadius: number, pitWall: number): void {
  if (!(walkRadius >= pitWall)) throw new Error(`respawn.json postKill.walkRadiusMetres ${walkRadius} is smaller than the pit's wall ${pitWall}`);
}

/** A hero beyond the pit's wall (the zone's free walk) enters a duel on the wall's edge, in line with where he stood: the sim's circle is the pit. */
export function intoPit(at: { x: number; z: number }, wall: number): { x: number; z: number } {
  const r = M.hypot(at.x, at.z);
  const k = wall / r * (1 - Number.EPSILON);   // one rounding step inside the wall, so the pose check (hypot > wall) never trips on float error
  return r > wall ? { x: at.x * k, z: at.z * k } : { x: at.x, z: at.z };
}

/** One tick of the hero's walk after the kill: the sim's own movement (sim.ts advance), stopped by the corpse and `wall` (the pit's wall, or the zone's walking radius, data/respawn.json postKill.walkRadiusMetres). */
export const roamStep = (body: State, move: { x: number; z: number; yaw: number; run: boolean }, corpse: { x: number; z: number }, wall: number): State =>
  advance(body, move, corpse, 1, wall);

/**
 * The duel pose of a respawn: the opponent at the pit's mark, the hero where he stands, but never closer than `minDistance` (data/respawn.json spawn):
 * a hero who walked up to the corpse is stepped straight back from the mark to that distance. Null (the pit's marks for both) when the mark or the
 * stepped-back place is outside the wall.
 */
export function respawnPose(hero: { x: number; z: number }, mark: { x: number; z: number }, wall: number, minDistance: number): { hero: { x: number; z: number }; foe: { x: number; z: number }; heroFacing: number } | null {
  const dx = hero.x - mark.x, dz = hero.z - mark.z, gap = M.hypot(dx, dz);
  const at = gap >= minDistance ? hero : { x: mark.x + (gap ? dx / gap : 0) * minDistance, z: mark.z + (gap ? dz / gap : 1) * minDistance };
  if (M.hypot(mark.x, mark.z) > wall || M.hypot(at.x, at.z) > wall) return null;
  return { hero: { x: at.x, z: at.z }, foe: { x: mark.x, z: mark.z }, heroFacing: M.atan2(mark.x - at.x, mark.z - at.z) };
}
