// The sky RING (Dom 2026-10-28: the designer's plates 2 to 4): the existing plate stays NORTH (skyplate.ts, unchanged); SOUTH, EAST and WEST are three more far backdrop arcs on the same
// cylinder, each a `spanDegrees` arc facing its compass bearing, so turning the camera round shows four views. Every number is data/stage.json `skyline.ring` (validated by src/sim/validate.js
// checkSkyRing). Presentation only. ?skyring=v1 (`query`/`v1`) builds nothing and fetches nothing: the look before (one plate, glued to the view).
//   WEIGHT: nothing here loads on the first visit. A plate is fetched only when the camera has turned to within `lazy.loadWithinDegrees` of its bearing (and the north plate has landed),
//   the phone picture (`mobile`) on a narrow screen, the `desktop` one from `desktop.minViewportWidth` up.
//   JOINS: the plates' own feathered margins (a flat pink/blue gradient) and the flat blue top / grey-blue band under the horizon are cropped off when they are baked (scripts/skyring-bake.mjs);
//   what is left is real picture to its very edge, and each arc lies over its neighbour by `overlapDegrees`, ramping in over that overlap (a cross-fade drawn in order: east, south, west, then
//   the north plate, whose own faded edge melts into east and west). The creature (south) and the planets (east, west) are baked into the base: the designer's registered layers match to
//   within 0 to 4 grey levels of the master, so they are the picture, not an overlay.
import * as THREE from 'three';
import STAGE from '../../data/stage.json' with { type: 'json' };

export type RingRow = typeof STAGE.skyline.ring;
export type RingPlateRow = RingRow['plates'][number];

/** The ring is on: the row is on and the link does not ask for the look before (?skyring=v1). */
export function ringOn(search: string, row: RingRow): boolean {
  return row.on && new URLSearchParams(search).get(row.query) !== row.v1;
}

/** A turn of the view as a compass bearing in degrees clockwise (0 = north, the plate that faces the camp; 90 = east), 0..360, from the camera's heading (radians, left turn positive, relative to north). */
export function bearingOf(heading: number): number {
  const d = ((-heading * 180 / Math.PI) % 360 + 360) % 360;
  return d >= 360 ? 0 : d;
}
/** The shortest way round between two bearings, degrees 0..180. */
export function angularGap(a: number, b: number): number { const d = Math.abs(((a - b) % 360 + 360) % 360); return d > 180 ? 360 - d : d; }

/** Which plate a view at `bearing` faces: 'north' or the id of the nearest plate that is on. */
export function facingPlate(bearing: number, row: RingRow): string {
  let best = 'north', gap = angularGap(bearing, 0);
  for (const p of row.plates) if (p.on) { const g = angularGap(bearing, p.compassDegrees); if (g < gap) { gap = g; best = p.id; } }
  return best;
}
/** The plates whose fetch the camera has earned: those within `lazy.loadWithinDegrees` of the view (never any at the first heading: the nearest, north, is the plate already there). */
export function platesToLoad(bearing: number, row: RingRow): RingPlateRow[] {
  return row.plates.filter((p) => p.on && angularGap(bearing, p.compassDegrees) <= row.lazy.loadWithinDegrees);
}
/** The picture a plate fetches: the phone file on a narrow screen, the desktop file from `desktop.minViewportWidth` up (when the plate has one). */
export function ringFileFor(plate: RingPlateRow, row: RingRow, viewportWidth: number): string {
  return plate.desktop && viewportWidth >= row.desktop.minViewportWidth ? plate.desktop : plate.mobile;
}

