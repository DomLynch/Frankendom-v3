// The skyline backdrop (Dom 2026-10-27: "check these and put as the skyline background", the sand floor stays): a 360-degree sunset strip on a
// cylinder around the camera, far behind everything. Every number is data/stage.json `skyline` (validated by src/sim/validate.js checkSkyline).
// Presentation only: the sim, the floor, its colour, grid and fog are not touched. The strip is fetched after the first frame, so the flat sky
// colour (scene.background) is what the first paint shows; it fades in once it lands. ?sky=v1 builds nothing and fetches nothing.
import * as THREE from 'three';
import STAGE from '../../data/stage.json' with { type: 'json' };
import { afterFirstFrame } from '../late-art.ts';
import type { SkyView } from './skyview.ts';
import { plateOn, plateGeometry, plateAlphaMap, plateCentreY, plateHorizonY, plateSize, plateWindow, skyGradient } from './skyplate.ts';

/** The strip draws first of all the transparents (skyview.ts FLOOR_ORDER sits just after it). */
export const SKYLINE_ORDER = -1000;
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

/** ?skyfollow=v1 (`followV1`) turns the yaw follow off: the strip stays fixed in world yaw (the look before). */
export function skyFollowOn(search: string, row: SkylineRow = SKYLINE): boolean {
  return row.yawFollow > 0 && new URLSearchParams(search).get(row.followQuery) !== row.followV1;
}

const TAU = Math.PI * 2;
/** The camera's heading as a rotation about the vertical (0 = looking down -Z, the turn Object3D.rotation.y makes), from its world direction. */
export function headingOf(dirX: number, dirZ: number): number { return Math.atan2(-dirX, -dirZ); }
/** An angle difference folded into -pi..pi: the shortest way round (the strip is a cylinder, so a whole turn is the same picture). */
export function shortestTurn(delta: number): number { return delta - TAU * Math.round(delta / TAU); }
/** The strip's turn about the vertical for an unwrapped camera yaw: the row's fixed yaw, plus `followOffsetDegrees` (the follow only: it puts the alien ahead), plus `yawFollow` x the camera's. */
export function stripYaw(row: SkylineRow, cameraYaw: number): number { return THREE.MathUtils.degToRad(row.yawDegrees + row.followOffsetDegrees) + row.yawFollow * cameraYaw; }

export type Skyline = {
  mesh: THREE.Mesh;
  /** Tells the strip which way the camera faces this frame (call before update); a no-op under ?skyfollow=v1. */
  heading(camera: THREE.Object3D): void;
  /** The strip's current turn about the vertical, radians. */
  readonly yaw: number;
  /** Called every frame before the draw: follows the camera (the strip is at infinity) and eases the fade-in. */
  update(camera: THREE.Vector3, dt: number): void;
  readonly state: 'idle' | 'loading' | 'fading' | 'on' | 'failed';
  readonly opacity: number;
  /** The landed picture (skyfold.ts lays its lower band on the ground; no second download); undefined until it lands. */
  readonly texture: THREE.Texture | undefined;
  dispose(): void;
};

