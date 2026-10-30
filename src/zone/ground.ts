// The zone's endless open ground (data/zone-ground.json, Dom 2026-10-27: one open world, the hero roams like an MMO). Pure sizing, the follow snap and the rows' checks;
// the drawing is ground-draw.ts, the per-frame follow is in src/fight/scene.ts. Nothing here changes the duel sim: the floor is presentation.
import ROWS from '../../data/zone-ground.json' with { type: 'json' };
import STAGE from '../../data/stage.json' with { type: 'json' };

type GroundRows = {
  flag: { query: string; off: string }; groundRadiusMetres: number; gridRadiusMetres: number; edgeVisibility: number; cameraFarMetres: number; cameraOffsetMetres: number;
  groundFollow: { on: boolean; snapMetres: number };
  floorDepthPush: { flag: { query: string; off: string }; factor: number; units: number };
  limits: { groundRadiusMetres: [number, number]; gridRadiusMetres: [number, number]; edgeVisibility: [number, number]; cameraFarMetres: [number, number]; cameraOffsetMetres: [number, number]; snapMetres: [number, number]; depthFactor: [number, number]; depthUnits: [number, number] };
};
/** The floor's depth push (three.js polygonOffset), so the grid on the floor wins the depth test out to the far plane; null = none (?sand=v1). */
type DepthPush = { factor: number; units: number } | null;
/** Sizes in the floor group's own units (the group is scaled with the start area, world.pitScale), what the drawing needs; `snap`: world metres the follow moves in (0 = it does not follow). */
export type Sizing = { floorSide: number; gridSize: number; gridDivisions: number; far: number; snap: number; depthPush: DepthPush };

export const GROUND = ROWS as unknown as GroundRows;

/** The `?ground=` link: the old floor exactly as before when it says v1. */
export const groundOn = (search: string, rows: GroundRows = GROUND): boolean => !new RegExp(`[?&]${rows.flag.query}=${rows.flag.off}(&|#|$)`).test(search);

/** The `?sand=` link: the zone's floor without the depth push when it says v1. */
export const sandOn = (search: string, rows: GroundRows = GROUND): boolean => !new RegExp(`[?&]${rows.floorDepthPush.flag.query}=${rows.floorDepthPush.flag.off}(&|#|$)`).test(search);

/** The depth push for the floor: the rows' values, or null when the link reverts it. */
export const depthPushFor = (rows: GroundRows, on: boolean): DepthPush => (on ? { factor: rows.floorDepthPush.factor, units: rows.floorDepthPush.units } : null);

/** Metres from the camera at which exponential-squared fog (density `d`) shows only `visibility` of a surface. */
export const fogHidesAt = (density: number, visibility: number): number => Math.sqrt(-Math.log(visibility)) / density;

/**
 * The rows' problems, [] when fine. The floor's edge is `groundRadiusMetres` from the hero, and the camera stands up to `cameraOffsetMetres` from him, so the nearest the
 * edge can be to the camera is the radius less that offset: the fog must have hidden it by then. `reach` only matters when the floor does not follow the hero
 * (groundFollow.on false): how far from the start the hero and his camera can stand (postKill.walkRadiusMetres + cameraMetres).
 */
