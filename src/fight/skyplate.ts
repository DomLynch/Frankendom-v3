// The skyline as a far backdrop PLATE (Dom 2026-10-27, phone, portrait: the 360-degree strip showed a tenth of a 10:1 picture blown up to a pink blur and the alien face could never
// fit). The plate is a `spanDegrees` arc of the same far cylinder, facing the camp, showing the picture at its NATIVE aspect (no stretch): a window of the image `cropAspect` wide to
// tall is cut around the face (the whole picture when it is no wider), the arc is as tall as that window needs at its width, and everywhere else is a plain sky gradient (a second,
// vertex-coloured cylinder). The plate's edges fade to nothing so they melt into the gradient. Every number is data/stage.json `skyline.plate` (validated by src/sim/validate.js
// checkSkyPlate). Swap the picture by changing `plate.file` (and `face`, `horizonFraction`, `cropAspect` if the new one differs). Presentation only. ?skyplate=v1 = the old 360-degree strip.
import * as THREE from 'three';
import STAGE from '../../data/stage.json' with { type: 'json' };

export type PlateRow = typeof STAGE.skyline.plate;

/** The plate is on: the row is on and the link does not ask for the old strip (?skyplate=v1). */
export function plateOn(search: string, row: PlateRow): boolean {
  return row.on && new URLSearchParams(search).get(row.query) !== row.v1;
}

/** The window of the picture the plate shows: `w` = its width as a fraction of the picture's, `aspect` = width / height at the picture's native pixels (never stretched), `u0` = its left edge (fraction), centred on the face and kept inside the picture. */
export function plateWindow(row: PlateRow, imgW: number, imgH: number): { w: number; aspect: number; u0: number } {
  const native = imgW / imgH, w = Math.min(1, row.cropAspect / native);
  return { w, aspect: w * native, u0: Math.min(1 - w, Math.max(0, row.face.u - w / 2)) };
}

/** Width and height (m) of the arc at `radius`: the width is the arc's length, the height keeps the window's aspect. */
export function plateSize(row: PlateRow, radius: number, aspect: number): { width: number; height: number } {
  const width = radius * THREE.MathUtils.degToRad(row.spanDegrees);
  return { width, height: width / aspect };
}

/** Where the arc's centre sits relative to the camera's eye: the face lands `faceElevationDegrees` above the eye's level (seen from the cylinder's axis), so a pitched-up phone camera has the face in view. */
export function plateCentreY(row: PlateRow, radius: number, height: number): number {
  return radius * Math.tan(THREE.MathUtils.degToRad(row.faceElevationDegrees)) - height / 2 + row.face.v * height;
}

/** The picture's horizon row, relative to the eye (m). */
export function plateHorizonY(row: PlateRow, centreY: number, height: number): number { return centreY + height / 2 - row.horizonFraction * height; }

/** The arc: a partial cylinder centred on the face's own direction in the full strip (so the strip's yaw maths, the follow's offset included, puts the face ahead as before), its uv a window of the picture. */
export function plateGeometry(row: PlateRow, radius: number, imgW: number, imgH: number): THREE.CylinderGeometry {
  const win = plateWindow(row, imgW, imgH), { height } = plateSize(row, radius, win.aspect), span = THREE.MathUtils.degToRad(row.spanDegrees);
  const g = new THREE.CylinderGeometry(radius, radius, height, row.segments, 1, true, Math.PI * 2 * row.face.u - span / 2, span);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setX(i, win.u0 + uv.getX(i) * win.w);
  uv.needsUpdate = true;
  return g;
}

const smooth = (a: number, b: number, x: number) => { if (!(b > a)) return 1; const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Opacity across the plate: 1 inside, fading to 0 over the row's fractions at the two sides, the top and the bottom. u across (0..1), v up (0 = bottom, 1 = top). */
export function plateAlpha(row: PlateRow, u: number, v: number): number {
  return smooth(0, row.edgeFadeFraction, Math.min(u, 1 - u)) * smooth(0, row.topFadeFraction, 1 - v) * smooth(0, row.bottomFadeFraction, v);
}

/** The edge-fade map (green channel, which is what a material's alphaMap reads): small, linear, no mipmaps. */
export function plateAlphaMap(row: PlateRow, w = 128, h = 64): THREE.DataTexture {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = Math.round(255 * plateAlpha(row, (x + 0.5) / w, (y + 0.5) / h)), k = (y * w + x) * 4;
    data[k] = a; data[k + 1] = a; data[k + 2] = a; data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}

/** The plain sky: a cylinder of the plate's radius, `halfHeightMetres` either side of the eye, vertex-coloured haze at the bottom, horizon colour at the picture's horizon row (`horizonY`, relative to the eye), top colour at the top. */
export function skyGradient(row: PlateRow, radius: number, horizonY: number): THREE.CylinderGeometry {
  const s = row.sky, half = s.halfHeightMetres, g = new THREE.CylinderGeometry(radius, radius, half * 2, 48, s.rings, true);
  const haze = new THREE.Color(s.hazeColor), mid = new THREE.Color(s.horizonColor), top = new THREE.Color(s.topColor), pos = g.getAttribute('position'), col = new Float32Array(pos.count * 3), c = new THREE.Color();
  const hy = Math.min(half - 1, Math.max(-half + 1, horizonY));
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y <= hy) c.copy(haze).lerp(mid, smooth(-half, hy, y)); else c.copy(mid).lerp(top, smooth(hy, half, y));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