/** Builds the backdrop, or null under ?sky=v1 / `on: false`. `load` is the texture fetch (the page's own by default; the tests pass a stand-in). */
export function createSkyline(
  scene: THREE.Scene, search: string, row: SkylineRow = SKYLINE,
  load: () => Promise<THREE.Texture> = () => new THREE.TextureLoader().loadAsync(new URL(`../assets/skyline/${plateOn(search, row.plate) ? row.plate.file : row.file}`, import.meta.url).href),
  view: SkyView | null = null,   // ?skyview=a|b|c (skyview.ts): its drop, height and brightness; null = the row as it is
): Skyline | null {
  if (!skylineOn(search, row)) return null;
  const shade = view ? view.brightness : row.brightness, height = view && view.heightMetres > 0 ? view.heightMetres : row.heightMetres;
  const material = new THREE.MeshBasicMaterial({
    side: THREE.BackSide, fog: false, toneMapped: false, transparent: true, opacity: 0, depthWrite: false,   // nothing behind it to write; nothing nearer is hidden by it
    color: new THREE.Color(shade, shade, shade),
  });
  const plate = plateOn(search, row.plate) ? row.plate : null;   // data/stage.json skyline.plate: a far backdrop arc at the picture's native aspect + a plain sky gradient; ?skyplate=v1 = the whole 360-degree strip (below)
  let plateY = 0, dome: THREE.Mesh | undefined;   // plateY: the arc's centre relative to the eye (set when the picture lands and its real shape is known)
  if (plate) plateY = plateCentreY(plate, row.radius, plateSize(plate, row.radius, plate.cropAspect).height);
  const mesh = new THREE.Mesh(plate ? plateGeometry(plate, row.radius, plate.cropAspect * 100, 100) : new THREE.CylinderGeometry(row.radius, row.radius, height, 96, 1, true), material);
  mesh.name = 'skyline';
  mesh.renderOrder = SKYLINE_ORDER;   // first among the transparent draws, so every particle and trail composites over it
  mesh.frustumCulled = false;
  const fixedYaw = THREE.MathUtils.degToRad(plate ? plate.fixedYawDegrees : row.yawDegrees);   // ?skyfollow=v1: the strip stays at yawDegrees, the plate at fixedYawDegrees (its face toward the camp)
  mesh.rotation.y = fixedYaw;
  mesh.visible = false;
  scene.add(mesh);
  const follow = skyFollowOn(search, row), dir = new THREE.Vector3();
  let started = false, target = 0, turn = fixedYaw;   // turn = the strip's yaw, eased toward target by the shortest way (so winding never builds up: the alien is at most (1 - yawFollow) x 180 degrees off)
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
      if (plate) {   // now the picture's own shape is known: cut the window, size the arc to it, fade its edges, lay the plain sky behind
        const img = t.image as { width?: number; height?: number } | undefined, iw = img?.width || plate.cropAspect * 100, ih = img?.height || 100;
        const size = plateSize(plate, row.radius, plateWindow(plate, iw, ih).aspect);
        mesh.geometry.dispose(); mesh.geometry = plateGeometry(plate, row.radius, iw, ih);
        plateY = plateCentreY(plate, row.radius, size.height);
        material.alphaMap = plateAlphaMap(plate);
        dome = new THREE.Mesh(skyGradient(plate, row.radius, plateHorizonY(plate, plateY, size.height)), new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, toneMapped: false, transparent: true, opacity: 0, depthWrite: false, vertexColors: true, color: new THREE.Color(shade, shade, shade) }));
        dome.name = 'skyplate-sky'; dome.renderOrder = SKYLINE_ORDER - 1; dome.frustumCulled = false;
        mesh.add(dome);
      }
      material.map = t; material.needsUpdate = true; mesh.visible = true; state = 'fading';
    })
    .catch(() => { state = 'failed'; });   // the flat sky stays: nothing to report to the player
  return {
    mesh,
    heading(camera) {
      if (!follow) return;
      camera.getWorldDirection(dir);
      if (Math.hypot(dir.x, dir.z) < 1e-4) return;   // looking straight up or down: no heading, keep the last
      const h = headingOf(dir.x, dir.z);
      target = stripYaw(row, h);   // the camera's heading folded into -pi..pi: the offset from the view never grows with how many times he has turned
      if (!started) { started = true; turn = target; }   // the first frame starts on target: no spin-up
    },
    get yaw() { return turn; },
    update(camera, dt) {
      if (follow) {
        turn += shortestTurn(target - turn) * (row.yawFollowSeconds > 0 ? 1 - Math.exp(-dt / row.yawFollowSeconds) : 1);   // a slow ease: the far backdrop drifts after the turn
        mesh.rotation.y = turn;
      }
      mesh.position.set(camera.x, camera.y + (plate ? plateY : centreOffsetY(row, view)), camera.z);
      dome?.position.set(0, -plateY, 0);   // the gradient stays centred on the eye whatever the arc's height
      if (state === 'fading') {
        opacity = Math.min(1, opacity + (row.fadeSeconds > 0 ? dt / row.fadeSeconds : 1));
        material.opacity = opacity;
        if (dome) (dome.material as THREE.MeshBasicMaterial).opacity = opacity;
        if (opacity >= 1) state = 'on';
      }
    },
    get state() { return state; },
    get opacity() { return opacity; },
    get texture() { return texture; },
    dispose() { disposed = true; scene.remove(mesh); mesh.geometry.dispose(); material.dispose(); material.alphaMap?.dispose(); if (dome) { dome.geometry.dispose(); (dome.material as THREE.Material).dispose(); } texture?.dispose(); },
  };
}
