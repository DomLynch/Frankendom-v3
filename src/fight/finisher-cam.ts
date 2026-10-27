// The finisher camera for the cut (data: finisher-cam.json). Pure functions that write into the caller's `out` (no allocation per frame): the camera
// rig (camera.ts), the finisher blood and the stick rule (scene.ts, main.ts) read them. PRESENTATION ONLY: nothing here touches the sim, the record or Gate 0.
// ?finishercam=v1 = the camera, the blood and the stick rule as they were before the rows.
import ROWS from './finisher-cam.json' with { type: 'json' };

export type CutCamRow = { from: number; over: number; bone: string; mix: number; angle: number; dist: number; span: number; rise: number; stickBeatS: number; blood: { burst: number; pool: number } };
export type CutFocus = { x: number; y: number; z: number };
export type CutCamPose = { x: number; y: number; z: number; lookX: number; lookY: number; lookZ: number };
export const MIN_EYE: number = ROWS.minEye;   // metres: the lens never stands lower than this over a lying foe
export const MIDDLE_BONE = 'pelvis';           // the bone `mix` pulls the aim toward

/** Off for ?finishercam=v1 (any other value keeps the default, ON). */
export const finisherCamOn = (search: string): boolean => new URLSearchParams(search).get('finishercam') !== 'v1';

/** The rows for this page: null when reverted. */
export const cutCamRows = (search: string): Readonly<Record<string, CutCamRow>> | null => finisherCamOn(search) ? (ROWS.rows as Record<string, CutCamRow>) : null;

/** Seconds after the kill a held stick may not yet end the ceremony of finisher `id` (free-camera.ts handsOver): its row's `stickBeatS`; 0 with no row (a finisher the camera does not frame) or ?finishercam=v1. */
export const stickBeat = (rows: Readonly<Record<string, CutCamRow>> | null, id: string | null): number => (rows && id !== null ? rows[id]?.stickBeatS : 0) ?? 0;

/** Rows that cannot work (a malformed number, a window outside the clock): the messages, none when the file is sound. */
export function cutCamProblems(rows: Readonly<Record<string, CutCamRow>>): string[] {
  const bad: string[] = [];
  for (const [id, r] of Object.entries(rows)) {
    if (typeof r.bone !== 'string' || !r.bone) bad.push(`${id}.bone: a bone name`);
    for (const k of ['from', 'over', 'mix', 'angle', 'dist', 'span', 'rise', 'stickBeatS'] as const) if (!Number.isFinite(r[k])) bad.push(`${id}.${k}: not a number`);
    if (!(r.over > 0)) bad.push(`${id}.over: must be > 0`);
    if (!(r.from >= 0 && r.from + r.over <= 1)) bad.push(`${id}: from + over must end inside the finisher clock 0..1`);
    if (!(r.mix >= 0 && r.mix <= 1)) bad.push(`${id}.mix: 0..1`);
    if (!(r.dist > 0 && r.span > 0)) bad.push(`${id}: dist and span must be > 0`);
    if (!(r.rise >= 1)) bad.push(`${id}.rise: the lens must look down on the foe (>= 1 m), not along the floor`);
    if (!(r.stickBeatS >= 0)) bad.push(`${id}.stickBeatS: >= 0`);
    if (!(r.blood.burst >= 1 && r.blood.pool >= 1)) bad.push(`${id}.blood: a boost below 1 would shrink the cut`);
  }
  return bad;
}

/** How far the close view has come (0..1, smoothstep) at finisher clock `clock` (0..1). */
export const cutCamShare = (row: CutCamRow, clock: number): number => {
  const t = Math.min(1, Math.max(0, (clock - row.from) / row.over));
  return t * t * (3 - 2 * t);
};

/** The aim: the cut bone `cut` pulled `row.mix` of the way to the foe's middle `mid`, written into `out`. */
export const cutAim = (row: CutCamRow, cut: CutFocus, mid: CutFocus | null, out: CutFocus): CutFocus => {
  const m = mid ? row.mix : 0;
  out.x = cut.x + ((mid ? mid.x : cut.x) - cut.x) * m; out.y = cut.y + ((mid ? mid.y : cut.y) - cut.y) * m; out.z = cut.z + ((mid ? mid.z : cut.z) - cut.z) * m;
  return out;
};

/** The close side view of the foe's cut, written into `out`. `hero` is the hero's ground position, `focus` the aim (cutAim), `scale` the foe's body scale, `tanHalfH` the tangent of
 *  half the horizontal field of view (tan(vfov/2) * aspect), so the span always fits across the screen. The camera stands round the aim from the line to the hero by `angle`, to
 *  the side (-axisZ, axisX) the dolly already slides to, so the hero is off to the side of the frame and never in front of the cut; the lens stands `rise` above the aim
 *  (at least MIN_EYE), so it looks down on the lying foe and the wound. */
export function cutCamPose(row: CutCamRow, hero: { x: number; z: number }, focus: CutFocus, scale: number, tanHalfH: number, out: CutCamPose): CutCamPose {
  const ax = focus.x - hero.x, az = focus.z - hero.z, len = Math.hypot(ax, az) || 1, nx = ax / len, nz = az / len;
  const dist = Math.max(row.dist * scale, tanHalfH > 0 ? (row.span * scale) / (2 * tanHalfH) : 0);
  const back = -Math.cos(row.angle), side = Math.sin(row.angle);   // along the hero->aim axis (negative = back toward the hero) and across it
  out.x = focus.x + (nx * back - nz * side) * dist;
  out.z = focus.z + (nz * back + nx * side) * dist;
  out.y = Math.max(MIN_EYE, focus.y + row.rise * scale);
  out.lookX = focus.x; out.lookY = focus.y; out.lookZ = focus.z;
  return out;
}
