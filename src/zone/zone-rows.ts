// The zone rows (data/zones/): the one place a page learns what zone it plays. Pure reads, no scene, no sim: the open fight loop and the
// respawn code take a ZoneRow from here and never spell a zone value themselves (scripts/as-data/check.mjs scans src/zone/ at zero).
//   zoneFor(search)   the row for `?zone=<id>` (test rows only), else the default zone data/zones/index.json names; an id that is no
//                     listed zone plays the default with a console warning. It never throws.
// Shape: V1's origins/zone-rows/zone7.row.json cut to one player in one zone (the file's own `about` says each field). Validation is
// src/sim/validate.js validateZone / validateZoneIndex, the same checks test/zone-rows.test.mjs pins.
import { validateZone, validateZoneIndex } from '../sim/validate.js';
import INDEX from '../../data/zones/index.json' with { type: 'json' };
import RIG from '../../data/rig.json' with { type: 'json' };
import ZONE1 from '../../data/zones/zone1.row.json' with { type: 'json' };
import PROFILES from '../../data/profiles.json' with { type: 'json' };
import STAGE from '../../data/stage.json' with { type: 'json' };
import MECHANIC_ROWS from '../../data/mechanics.json' with { type: 'json' };
import { validateRings } from '../sim/validate-rings.js';
import { RINGS, ringOrigin, ringedZone, type RingRows } from './rings.ts';

export type ZoneBehaviour = { aggro: number; leash: number; roam: number; campSize: [number, number] };
export type ZoneSpawn = { id: string; kind: string; position: { x: number; z: number }; respawnSeconds: number; roster: boolean; behaviour: ZoneBehaviour; body?: string };   // body: a data/rig.json files stem drawn for this spawn (absent: its kind's profile body, foe-body.ts spawnBodyFile)
export type ZoneArea = { id: string; name: string; shape: 'rect'; min: [number, number]; max: [number, number]; pvp: 'on' | 'off'; spawnsAllowed: boolean };
export type ZoneRespawn = { x: number; z: number; facing: number; downSeconds: number; died: string };
export type ZoneRow = { about?: string; id: string; name: string; alias: string; band: [number, number]; pvp: 'on' | 'off'; respawn: ZoneRespawn; areas: ZoneArea[]; spawns: ZoneSpawn[] };
export type ZoneIndex = { about?: string; default: string; zones: string[] };
export type ZoneSet = { default: string; rows: Record<string, ZoneRow> };

/** Every row file the build ships, keyed by its own id (test/zone-rows.test.mjs fails if data/zones/index.json lists another set). */
// The biome rings (data/rings.json): ring 1 is the row's own spawns, rings 2 and 3 are appended after them (src/zone/rings.ts). A bad rings file throws at load, naming every problem.
const RING_PROBLEMS = validateRings(RINGS, ZONE1 as unknown as ZoneRow, ringOrigin(ZONE1 as unknown as ZoneRow), PROFILES.profiles.map((p) => p.id), RIG, STAGE.skyline.ring.plates.map((p: { id: string }) => p.id), Object.keys(MECHANIC_ROWS.mechanics));
if (RING_PROBLEMS.length) throw new Error(`data/rings.json: ${RING_PROBLEMS.join('; ')}`);
const SHIPPED: ZoneRow[] = [ZONE1 as unknown as ZoneRow];

/**
 * Build a ZoneSet from an index and row list. A row that fails validateZone is dropped with a console error (so one bad test row cannot
 * take the default zone down); an index that fails validateZoneIndex warns and still returns the set it could build. Never throws.
 * `kinds`: the opponent profile ids a spawn `kind` may name (omit to skip that check).
 */
export function buildZoneSet(index: ZoneIndex, list: readonly ZoneRow[], kinds?: readonly string[], bodies?: unknown): ZoneSet {   // bodies: data/rig.json, checks a spawn's `body`
  const rows: Record<string, ZoneRow> = {};
  for (const row of list) {
    const bad = validateZone(row, kinds ? [...kinds] : undefined, bodies) as string[];
    if (bad.length) console.error(`zone row '${row?.id}' is invalid and not loaded: ${bad.join('; ')}`);
    else rows[row.id] = row;
  }
  const problems = validateZoneIndex(index, rows) as string[];
  if (problems.length) console.warn(`zone index: ${problems.join('; ')}`);
  return { default: index.default, rows };
}

export const ZONES: ZoneSet = buildZoneSet(INDEX as ZoneIndex, SHIPPED, undefined, RIG);

/** The zone id a page address asks for (`?zone=<id>`), or undefined. */
export const zoneIdFromSearch = (search: string): string | undefined => new URLSearchParams(search).get('zone') ?? undefined;

/** The row this page plays. Never throws: an unlisted `?zone=` id, or an empty set, falls back to the default and warns. */
export function zoneFor(search: string, set: ZoneSet = ZONES): ZoneRow {
  const asked = zoneIdFromSearch(search);
  const hit = asked === undefined ? undefined : set.rows[asked];
  if (asked !== undefined && !hit) console.warn(`unknown zone '${asked}': playing the default zone '${set.default}'`);
  return hit ?? set.rows[set.default] ?? Object.values(set.rows)[0] ?? (SHIPPED[0] as ZoneRow);
}

/** `zoneFor` with the biome rings' spawns after the row's own (data/rings.json): the zone the page plays (src/stubs.ts exports it as `zoneFor`). The row's own spawns, ring 1, are the same objects as in `zoneFor`'s. */
export const ringedZoneFor = (search: string, set: ZoneSet = ZONES): ZoneRow => ringedZone(zoneFor(search, set), RINGS as RingRows);
