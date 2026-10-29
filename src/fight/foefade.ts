// The far opponent melts into the clouds where the sand does (Dom 2026-10-27: a distant boss looked like he floated in the sky). skyview.ts melts the far sand by how far below the
// eye's horizon the camera sees it; a boss standing on melted sand was drawn solid over the cloud strip with nothing under his feet. This fades every opponent mesh by the SAME band
// (the view's fadeStartDegrees / fadeEndDegrees, the floor shader's smoothstep = skyview.ts fadeAlpha) measured at his FEET, so he is whole where the sand under him is whole and gone
// where it is gone. The hero is never faded: his materials are never patched (and a material shared with him is skipped). The fade lives in the vertex shader: the mesh's own world
// origin (three's modelMatrix, uploaded for every draw: a shared uniform is only re-sent when the material changes, so it cannot carry a per-boss value) is his feet, taken on the
// ground (y 0, the sand), and cameraPosition is the eye. A screen-door dissolve (discard by a fixed dither) keeps the materials opaque, so draw order, depth and shadows do not change.
// Rows: data/stage.json skyline.views (per-variant `foeFade`, foeFadeQuery / foeFadeV1 = ?foefade=v1 off).
import * as THREE from 'three';
import { fadeAlpha, type SkyView, type SkyViews, SKYVIEWS } from './skyview.ts';

/** Degrees below the eye's horizon at which the eye sees a floor point (the floor shader's own maths, atan(drop / ground distance)). */
export function depressionDegrees(eye: { x: number; y: number; z: number }, feet: { x: number; y: number; z: number }): number {
  return THREE.MathUtils.radToDeg(Math.atan2(Math.max(eye.y - feet.y, 0.0001), Math.hypot(feet.x - eye.x, feet.z - eye.z)));
}

/** Whether the rows and link want the opponents faded: the view has a band and `foeFade` on, and the page does not say ?foefade=v1. */
export function foeFadeOn(search: string, view: SkyView | null, rows: SkyViews = SKYVIEWS): boolean {
  if (!view || !view.foeFade || !(view.fadeStartDegrees > view.fadeEndDegrees)) return false;
  return new URLSearchParams(search).get(rows.foeFadeQuery) !== rows.foeFadeV1;
}

/** The two shader edits for a band: the vertex shader measures the mesh origin's depression from the eye (feet on the ground), the fragment shader dissolves by it. */
export function foeFadeShader(vertex: string, fragment: string, view: Pick<SkyView, 'fadeStartDegrees' | 'fadeEndDegrees' | 'foeFadeMinOpacity' | 'foeFadeClearMetres'>): { vertexShader: string; fragmentShader: string } {
  const f = (n: number) => n.toFixed(4);
  if (!vertex.includes('#include <project_vertex>') || !vertex.includes('void main() {') || !fragment.includes('void main() {')) return { vertexShader: vertex, fragmentShader: fragment };   // a custom shader (trail, sprite, points): left as it is
  return {
    vertexShader: vertex
      .replace('void main() {', 'varying float vFoeFade;\nvoid main() {')
      .replace('#include <project_vertex>', `#include <project_vertex>\n  vec3 foeFeet = vec3(modelMatrix[3].x, 0.0, modelMatrix[3].z);\n  float foeDepression = degrees(atan(max(cameraPosition.y - foeFeet.y, 0.0001), length(foeFeet.xz - cameraPosition.xz)));\n  float foeBand = max(smoothstep(${f(view.fadeEndDegrees)}, ${f(view.fadeStartDegrees)}, foeDepression), ${f(view.foeFadeMinOpacity)});\n  vFoeFade = length(foeFeet.xz - cameraPosition.xz) <= ${f(view.foeFadeClearMetres)} ? 1.0 : foeBand;`),
    fragmentShader: fragment.replace('void main() {', 'varying float vFoeFade;\nvoid main() {\n  if (vFoeFade <= fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;'),
  };
}

type FoeFade = {
  /** Every frame, with the camera's place (the shader reads the camera itself; this is for alphaOf). */
  move(eye: THREE.Vector3): void;
  /** Fades every mesh under `root` (an opponent's group; its origin is his feet). Safe to call again: materials already done are skipped. */
  adopt(root: THREE.Object3D): void;
  /** Materials under `hero` are never faded (a material shared with the hero is left alone entirely). */
  protect(hero: THREE.Object3D | null | undefined): void;
  /** The alpha a root's feet get at its current place (the CPU twin of the shader; the tests). */
  alphaOf(root: THREE.Object3D): number;
};

export function createFoeFade(view: SkyView): FoeFade {
  const eye = new THREE.Vector3(), feet = new THREE.Vector3(), patched = new WeakSet<THREE.Material>(), protectedMats = new WeakSet<THREE.Material>();
  const patch = (m: THREE.Material) => {
    if (patched.has(m) || protectedMats.has(m)) return;
    patched.add(m);
    const before = m.onBeforeCompile, base = m.customProgramCacheKey();   // the key the material had (the default is its onBeforeCompile text), kept so two different materials never share a program
    m.onBeforeCompile = (shader, renderer) => {
      before?.call(m, shader, renderer);
      Object.assign(shader, foeFadeShader(shader.vertexShader, shader.fragmentShader, view));
    };
    m.customProgramCacheKey = () => `foefade-${view.fadeStartDegrees}-${view.fadeEndDegrees}-${view.foeFadeMinOpacity}-${view.foeFadeClearMetres}-${base}`;
    m.needsUpdate = true;
  };
  return {
    move: (e) => { eye.copy(e); },
    protect(hero) { hero?.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) for (const x of Array.isArray(m) ? m : [m]) protectedMats.add(x); }); },
    adopt(root) {
      root.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (m) for (const x of Array.isArray(m) ? m : [m]) patch(x);
      });
    },
    alphaOf(root) {
      root.updateWorldMatrix(true, false);
      feet.setFromMatrixPosition(root.matrixWorld); feet.y = 0;
      if (Math.hypot(feet.x - eye.x, feet.z - eye.z) <= view.foeFadeClearMetres) return 1;   // inside the boss's reach (leash / aggro): never faded
      return Math.max(fadeAlpha(depressionDegrees(eye, feet), view.fadeStartDegrees, view.fadeEndDegrees), view.foeFadeMinOpacity);   // a far boss stays at least half there
    },
  };
}
