// The skyline backdrop (Dom 2026-10-27: "check these and put as the skyline background", the sand floor stays): a 360-degree sunset strip on a
// cylinder around the camera, far behind everything. Every number is data/stage.json `skyline` (validated by src/sim/validate.js checkSkyline).
// Presentation only: the sim, the floor, its colour, grid and fog are not touched. The strip is fetched after the first frame, so the flat sky
// colour (scene.background) is what the first paint shows; it fades in once it lands. ?sky=v1 builds nothing and fetches nothing.
import * as THREE from 'three';
import STAGE from '../../data/stage.json' with { type: 'json' };
import { afterFirstFrame } from '../late-art.ts';
import type { SkyView } from './skyview.ts';

export type SkylineRow = typeof STAGE.skyline;
export const SKYLINE: SkylineRow = STAGE.skyline;

/** The row is on and the link does not ask for today's flat sky (?sky=v1). */
export function skylineOn(search: string, row: SkylineRow = SKYLINE): boolean {
  return row.on && new URLSearchParams(search).get(row.query) !== row.v1;
}

/** Where the cylinder's centre sits relative to the camera: the strip's horizon (`horizonFraction` down it) lands at the camera's eye level. */
export function centreOffsetY(row: SkylineRow = SKYLINE, view: SkyView | null = null): number {
  const height = view && view.heightMetres > 0 ? view.heightMetres : row.heightMetres;
  return height / 2 - (1 - row.horizonFraction) * height - (view ? view.dropMetres : 0);   // ?skyview: dropMetres lowers the whole strip (0 = today)
}

export type Skyline = {
  mesh: THREE.Mesh;
  /** Called every frame before the draw: follows the camera (the strip is at infinity) and eases the fade-in. */
  update(camera: THREE.Vector3, dt: number): void;
  readonly state: 'idle' | 'loading' | 'fading' | 'on' | 'failed';
  readonly opacity: number;
  dispose(): void;
};

/** Builds the backdrop, or null under ?sky=v1 / `on: false`. `load` is the texture fetch (the page's own by default; the tests pass a stand-in). */
export function createSkyline(
  scene: THREE.Scene, search: string, row: SkylineRow = SKYLINE,
  load: () => Promise<THREE.Texture> = () => new THREE.TextureLoader().loadAsync(new URL(`../assets/skyline/${row.file}`, import.meta.url).href),
  view: SkyView | null = null,   // ?skyview=a|b|c (skyview.ts): its drop, height and brightness; null = the row as it is
): Skyline | null {
  if (!skylineOn(search, row)) return null;
  const shade = view ? view.brightness : row.brightness, height = view && view.heightMetres > 0 ? view.heightMetres : row.heightMetres;
  const material = new THREE.MeshBasicMaterial({
    side: THREE.BackSide, fog: false, toneMapped: false, transparent: true, opacity: 0, depthWrite: false,   // nothing behind it to write; nothing nearer is hidden by it
    color: new THREE.Color(shade, shade, shade),
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(row.radius, row.radius, height, 96, 1, true), material);
  mesh.name = 'skyline';
  mesh.renderOrder = -1000;   // first among the transparent draws, so every particle and trail composites over it
  mesh.frustumCulled = false;
  mesh.rotation.y = THREE.MathUtils.degToRad(row.yawDegrees);
  mesh.visible = false;
  scene.add(mesh);
  let state: Skyline['state'] = 'idle', opacity = 0, texture: THREE.Texture | undefined, disposed = false;
  afterFirstFrame()
    .then(() => { state = 'loading'; return new Promise<void>((done) => setTimeout(done, row.loadAfterFirstFrameMs)); })
    .then(() => (disposed ? undefined : load()))
    .then((t) => {
      if (!t) return;
      if (disposed) { t.dispose(); return; }
      texture = t;
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;   // the two ends are cross-faded in the file (seamOverlapPx), so the wrap is invisible
      t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 1;
      material.map = t; material.needsUpdate = true; mesh.visible = true; state = 'fading';
    })
    .catch(() => { state = 'failed'; });   // the flat sky stays: nothing to report to the player
  return {
    mesh,
    update(camera, dt) {
      mesh.position.set(camera.x, camera.y + centreOffsetY(row, view), camera.z);
      if (state === 'fading') {
        opacity = Math.min(1, opacity + (row.fadeSeconds > 0 ? dt / row.fadeSeconds : 1));
        material.opacity = opacity;
        if (opacity >= 1) state = 'on';
      }
    },
    get state() { return state; },
    get opacity() { return opacity; },
    dispose() { disposed = true; scene.remove(mesh); mesh.geometry.dispose(); material.dispose(); texture?.dispose(); },
  };
}
