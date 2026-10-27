// Real-time zone aggro (Dom 2026-10-27: a boss whose aggro range you enter attacks even while you fight another). Pure rules over the zone row's spawns; no scene, no sim, no clock.
// The page (src/client/main.ts) keeps its one duel with the held boss and, for every OTHER standing spawn the hero walks into, one more duel against that boss (src/fight/attacker-bout.ts),
// all drawing on the hero's one health pool. These rules say WHO joins and WHO lets go; every number is a row (the zone row's aggro and leash, world-rules maxAttackers via MAX_ATTACKERS,
// data/respawn.json attackers). No string or number literal lives here: scripts/as-data/check.mjs scans src/zone/ at zero.
import ROWS from '../../data/respawn.json' with { type: 'json' };
import { M } from '../fight/detmath.ts';
import { MAX_ATTACKERS } from '../fight/attackers.ts';
import { isStanding, leashed, type Spawn } from '../stubs.ts';   // spawns.ts is reached through the stub boundary (scripts/check-stubs.mjs); the cycle is only read inside functions

export type FramingRows = { widenAtMetres: number; maxWiden: number; easeSeconds: number };
export type AttackerRows = { on: boolean; query: string; off: string; camera: FramingRows };
export const ATTACKERS = ROWS.attackers as AttackerRows;
export { MAX_ATTACKERS };

type At = { x: number; z: number };
const dist = (a: At, b: At): number => M.hypot(a.x - b.x, a.z - b.z);

/** Attackers are on: the row says so and the link does not carry the off switch. */
export const attackersOn = (search: string, rows: AttackerRows = ATTACKERS): boolean => rows.on && new URLSearchParams(search).get(rows.query) !== rows.off;

/**
 * The spawns that join the fight now: standing, not the held one, not already fighting, the hero inside their aggro. Nearest first (ties to the earlier spawn),
 * and no more than the cap leaves room for: `live` counts the attackers already on him, the held boss is one more.
 */
export function joiners(spawns: readonly Spawn[], current: number, live: readonly number[], hero: At, cap: number = MAX_ATTACKERS): number[] {
  const room = Math.max(0, cap - 1 - live.length);
  const near: number[] = [];
  spawns.forEach((s, i) => { if (i !== current && !live.includes(i) && isStanding(s) && dist(s, hero) <= s.aggro) near.push(i); });
  near.sort((a, b) => dist(spawns[a]!, hero) - dist(spawns[b]!, hero) || a - b);
  return near.slice(0, room);
}

/** The attackers that let go: the attacker itself (`where(index)`, its position) is further from its own spot than its leash. */
export const dropped = (spawns: readonly Spawn[], live: readonly number[], where: (index: number) => At): number[] => live.filter((i) => leashed(spawns[i]!, where(i)));

/** Throws on a bad framing row: the distance and the ease must be positive, the widest the camera may back off at least the one-boss frame. */
export function validateFraming(rows: FramingRows = ATTACKERS.camera): void {
  if (!(Number.isFinite(rows.widenAtMetres) && rows.widenAtMetres > 0)) throw new Error(`respawn.json attackers.camera.widenAtMetres ${rows.widenAtMetres} is not above 0`);
  if (!(Number.isFinite(rows.maxWiden) && rows.maxWiden >= 1)) throw new Error(`respawn.json attackers.camera.maxWiden ${rows.maxWiden} is not at least 1`);
  if (!(Number.isFinite(rows.easeSeconds) && rows.easeSeconds > 0)) throw new Error(`respawn.json attackers.camera.easeSeconds ${rows.easeSeconds} is not above 0`);
}

/** How far the lock camera backs off so every live attacker stays in frame: the frame is centred on `centre` (half way between the hero and the first boss); an attacker further than widenAtMetres from it widens by distance / widenAtMetres, capped at maxWiden. No attacker: exactly 1. */
export function framingWiden(centre: At, others: readonly At[], rows: FramingRows = ATTACKERS.camera, zoom = 1): number {   // zoom: the lens zoom (camera-zoom.ts); a zoomed lens sees 1 / zoom as much, so the same attacker needs `zoom` times the back-off; zoom 1 = the rows as written
  let widen = 1;
  for (const o of others) widen = Math.max(widen, Math.min(rows.maxWiden, dist(o, centre) * zoom / rows.widenAtMetres));
  return widen;
}
