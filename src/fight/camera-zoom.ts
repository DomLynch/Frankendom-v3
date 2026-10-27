// V3: the duel camera's zoom (data/fight.json camera.zoom, Dom 2026-10-27: "just add 10%"). Presentation only: it scales the lens, never the sim.
// zoom 1 is today's lens exactly (the 51 degree vertical field of view); 1.1 makes everything 10% larger on screen about the frame's centre.
// ?zoom=<n> replaces the row for that page load (any value inside the limits; ?zoom=1 = the camera as it was before the row).
export const ZOOM_LIMITS = [0.5, 2] as const;
export const BASE_FOV = 51;   // scene.ts's PerspectiveCamera vertical field of view (degrees), the lens at zoom 1

/** The zoom for this page: the `?zoom=` query when it is a number inside the limits, else the row's. An unusable query is ignored, not clamped. */
export const cameraZoom = (row: number, search: string): number => {
  const q = new URLSearchParams(search).get('zoom');
  const n = q === null || q.trim() === '' ? NaN : Number(q);
  return Number.isFinite(n) && n >= ZOOM_LIMITS[0] && n <= ZOOM_LIMITS[1] ? n : row;
};

/** The vertical field of view (degrees) that makes the picture `zoom` times larger: the size on screen goes as 1 / tan(fov / 2). */
export const fovForZoom = (zoom: number): number => zoom === 1 ? BASE_FOV : 2 * Math.atan(Math.tan(BASE_FOV * Math.PI / 360) / zoom) * 180 / Math.PI;
