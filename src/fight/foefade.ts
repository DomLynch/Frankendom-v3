// The far opponent melts into the clouds where the sand does (Dom 2026-10-27: a distant boss looked like he floated in the sky). skyview.ts melts the far sand by how far below the
// eye's horizon the camera sees it; a boss standing on melted sand was drawn solid over the cloud strip with nothing under his feet. This fades every opponent mesh by the SAME band
// (the view's fadeStartDegrees / fadeEndDegrees, skyview.ts fadeAlpha) measured at his FEET, so he is whole where the sand under him is whole and gone where it is gone. The hero is never
// faded. Rows: data/stage.json skyline.views (per-variant `foeFade`, the link ?foefade=v1 = off). Other players' presence figures share the hero's materials and are not faded here.
import * as THREE from 'three';
import { fadeAlpha, type SkyView, type SkyViews, SKYVIEWS } from './skyview.ts';

/** Degrees below the eye's horizon at which the eye sees a floor point (the floor shader's own maths, atan(drop / ground distance)). */
export function depressionDegrees(eye: { x: number; y: number; z: number }, feet: { x: number; y: number; z: number }): number {
  return THREE.MathUtils.radToDeg(Math.atan2(Math.max(eye.y - feet.y, 0.0001), Math.hypot(feet.x - eye.x, feet.z - eye.z)));
}

/** Whether the link/rows want the opponents faded: the view has a band and `foeFade` on, and the page does not say ?foefade=v1. */
export function foeFadeOn(search: string, view: SkyView | null, rows: SkyViews = SKYVIEWS): boolean {
  if (!view || !view.foeFade || !(view.fadeStartDegrees > view.fadeEndDegrees)) return false;
  return new URLSearchParams(search).get(rows.foeFadeQuery) !== rows.foeFadeV1;
}

export type FoeFade = {
  /** Every frame, with the camera's place. */
  move(eye: THREE.Vector3): void;
  /** Fades every mesh under `root` (an opponent's group; its origin is his feet). Safe to call again: meshes and materials already done are skipped. */
  adopt(root: THREE.Object3D): void;
  /** Materials under `hero` are never faded (a material shared with the hero is left alone entirely). */
  protect(hero: THREE.Object3D | null | undefined): void;
  /** The alpha a root at its current place gets (for the tests and the stills' probe). */
  alphaOf(root: THREE.Object3D): number;
};

export function createFoeFade(view: SkyView): FoeFade {
  const eye = new THREE.Vector3(), feet = new THREE.Vector3(), alpha = { value: 1 }, patched = new WeakSet<THREE.Material>(), protectedMats = new WeakSet<THREE.Material>(), hooked = new WeakSet<THREE.Object3D>();
  const alphaOf = (root: THREE.Object3D): number => {
    root.updateWorldMatrix(true, false);
    feet.setFromMatrixPosition(root.matrixWorld);
    return fadeAlpha(depressionDegrees(eye, feet), view.fadeStartDegrees, view.fadeEndDegrees);
  };
  const patch = (m: THREE.Material) => {
    if (patched.has(m) || protectedMats.has(m)) return;
    patched.add(m);
    m.transparent = true;
    const before = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      before?.call(m, shader, renderer);
      shader.uniforms.foeFade = alpha;
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform float foeFade;\nvoid main() {')
        .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n  gl_FragColor.a *= foeFade;');
    };
    const key = m.customProgramCacheKey;
    m.customProgramCacheKey = () => `foefade-${key.call(m)}`;
    m.needsUpdate = true;
  };
  return {
    move: (e) => { eye.copy(e); },
    protect(hero) { hero?.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) for (const x of Array.isArray(m) ? m : [m]) protectedMats.add(x); }); },
    adopt(root) {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh, m = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (!m || hooked.has(o)) return;
        const list = Array.isArray(m) ? m : [m];
        if (list.some((x) => protectedMats.has(x))) return;
        hooked.add(o);
        for (const x of list) patch(x);
        mesh.onBeforeRender = () => {   // the uniform is one shared value: set it for this mesh's draw, from the root's feet
          alpha.value = alphaOf(root);
          for (const x of list) x.uniformsNeedUpdate = true;
        };
      });
    },
    alphaOf,
  };
}
