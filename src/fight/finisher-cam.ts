// The finisher camera for the cut (data: finisher-cam.json). Pure functions that write into the caller's `out` (no allocation per frame): the camera
// rig (camera.ts) and the finisher blood (scene.ts) read them. PRESENTATION ONLY: nothing here touches the sim, the record or Gate 0.
// ?finishercam=v1 = the camera and the blood as they were before the rows.
import ROWS from './finisher-cam.json' with { type: 'json' };

export type CutCamRow = { from: number; over: number; bone: string; angle: number; dist: number; span: number; rise: number; eyeY: number; lookY: number; blood: { burst: number; pool: number } };
export type CutFocus = { x: number; y: number; z: number };
export type CutCamPose = { x: number; y: number; z: number; lookX: number; lookY: number; lookZ: number };

/** Off for ?finishercam=v1 (any other value keeps the default, ON). */
export const finisherCamOn = (search: string): boolean => new URLSearchParams(search).get('finishercam') !== 'v1';

/** Seconds after the kill a held stick may not yet end the finisher ceremony (freeCamera.stickEndsCeremony, free-camera.ts handsOver); 0 for ?finishercam=v1 = ends at once, as before. */
export const stickMinBeat = (search: string): number => finisherCamOn(search) ? (ROWS as { stickEndsCeremonyAfterS: number }).stickEndsCeremonyAfterS : 0;

/** The rows for this page: null when reverted. */
export const cutCamRows = (search: string): Readonly<Record<string, CutCamRow>> | null => finisherCamOn(search) ? (ROWS.rows as Record<string, CutCamRow>) : null;

/** Rows that cannot work (a malformed number, a window outside the clock): the messages, none when the file is sound. */
export function cutCamProblems(rows: Readonly<Record<string, CutCamRow>>): string[] {
  const bad: string[] = [];
  for (const [id, r] of Object.entries(rows)) {
    if (typeof r.bone !== 'string' || !r.bone) bad.push(`${id}.bone: a bone name`);
    for (const k of ['from', 'over', 'angle', 'dist', 'span', 'rise', 'eyeY', 'lookY'] as const) if (!Number.isFinite(r[k])) bad.push(`${id}.${k}: not a number`);
    if (!(r.over > 0)) bad.push(`${id}.over: must be > 0`);
    if (!(r.from >= 0 && r.from + r.over <= 1)) bad.push(`${id}: from + over must end inside the finisher clock 0..1`);
    if (!(r.dist > 0 && r.span > 0)) bad.push(`${id}: dist and span must be > 0`);
    if (!(r.blood.burst >= 1 && r.blood.pool >= 1)) bad.push(`${id}.blood: a boost below 1 would shrink the cut`);
  }
  return bad;
}

/** How far the close view has come (0..1, smoothstep) at finisher clock `clock` (0..1). */
export const cutCamShare = (row: CutCamRow, clock: number): number => {
  const t = Math.min(1, Math.max(0, (clock - row.from) / row.over));
  return t * t * (3 - 2 * t);
};

/** The close side view of the foe's cut, written into `out`. `hero` and `foe` are ground positions, `scale` the foe's body scale, `tanHalfH` the tangent of half the
 *  horizontal field of view (tan(vfov/2) * aspect), so the span of him always fits across the screen. The camera stands round the foe from the line to the hero by
 *  `angle`, to the side (-axisZ, axisX) the dolly already slides to, so the hero is off to the side of the frame and never in front of the cut. */
export function cutCamPose(row: CutCamRow, hero: { x: number; z: number }, foe: { x: number; z: number }, scale: number, tanHalfH: number, focus: CutFocus | null, out: CutCamPose): CutCamPose {
  const cx = focus ? focus.x : foe.x, cz = focus ? focus.z : foe.z, cy = focus ? focus.y : row.lookY * scale;   // the cut: the followed bone, else the foe's own spot
  const ax = cx - hero.x, az = cz - hero.z, len = Math.hypot(ax, az) || 1, nx = ax / len, nz = az / len;
  const dist = Math.max(row.dist * scale, tanHalfH > 0 ? (row.span * scale) / (2 * tanHalfH) : 0);
  const back = -Math.cos(row.angle), side = Math.sin(row.angle);   // along the hero->cut axis (negative = back toward the hero) and across it
  out.x = cx + (nx * back - nz * side) * dist;
  out.z = cz + (nz * back + nx * side) * dist;
  out.y = focus ? Math.max(0.9, cy + row.rise * scale) : row.eyeY * scale;
  out.lookX = cx; out.lookZ = cz; out.lookY = cy;
  return out;
}
