// The zone's open ground (data/zone-ground.json, Dom 2026-10-27: the hero roams past the pit like an MMO). Pure sizing and the rows' checks; the drawing is
// ground-draw.ts. Nothing here changes the duel sim: the floor is presentation, the sim's circle is unchanged.
import ROWS from '../../data/zone-ground.json' with { type: 'json' };
import STAGE from '../../data/stage.json' with { type: 'json' };

export type GroundRows = {
  flag: { query: string; off: string }; groundRadiusMetres: number; gridRadiusMetres: number; edgeVisibility: number; cameraFarMetres: number;
  limits: { groundRadiusMetres: [number, number]; gridRadiusMetres: [number, number]; edgeVisibility: [number, number]; cameraFarMetres: [number, number] };
};
/** Sizes in the floor group's own units (the group is scaled by the pit's play scale), what the drawing needs. */
export type Sizing = { floorSide: number; gridSize: number; gridDivisions: number; far: number };

export const GROUND = ROWS as unknown as GroundRows;

/** The `?ground=` link: the pit's floor exactly as before when it says v1. */
export const groundOn = (search: string, rows: GroundRows = GROUND): boolean => !new RegExp(`[?&]${rows.flag.query}=${rows.flag.off}(&|#|$)`).test(search);

/** Metres from the camera at which exponential-squared fog (density `d`) shows only `visibility` of a surface. */
export const fogHidesAt = (density: number, visibility: number): number => Math.sqrt(-Math.log(visibility)) / density;

/**
 * The rows' problems, [] when fine. `reach`: how far from the pit's centre the hero and his camera can stand (postKill.walkRadiusMetres + cameraMetres once the free
 * walk is in the rows); when given, the floor's edge must be fog from there.
 */
export function checkGround(rows: GroundRows, density: number = STAGE.duel.fogDensity, reach?: number): string[] {
  const e: string[] = [];
  for (const k of ['groundRadiusMetres', 'gridRadiusMetres', 'edgeVisibility', 'cameraFarMetres'] as const) {
    const v = rows[k], [lo, hi] = rows.limits[k];
    if (!Number.isFinite(v) || v < lo || v > hi) e.push(`zone-ground.${k} ${v} is not in ${lo}..${hi}`);
  }
  if (!(density > 0)) e.push(`stage duel.fogDensity ${density} must be above 0`);
  if (e.length) return e;
  if (rows.gridRadiusMetres > rows.groundRadiusMetres) e.push('zone-ground.gridRadiusMetres is beyond the floor');
  const hide = fogHidesAt(density, rows.edgeVisibility);
  if (rows.cameraFarMetres < hide) e.push(`zone-ground.cameraFarMetres ${rows.cameraFarMetres} cuts the floor off before the fog hides it (${hide.toFixed(0)} m)`);
  if (reach !== undefined && rows.groundRadiusMetres - reach < hide) e.push(`zone-ground.groundRadiusMetres ${rows.groundRadiusMetres} leaves ${(rows.groundRadiusMetres - reach).toFixed(0)} m beyond the walking reach ${reach} m; the fog needs ${hide.toFixed(0)} m to hide the edge`);
  return e;
}

/** The floor's sizes in the group's units: `scale` is the group's scale (world.pitScale); the grid keeps the stage's own cell, so it joins the pit's grid line for line. */
export function groundSizing(rows: GroundRows, scale: number, stage = STAGE): Sizing {
  const cell = stage.grid.size / stage.grid.divisions, cells = Math.ceil(rows.gridRadiusMetres / scale / cell);
  return { floorSide: Math.max(stage.ground.size, (2 * rows.groundRadiusMetres) / scale), gridSize: 2 * cells * cell, gridDivisions: 2 * cells, far: rows.cameraFarMetres };
}

/** The page's one read: the checked sizing for the zone's pit scale (and the walking reach, when the rows have one). Throws on a bad row. */
export function groundFor(scale: number, reach?: number): Sizing {
  const bad = checkGround(GROUND, STAGE.duel.fogDensity, reach);
  if (bad.length) throw new Error(bad.join('; '));
  return groundSizing(GROUND, scale);
}
