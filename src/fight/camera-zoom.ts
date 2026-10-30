import { cameraRule } from './camera-rules.ts';
// V3: the duel camera's zoom (data/fight.json camera.zoom, Dom 2026-10-27: "just add 10%"). Presentation only: it scales the lens, never the sim.
// zoom 1 is today's lens exactly (the 51 degree vertical field of view); 1.1 makes everything 10% larger on screen about the frame's centre.
// ?zoom=<n> replaces the row for that page load (any value inside the limits; ?zoom=1 = the camera as it was before the row).
export const ZOOM_LIMITS = [cameraRule('zoomLimitLow'), cameraRule('zoomLimitHigh')] as const;
export const BASE_FOV = cameraRule('baseFov');   // camera-rules-defs.json baseFov; scene.ts's PerspectiveCamera vertical field of view (degrees), the lens at zoom 1

/** The zoom for this page: the `?zoom=` query when it is a number inside the limits, else the row's. An unusable query is ignored, not clamped. */
export const cameraZoom = (row: number, search: string): number => {
  const q = new URLSearchParams(search).get('zoom');
  const n = q === null || q.trim() === '' ? NaN : Number(q);
  return Number.isFinite(n) && n >= ZOOM_LIMITS[0] && n <= ZOOM_LIMITS[1] ? n : row;
};

// The wide-screen lens (data/fight.json camera.wide): the lock camera's distance is already fitted by the VERTICAL field (V1's min(aspect, 1)), so a landscape screen shows the same height of world as a
// portrait one, only wider; but a landscape phone is 375 px tall, so the same share of it is a hero 2.6x smaller than on a portrait phone. The lens zooms in by `zoom` on a screen at least `toAspect` wide
// (a blend from 1 at `fromAspect`), never past `maxHfovDeg` of horizontal view on an ultra-wide. A screen narrower than `fromAspect` (every portrait phone and tablet) gets exactly 1: portrait is untouched.
// ?wide=<n> replaces the row's zoom for that page load (1..2; ?wide=v1 or ?wide=1 = no wide-screen zoom at all).
export type WideRow = { fromAspect: number; toAspect: number; zoom: number; maxHfovDeg: number };
export const WIDE_LIMITS = { zoom: [1, cameraRule('wideZoomHigh')], fromAspect: [cameraRule('wideFromLow'), cameraRule('wideFromHigh')], maxHfovDeg: [cameraRule('wideHfovLow'), cameraRule('wideHfovHigh')] } as const;
const NO_HFOV_CAP = cameraRule('wideHfovNone');   // degrees: wide off means no horizontal cap

/** The row for this page: `?wide=<n>` (a number 1..2) replaces its zoom, `?wide=v1` is the lens without it; anything else keeps the row. */
export const wideRow = (row: WideRow, search: string): WideRow => {
  const q = new URLSearchParams(search).get('wide');
  if (q === 'v1') return { ...row, zoom: 1, maxHfovDeg: NO_HFOV_CAP };
  const n = q === null || q.trim() === '' ? NaN : Number(q);
  return Number.isFinite(n) && n >= WIDE_LIMITS.zoom[0] && n <= WIDE_LIMITS.zoom[1] ? { ...row, zoom: n, ...(n === 1 ? { maxHfovDeg: NO_HFOV_CAP } : {}) } : row;
};

/** The extra lens zoom for a screen of this aspect (width / height) on top of the page's lens `zoom`: exactly 1 below `fromAspect`, `row.zoom` from `toAspect`, linear between; and never so little that the horizontal field passes `maxHfovDeg`. */
export const wideBoost = (aspect: number, zoom: number, row: WideRow): number => {
  if (!(aspect > row.fromAspect)) return 1;
  const t = Math.min(1, (aspect - row.fromAspect) / (row.toAspect - row.fromAspect)), boost = 1 + (row.zoom - 1) * t;
  const needed = Math.tan(BASE_FOV * Math.PI / 360) * aspect / (Math.tan(row.maxHfovDeg * Math.PI / 360) * zoom);   // the boost at which the horizontal half-field is exactly the cap
  return Math.max(boost, needed);
};

/** The vertical field of view (degrees) that makes the picture `zoom` times larger: the size on screen goes as 1 / tan(fov / 2). */
export const fovForZoom = (zoom: number): number => zoom === 1 ? BASE_FOV : 2 * Math.atan(Math.tan(BASE_FOV * Math.PI / 360) / zoom) * 180 / Math.PI;
