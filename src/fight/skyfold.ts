// The folded floor (Dom 2026-10-27: "fold the image so the lower part becomes the floor"). The skyline strip's lower cloud band, the rows under its horizon, is laid flat on the
// ground under the sand: the horizon row is the fold line (the far edge), the strip's bottom edge the near edge, the picture's x following the cylinder's yaw so the clouds under the
// horizon line up with the sky above. Where the sand melts (skyview.ts) it now melts into cloud that runs out to the horizon and a far boss stands on it, not on nothing. Every number
// is data/stage.json `skyline.fold` (validated by src/sim/validate.js checkSkyFold). Presentation only. ?skyfold=v1 (or ?sky=v1, ?skyview=v1) builds nothing.
import * as THREE from 'three';
import STAGE from '../../data/stage.json' with { type: 'json' };
import { afterFirstFrame } from '../late-art.ts';
import { SKYLINE, SKYLINE_ORDER, skylineOn, type Skyline, type SkylineRow } from './skyline.ts';
import type { SkyView } from './skyview.ts';

export type FoldRow = typeof STAGE.skyline.fold;
export type FoldVariant = FoldRow['variants']['a'];
export const FOLD: FoldRow = STAGE.skyline.fold;

/** Draws after the strip (SKYLINE_ORDER) and before the sand (skyview.ts FLOOR_ORDER = SKYLINE_ORDER + 100); the row's offset sits between. */
export const FOLD_ORDER = SKYLINE_ORDER + FOLD.orderOffset;

/** The variant the link asks for (?skyfold=a|b), null for none (?skyfold=v1, the row off, the strip off); no link or a word the rows do not have = the row's `default`. */
export function foldFor(search: string, row: FoldRow = FOLD, skyRow: SkylineRow = SKYLINE): FoldVariant | null {
  if (!row.on || !skylineOn(search, skyRow)) return null;
  const id = new URLSearchParams(search).get(row.query), variants = row.variants as Record<string, FoldVariant>;
  if (id === row.v1) return null;
  if (id !== null && Object.prototype.hasOwnProperty.call(variants, id)) return variants[id];
  return variants[row.default];
}

/** Ground distance of ring `t` (0 = the far edge at the horizon row, 1 = the near edge): equal steps in 1/distance, which is how a flat floor is seen, so rows shrink toward the horizon. */
export function ringDistance(t: number, nearMetres: number, farMetres: number): number {
  return 1 / (1 / farMetres + t * (1 / nearMetres - 1 / farMetres));
}

/** The picture's v (0 = its bottom row, 1 = its top, as three.js flips it) for ring `t`: the band's top row at the far edge, its bottom row at the near edge. */
export function ringV(t: number, variant: Pick<FoldVariant, 'bandTopFraction' | 'bandBottomFraction'>): number {
  return 1 - (variant.bandTopFraction + t * (variant.bandBottomFraction - variant.bandTopFraction));
}

/** Opacity of ring `t`: 0 at the far edge, rising smoothly to 1 at `feather` of the way in, 1 from there; a 0 feather is solid everywhere. */
export function ringAlpha(t: number, feather: number): number {
  if (!(feather > 0)) return 1;
  const k = Math.min(1, Math.max(0, t / feather));
  return k * k * (3 - 2 * k);
}

/** The flat ring: `around` columns about the vertical (u = the angle / 2 pi, the cylinder's own mapping, so the two line up), `rings` rows in. Vertex colour carries the opacity. */
export function foldGeometry(row: FoldRow, variant: FoldVariant): THREE.BufferGeometry {
  const cols = row.around, rows = row.rings, pos: number[] = [], uv: number[] = [], col: number[] = [], index: number[] = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows, d = ringDistance(t, row.nearMetres, row.farMetres), v = ringV(t, variant), a = ringAlpha(t, row.featherFraction);
    for (let i = 0; i <= cols; i++) {
      const theta = (i / cols) * Math.PI * 2;
      pos.push(Math.sin(theta) * d, 0, Math.cos(theta) * d);   // the cylinder's x = r sin(theta), z = r cos(theta)
      uv.push(i / cols, v);
      col.push(1, 1, 1, a);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + cols + 1;
    index.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(index);
  return g;
}

export type Skyfold = {
  mesh: THREE.Mesh;
  /** Every frame before the draw: follows the eye (x, z; the height is the ground's), takes the strip's picture when it lands (variant A) and its fade-in. */
  update(camera: THREE.Vector3, dt: number, skyline: Skyline | null): void;
  readonly variant: FoldVariant;
  readonly opacity: number;
  dispose(): void;
};

/** Builds the folded floor, or null for ?skyfold=v1 / the row off / no strip / the look before the melt (`view` null). `load` is the fetch for a variant that has its own file. */
export function createSkyfold(
  scene: THREE.Scene, search: string, view: SkyView | null, row: FoldRow = FOLD, skyRow: SkylineRow = SKYLINE,
  load: (file: string) => Promise<THREE.Texture> = (file) => new THREE.TextureLoader().loadAsync(new URL(`../assets/skyline/${file}`, import.meta.url).href),
): Skyfold | null {
  const variant = foldFor(search, row, skyRow);
  if (!variant || !view) return null;
  const shade = view.brightness;
  const material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide, fog: false, toneMapped: false, transparent: true, opacity: 0, depthWrite: false, vertexColors: true,   // no depth write: it never fights the sand or the bodies
    color: new THREE.Color(shade, shade, shade),
  });
  const mesh = new THREE.Mesh(foldGeometry(row, variant), material);
  mesh.name = 'skyfold';
  mesh.renderOrder = FOLD_ORDER;
  mesh.frustumCulled = false;
  mesh.receiveShadow = false; mesh.castShadow = false;
  mesh.rotation.y = THREE.MathUtils.degToRad(skyRow.yawDegrees);   // the strip's own turn
  mesh.visible = false;
  scene.add(mesh);
  let own: THREE.Texture | undefined, disposed = false, opacity = 0;
  const prepare = (t: THREE.Texture) => {
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 1;
  };
  if (variant.file) {   // B: its own small picture, after the first frame like the strip
    afterFirstFrame()
      .then(() => new Promise<void>((done) => setTimeout(done, skyRow.loadAfterFirstFrameMs)))
      .then(() => (disposed ? undefined : load(variant.file)))
      .then((t) => { if (!t) return; if (disposed) { t.dispose(); return; } own = t; prepare(t); material.map = t; material.needsUpdate = true; mesh.visible = true; })
      .catch(() => { /* the strip behind stays */ });
  }
  return {
    mesh, variant,
    update(camera, _dt, skyline) {
      mesh.position.set(camera.x, row.groundY, camera.z);
      if (!variant.file && !material.map && skyline?.texture) { material.map = skyline.texture; material.needsUpdate = true; mesh.visible = true; }   // A: the strip's own picture, shared
      opacity = skyline ? skyline.opacity : opacity;   // arrives with the strip
      material.opacity = opacity;
    },
    get opacity() { return opacity; },
    dispose() { disposed = true; scene.remove(mesh); mesh.geometry.dispose(); material.dispose(); own?.dispose(); },   // the shared picture is the strip's to dispose
  };
}