const smooth = (a: number, b: number, x: number) => { if (!(b > a)) return 1; const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Opacity across a plate: u across the PICTURE (0 = its left edge), v up (0 = bottom). The ramps are fractions of the arc (`rampLeftDegrees` / `rampRightDegrees` of `spanDegrees`). */
export function ringAlpha(plate: RingPlateRow, row: RingRow, u: number, v: number): number {
  return smooth(0, plate.rampLeftDegrees / row.spanDegrees, u) * smooth(0, plate.rampRightDegrees / row.spanDegrees, 1 - u) * smooth(0, row.topFadeFraction, 1 - v) * smooth(0, row.bottomFadeFraction, v);
}
export function ringAlphaMap(plate: RingPlateRow, row: RingRow, w = 256, h = 64): THREE.DataTexture {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = Math.round(255 * ringAlpha(plate, row, (x + 0.5) / w, (y + 0.5) / h)), k = (y * w + x) * 4;
    data[k] = a; data[k + 1] = a; data[k + 2] = a; data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}

/** Width and height (m) of an arc at `radius` for a picture `imgW` x `imgH` (native aspect, never stretched). */
export function ringSize(row: RingRow, radius: number, imgW: number, imgH: number): { width: number; height: number } {
  const width = radius * THREE.MathUtils.degToRad(row.spanDegrees);
  return { width, height: width * imgH / imgW };
}
/** The arc's centre height relative to the eye: its bottom edge (the horizon row of the picture) sits on the north plate's horizon (`horizonY`, m). */
export function ringCentreY(horizonY: number, height: number): number { return horizonY + height / 2; }
/** World angle (radians, about the vertical, the CylinderGeometry's theta) of a compass bearing: north is -Z (theta 180), east +X (theta 90). */
export function bearingTheta(compassDegrees: number): number { return THREE.MathUtils.degToRad(180 - compassDegrees); }

/** The arc: a partial cylinder centred on the plate's bearing, its picture's left edge on the viewer's left (the cylinder's own u runs the other way seen from inside, so it is flipped). */
export function ringGeometry(plate: RingPlateRow, row: RingRow, radius: number, imgW: number, imgH: number): THREE.CylinderGeometry {
  const { height } = ringSize(row, radius, imgW, imgH), span = THREE.MathUtils.degToRad(row.spanDegrees);
  const g = new THREE.CylinderGeometry(radius, radius, height, row.segments, 1, true, bearingTheta(plate.compassDegrees) - span / 2, span);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  uv.needsUpdate = true;
  return g;
}

export type RingPlateState = 'idle' | 'loading' | 'fading' | 'on' | 'failed';
export type SkyRing = {
  /** The group that follows the eye; it is turned once to the north plate's yaw (call `yaw`). */
  readonly group: THREE.Group;
  /** The view's bearing this frame (degrees clockwise from north), once the north plate has landed: starts the fetch of every plate the camera has turned to. */
  request(bearing: number): void;
  update(camera: THREE.Vector3, dt: number): void;
  state(id: string): RingPlateState;
  readonly requested: string[];
  dispose(): void;
};

export type RingOptions = {
  row: RingRow; radius: number; horizonY: number; shade: number; viewportWidth: number;
  /** The texture fetch for a baked file name (the page's own by default; the tests pass a stand-in). */
  load: (file: string) => Promise<THREE.Texture>;
};

export function createSkyRing(o: RingOptions): SkyRing {
  const { row } = o, group = new THREE.Group(), requested: string[] = [], states = new Map<string, RingPlateState>(), meshes = new Map<string, THREE.Mesh>(), textures: THREE.Texture[] = [];
  let disposed = false;
  group.name = 'skyring';
  for (const p of row.plates) states.set(p.id, 'idle');
  const fetchPlate = (p: RingPlateRow, index: number) => {
    states.set(p.id, 'loading'); requested.push(p.id);
    o.load(ringFileFor(p, row, o.viewportWidth)).then((t) => {
      if (disposed) { t.dispose(); return; }
      textures.push(t);
      t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
      t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 1;
      const img = t.image as { width?: number; height?: number } | undefined, iw = img?.width || row.bakedAspect * 100, ih = img?.height || 100;
      const geometry = ringGeometry(p, row, o.radius, iw, ih), h = ringSize(row, o.radius, iw, ih).height, g = p.grade, shade = o.shade * g.brightness, tint = new THREE.Color(g.tint);
      const material = new THREE.MeshBasicMaterial({
        map: t, alphaMap: ringAlphaMap(p, row), side: THREE.BackSide, fog: false, toneMapped: false, transparent: true, opacity: 0, depthWrite: false,
        color: new THREE.Color(shade * tint.r, shade * tint.g, shade * tint.b),
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `skyring-${p.id}`; mesh.renderOrder = -1000 + row.orderOffset + index; mesh.frustumCulled = false;
      mesh.position.y = ringCentreY(o.horizonY - p.dropMetres, h);   // lowered by the plate's `dropMetres` so its subject (the south alien) sits in the band of sky a portrait phone shows
      group.add(mesh); meshes.set(p.id, mesh); states.set(p.id, 'fading');
    }).catch(() => { states.set(p.id, 'failed'); });
  };
  return {
    group, requested,
    request(bearing) {
      if (disposed) return;
      row.plates.forEach((p, i) => { if (states.get(p.id) === 'idle' && platesToLoad(bearing, row).includes(p)) fetchPlate(p, i); });
    },
    update(camera, dt) {
      group.position.set(camera.x, camera.y, camera.z);
      for (const [id, m] of meshes) {
        const mat = m.material as THREE.MeshBasicMaterial, st = states.get(id);
        if (st === 'fading') { mat.opacity = Math.min(1, mat.opacity + (row.lazy.fadeSeconds > 0 ? dt / row.lazy.fadeSeconds : 1)); if (mat.opacity >= 1) states.set(id, 'on'); }
      }
    },
    state(id) { return states.get(id) ?? 'idle'; },
    dispose() {
      disposed = true;
      for (const m of meshes.values()) { m.geometry.dispose(); const mat = m.material as THREE.MeshBasicMaterial; mat.alphaMap?.dispose(); mat.dispose(); }
      for (const t of textures) t.dispose();
      group.removeFromParent();
    },
  };
}