export function checkGround(rows: GroundRows, density: number = STAGE.duel.fogDensity, reach?: number): string[] {
  const e: string[] = [];
  for (const k of ['groundRadiusMetres', 'gridRadiusMetres', 'edgeVisibility', 'cameraFarMetres', 'cameraOffsetMetres'] as const) {
    const v = rows[k], [lo, hi] = rows.limits[k];
    if (!Number.isFinite(v) || v < lo || v > hi) e.push(new Error(`zone-ground.${k} ${v} is not in ${lo}..${hi}`).message);
  }
  const f = rows.groundFollow, [slo, shi] = rows.limits.snapMetres;
  if (typeof f?.on !== 'boolean') e.push(new Error('zone-ground.groundFollow.on must be true or false').message);
  if (!Number.isFinite(f?.snapMetres) || f.snapMetres < slo || f.snapMetres > shi) e.push(new Error(`zone-ground.groundFollow.snapMetres ${f?.snapMetres} is not in ${slo}..${shi}`).message);
  const p = rows.floorDepthPush, [flo, fhi] = rows.limits.depthFactor, [ulo, uhi] = rows.limits.depthUnits;
  if (!Number.isFinite(p?.factor) || p.factor < flo || p.factor > fhi) e.push(new Error(`zone-ground.floorDepthPush.factor ${p?.factor} is not in ${flo}..${fhi}`).message);
  if (!Number.isFinite(p?.units) || p.units < ulo || p.units > uhi) e.push(new Error(`zone-ground.floorDepthPush.units ${p?.units} is not in ${ulo}..${uhi}`).message);
  if (!(density > 0)) e.push(new Error(`stage duel.fogDensity ${density} must be above 0`).message);
  if (e.length) return e;
  if (rows.gridRadiusMetres > rows.groundRadiusMetres) e.push(new Error('zone-ground.gridRadiusMetres is beyond the floor').message);
  const hide = fogHidesAt(density, rows.edgeVisibility), edge = rows.groundRadiusMetres - rows.cameraOffsetMetres;
  if (rows.cameraFarMetres < hide) e.push(new Error(`zone-ground.cameraFarMetres ${rows.cameraFarMetres} cuts the floor off before the fog hides it (${hide.toFixed(0)} m)`).message);
  if (edge < hide) e.push(new Error(`zone-ground.groundRadiusMetres ${rows.groundRadiusMetres} less the camera offset ${rows.cameraOffsetMetres} is ${edge.toFixed(0)} m: the fog needs ${hide.toFixed(0)} m to hide the edge`).message);
  if (!f.on && reach !== undefined && rows.groundRadiusMetres - reach - rows.cameraOffsetMetres < hide) e.push(new Error(`zone-ground.groundRadiusMetres ${rows.groundRadiusMetres} leaves too little beyond the walking reach ${reach} m; the fog needs ${hide.toFixed(0)} m to hide the edge`).message);
  return e;
}

/** Whole cells for a ratio that is a whole number up to one rounding error (1.3 / 0.65), rounded up otherwise. */
const cellsFor = (ratio: number): number => { const near = Math.round(ratio); return ratio <= near * (1 + Number.EPSILON) + Number.EPSILON ? near : Math.ceil(ratio); };

/**
 * The follow snap in world metres: snapMetres rounded UP to a whole number of the stage's grid cells at this scale, so the floor moves by whole cells and the grid lines
 * stay where they were in the world (the sand is a flat colour, so only the grid and the sun's shadow frustum can swim).
 */
export const followSnap = (rows: GroundRows, scale: number, stage = STAGE): number => {
  if (!rows.groundFollow.on) return 0;
  const cell = (stage.grid.size / stage.grid.divisions) * scale;
  return cellsFor(rows.groundFollow.snapMetres / cell) * cell;
};
/** Where the floor stands for a hero at (x, z): his place rounded to the snap, written into `out` (no allocation per frame). Snap 0 = the floor stays at the start. */
export const anchorInto = (out: { x: number; z: number }, x: number, z: number, snap: number): { x: number; z: number } => {
  out.x = snap > 0 ? Math.round(x / snap) * snap : 0; out.z = snap > 0 ? Math.round(z / snap) * snap : 0;
  return out;
};

/** The floor's sizes in the group's units: `scale` is the group's scale (world.pitScale); the grid keeps the stage's own cell, so it joins the old grid line for line. */
export function groundSizing(rows: GroundRows, scale: number, stage = STAGE, sand = true): Sizing {
  const cell = stage.grid.size / stage.grid.divisions, cells = Math.ceil(rows.gridRadiusMetres / scale / cell), reach = rows.groundRadiusMetres / scale;
  return { floorSide: Math.max(stage.ground.size, reach + reach), gridSize: (cells + cells) * cell, gridDivisions: cells + cells, far: rows.cameraFarMetres, snap: followSnap(rows, scale, stage), depthPush: depthPushFor(rows, sand) };
}

/** The page's one read: the checked sizing for the zone's scale (and the walking reach, when the rows have one). Throws on a bad row. */
export function groundFor(scale: number, reach?: number, sand = true): Sizing {
  const bad = checkGround(GROUND, STAGE.duel.fogDensity, reach);
  if (bad.length) throw new Error(bad.join('; '));
  return groundSizing(GROUND, scale, STAGE, sand);
}
