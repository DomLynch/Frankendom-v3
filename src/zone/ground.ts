// The zone's endless open ground (data/zone-ground.json, Dom 2026-10-27: no visible pit, the hero roams like an MMO). Pure sizing, the follow snap and the rows' checks;
// the drawing is ground-draw.ts, the per-frame follow is in src/fight/scene.ts. Nothing here changes the duel sim: the floor is presentation.
import ROWS from '../../data/zone-ground.json' with { type: 'json' };
import STAGE from '../../data/stage.json' with { type: 'json' };

export type GroundRows = {
  flag: { query: string; off: string }; groundRadiusMetres: number; gridRadiusMetres: number; edgeVisibility: number; cameraFarMetres: number;
  groundFollow: { on: boolean; snapMetres: number };
  limits: { groundRadiusMetres: [number, number]; gridRadiusMetres: [number, number]; edgeVisibility: [number, number]; cameraFarMetres: [number, number]; snapMetres: [number, number] };
};
/** Sizes in the floor group's own units (the group is scaled by the pit's play scale), what the drawing needs; `snap`: world metres the follow moves in (0 = it does not follow). */
export type Sizing = { floorSide: number; gridSize: number; gridDivisions: number; far: number; snap: number };

export const GROUND = ROWS as unknown as GroundRows;

/** The `?ground=` link: the pit's floor exactly as before when it says v1. */
export const groundOn = (search: string, rows: GroundRows = GROUND): boolean => !new RegExp(`[?&]${rows.flag.query}=${rows.flag.off}(&|#|$)`).test(search);

/** Metres from the camera at which exponential-squared fog (density `d`) shows only `visibility` of a surface. */
export const fogHidesAt = (density: number, visibility: number): number => Math.sqrt(-Math.log(visibility)) / density;

/**
 * The rows' problems, [] when fine. `reach`: how far from the pit's centre the hero and his camera can stand (postKill.walkRadiusMetres + cameraMetres once the free
 * walk is in the rows); it only matters when the floor does not follow the hero (groundFollow.on false): then the edge must be fog from there.
 */
export function checkGround(rows: GroundRows, density: number = STAGE.duel.fogDensity, reach?: number): string[] {
  const e: string[] = [];
  for (const k of ['groundRadiusMetres', 'gridRadiusMetres', 'edgeVisibility', 'cameraFarMetres'] as const) {
    const v = rows[k], [lo, hi] = rows.limits[k];
    if (!Number.isFinite(v) || v < lo || v > hi) e.push(`zone-ground.${k} ${v} is not in ${lo}..${hi}`);
  }
  const f = rows.groundFollow, [slo, shi] = rows.limits.snapMetres;
  if (typeof f?.on !== 'boolean') e.push('zone-ground.groundFollow.on must be true or false');
  if (!Number.isFinite(f?.snapMetres) || f.snapMetres < slo || f.snapMetres > shi) e.push(`zone-ground.groundFollow.snapMetres ${f?.snapMetres} is not in ${slo}..${shi}`);
  if (!(density > 0)) e.push(`stage duel.fogDensity ${density} must be above 0`);
  if (e.length) return e;
  if (rows.gridRadiusMetres > rows.groundRadiusMetres) e.push('zone-ground.gridRadiusMetres is beyond the floor');
  const hide = fogHidesAt(density, rows.edgeVisibility);
  if (rows.cameraFarMetres < hide) e.push(`zone-ground.cameraFarMetres ${rows.cameraFarMetres} cuts the floor off before the fog hides it (${hide.toFixed(0)} m)`);
  if (rows.groundRadiusMetres < hide) e.push(`zone-ground.groundRadiusMetres ${rows.groundRadiusMetres} ends before the fog hides the edge (${hide.toFixed(0)} m)`);
  if (!f.on && reach !== undefined && rows.groundRadiusMetres - reach < hide) e.push(`zone-ground.groundRadiusMetres ${rows.groundRadiusMetres} leaves ${(rows.groundRadiusMetres - reach).toFixed(0)} m beyond the walking reach ${reach} m; the fog needs ${hide.toFixed(0)} m to hide the edge`);
  return e;
}

/**
 * The follow snap in world metres: snapMetres rounded UP to a whole number of the stage's grid cells at this scale, so the floor moves by whole cells and the grid lines
 * stay where they were in the world (the sand is a flat colour, so only the grid and the sun's shadow frustum can swim).
 */
export const followSnap = (rows: GroundRows, scale: number, stage = STAGE): number => {
  if (!rows.groundFollow.on) return 0;
  const cell = (stage.grid.size / stage.grid.divisions) * scale;
  return Math.ceil(rows.groundFollow.snapMetres / cell - 1e-9) * cell;
};
/** Where the floor stands for a hero at (x, z): his place rounded to the snap (the floor and its grid are drawn about this point). */
export const anchorFor = (x: number, z: number, snap: number): { x: number; z: number } => snap > 0 ? { x: Math.round(x / snap) * snap, z: Math.round(z / snap) * snap } : { x: 0, z: 0 };

/** The floor's sizes in the group's units: `scale` is the group's scale (world.pitScale); the grid keeps the stage's own cell, so it joins the pit's grid line for line. */
export function groundSizing(rows: GroundRows, scale: number, stage = STAGE): Sizing {
  const cell = stage.grid.size / stage.grid.divisions, cells = Math.ceil(rows.gridRadiusMetres / scale / cell);
  return { floorSide: Math.max(stage.ground.size, (2 * rows.groundRadiusMetres) / scale), gridSize: 2 * cells * cell, gridDivisions: 2 * cells, far: rows.cameraFarMetres, snap: followSnap(rows, scale, stage) };
}

/** The page's one read: the checked sizing for the zone's pit scale (and the walking reach, when the rows have one). Throws on a bad row. */
export function groundFor(scale: number, reach?: number): Sizing {
  const bad = checkGround(GROUND, STAGE.duel.fogDensity, reach);
  if (bad.length) throw new Error(bad.join('; '));
  return groundSizing(GROUND, scale);
}
