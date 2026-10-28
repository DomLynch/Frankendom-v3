// BIOME RINGS (data/rings.json; Dom 2026-10-28: "no switches, just get everything live in game"). The zone's spawns stand in rings by distance from the duel pit's centre. Ring 1 is the zone
// row's own three bosses, untouched; rings 2 and 3 add the spawns the rows name (`ringedZone`), each drawn in its own body through the spawn's per-spawn `body`, each ring with its own difficulty
// multiplier (`ringTune`, laid over the bosses as a ?tune= map), ground tint and sky-plate weights (`ringBlend`, mixed by the hero's distance). Pure rules over rows: no scene, no sim, no clock.
// No string or number literal lives here beyond 0 and 1 (scripts/as-data/check.mjs scans src/zone/ at zero): every value, id and label is a row.
import ROWS from '../../data/rings.json' with { type: 'json' };
import RESPAWN from '../../data/respawn.json' with { type: 'json' };
import type { ZoneRow, ZoneSpawn } from './zone-rows.ts';
import type { TuneMap } from '../tune.ts';

export type RingSpawn = { kind: string; count: number; angleDeg: number; stepDeg: number; distance: number };
export type RingRow = { id: string; minDist: number; maxDist: number; blendAtMetres: number; groundTint: string; skyPlates: Record<string, number>; health: number; damage: number; loadAfterKillMetres: number | null; spawns: RingSpawn[] };
export type RingBoss = { kind: string; name: string; body: string; respawnSeconds: number; aggro: number; leash: number; roam: number; campSize: [number, number]; mechanic: null };
export type RingLimits = { distance: [number, number]; multiplier: [number, number]; plateWeight: [number, number]; angleDeg: [number, number]; count: [number, number]; respawnSeconds: [number, number] };
export type RingRows = { roundTo: number; halfTurnDegrees: number; limits: RingLimits; rings: RingRow[]; bosses: RingBoss[] };
export const RINGS = ROWS as unknown as RingRows;

type At = { x: number; z: number };
type PitRows = { pitArea: string; centre: number };

/** The pit's centre in the zone's frame (the same point src/zone/spawns.ts pitOrigin gives the sim): the rings are measured from here. Throws when the zone has no such area. */
export function ringOrigin(zone: ZoneRow, world: PitRows = RESPAWN.world as PitRows): At {
  const area = zone.areas.find((a) => a.id === world.pitArea);
  if (!area) throw new Error(`zone ${zone.id} has no area "${world.pitArea}" (respawn.json world.pitArea)`);
  return { x: area.min[0] + (area.max[0] - area.min[0]) * world.centre, z: area.min[1] + (area.max[1] - area.min[1]) * world.centre };
}

const round = (v: number, rows: RingRows): number => Math.round(v * rows.roundTo) / rows.roundTo;
/** Where one ring spawn stands in the zone's frame: `distance` metres from the pit's centre at `angleDeg` clockwise from north (-Z). */
export function ringPlace(origin: At, spawn: RingSpawn, instance: number, rows: RingRows = RINGS): At {
  const turn = ((spawn.angleDeg + instance * spawn.stepDeg) * Math.PI) / rows.halfTurnDegrees;
  return { x: round(origin.x + Math.sin(turn) * spawn.distance, rows), z: round(origin.z - Math.cos(turn) * spawn.distance, rows) };
}

/** The ring spawns of the rows as zone spawn rows (ids `<ring id>-<kind>-<instance>`). */
export function ringSpawns(origin: At, rows: RingRows = RINGS): ZoneSpawn[] {
  const out: ZoneSpawn[] = [];
  for (const ring of rows.rings) for (const s of ring.spawns) {
    const boss = rows.bosses.find((b) => b.kind === s.kind);
    if (!boss) throw new Error(`rings.json ${ring.id} names kind "${s.kind}", which has no bosses row`);
    for (let i = 0; i < s.count; i++) {
      const p = ringPlace(origin, s, i, rows);
      out.push({ id: `${ring.id}-${s.kind}-${i}`, kind: s.kind, position: p, respawnSeconds: boss.respawnSeconds, roster: true, behaviour: { aggro: boss.aggro, leash: boss.leash, roam: boss.roam, campSize: [boss.campSize[0], boss.campSize[1]] }, body: boss.body });
    }
  }
  return out;
}

/** The zone with the rings' spawns after its own (a new row; the zone's own spawns are the same objects, byte for byte). */
export const ringedZone = (zone: ZoneRow, rows: RingRows = RINGS): ZoneRow => (rows.rings.some((r) => r.spawns.length) ? { ...zone, spawns: [...zone.spawns, ...ringSpawns(ringOrigin(zone), rows)] } : zone);

/** The ring whose band holds `dist` metres from the pit's centre, or undefined (between two bands). */
export const ringOf = (dist: number, rows: RingRows = RINGS): RingRow | undefined => rows.rings.find((r) => dist >= r.minDist && dist <= r.maxDist);
/** The ring a zone spawn id belongs to (its id starts with the ring's), or undefined for ring 1's own spawns. */
export const ringOfSpawn = (id: string, rows: RingRows = RINGS): RingRow | undefined => rows.rings.find((r) => id.startsWith(`${r.id}-`));

/** Every ring boss's health and damage multipliers as a ?tune= map (src/tune.ts): only the rings that change something (1 is none), so ring 1 and the default zone add nothing. */
export function ringTune(rows: RingRows = RINGS): TuneMap {
  const out: Record<string, Record<string, number>> = {};
  for (const ring of rows.rings) for (const s of ring.spawns) {
    const t: Record<string, number> = {};
    if (ring.health !== 1) t.health = ring.health;
    if (ring.damage !== 1) t.damage = ring.damage;
    if (Object.keys(t).length) out[s.kind] = t;
  }
  return out;
}

/** How far from the hero a spawn of `id` must stand for its body to be fetched after the first kill: its ring's `loadAfterKillMetres`, or `fallback` (ring 1, and the spawns the zone row owns). */
export const ringLoadAfterKill = (id: string, fallback: number, rows: RingRows = RINGS): number => ringOfSpawn(id, rows)?.loadAfterKillMetres ?? fallback;

/** The look at `dist` metres from the pit: the two rings it lies between (by `blendAtMetres`) and how far from `a` to `b` it is (0..1); outside every ring's centre it is the nearest ring alone (`b` = `a`, t 0). */
export function ringBlend(dist: number, rows: RingRows = RINGS): { a: RingRow; b: RingRow; t: number } {
  const list = [...rows.rings].sort((p, q) => p.blendAtMetres - q.blendAtMetres), first = list[0]!, last = list[list.length - 1]!;
  if (dist <= first.blendAtMetres) return { a: first, b: first, t: 0 };
  if (dist >= last.blendAtMetres) return { a: last, b: last, t: 0 };
  const hi = list.findIndex((r) => r.blendAtMetres >= dist), a = list[hi - 1]!, b = list[hi]!;
  return { a, b, t: (dist - a.blendAtMetres) / (b.blendAtMetres - a.blendAtMetres) };
}

/** The look the hero stands in at `dist` metres from the pit: the ground tint as the two rings' colours and the mix (0..1) between them, and each sky plate's brightness weight (mixed the same way). */
export function ringLook(dist: number, rows: RingRows = RINGS): { tintA: string; tintB: string; t: number; plates: Record<string, number> } {
  const { a, b, t } = ringBlend(dist, rows);
  return { tintA: a.groundTint, tintB: b.groundTint, t, plates: Object.fromEntries(Object.entries(a.skyPlates).map(([id, w]) => [id, w + ((b.skyPlates[id] ?? w) - w) * t])) };
}
