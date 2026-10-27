// How much of the skyline shows (Dom 2026-10-27: love the image, the sand fills the screen, the camera stays as it is; he picked B). Link-chosen looks, every number a
// row in data/stage.json `skyline.views` (validated by src/sim/validate.js checkSkyline): `default` (B) is what the page draws with no link: the far sand melts to nothing, by
// angle below the horizon, and the strip is lowered so its cloud sea shows where the sand ends. ?skyview=a only fogs the far sand into the strip's horizon haze, ?skyview=c only
// lowers the strip, ?skyview=v1 (`v1` row) is the look before this: no melt, no lowering. The sim, the camera and the fight's framing are not touched: this is the fog, the
// floor's alpha and the strip's height.
import * as THREE from 'three';
import STAGE from '../../data/stage.json' with { type: 'json' };
import { SKYLINE_ORDER } from './skyline.ts';

export type SkyViews = typeof STAGE.skyline.views;
export type SkyView = SkyViews['variants']['a'];
export const SKYVIEWS: SkyViews = STAGE.skyline.views;

/** The floor draws right after the strip (which is first, SKYLINE_ORDER) and before every other transparent, so particles and trails stay over it. */
export const FLOOR_ORDER = SKYLINE_ORDER + 100;

/** The look the link asks for: its variant (?skyview=a|b|c), null for the look before this (?skyview=v1), the row's `default` variant for no link or a word the rows do not have. */
export function skyViewFor(search: string, rows: SkyViews = SKYVIEWS): SkyView | null {
  const id = new URLSearchParams(search).get(rows.query), variants = rows.variants as Record<string, SkyView>;
  if (id === rows.v1) return null;
  if (id !== null && Object.prototype.hasOwnProperty.call(variants, id)) return variants[id];
  return rows.default === rows.v1 ? null : variants[rows.default];
}

/** The haze: the colour (the strip's horizon haze) and the density a variant fogs the far sand with; a 0 density or an empty colour leaves the scene's own. */
export function applyFog(scene: THREE.Scene, view: SkyView): void {
  const fog = scene.fog;
  if (!(fog instanceof THREE.FogExp2)) return;
  if (view.fogColor) { fog.color.set(view.fogColor); if (scene.background instanceof THREE.Color) scene.background.set(view.fogColor); }   // the flat sky behind the strip is the haze too: where the melted sand shows no strip it blends to the haze, not to blue
  if (view.fogDensity > 0) fog.density = view.fogDensity;
}

/** Alpha for a floor point seen `depression` degrees below the eye's horizon: 1 at `start` and steeper, 0 at `end` and shallower, smooth between (the shader's smoothstep, here for the tests); 1 everywhere when the band is off. */
export function fadeAlpha(depression: number, start: number, end: number): number {
  if (!(start > end)) return 1;
  const t = Math.min(1, Math.max(0, (depression - end) / (start - end)));
  return t * t * (3 - 2 * t);
}

export type FloorFade = {
  /** Called every frame with the camera's place: the melt is measured from the eye. */
  move(eye: THREE.Vector3): void;
  /** Melts every floor part under `parts` that is not melted yet (the zone's open ground swaps in a longer grid after the scene is built). */
  adopt(parts: THREE.Object3D): void;
};

/**
 * Melts the floor parts (the sand, the grid) to transparent by how far below the horizon the eye sees them: solid at `fadeStartDegrees` and steeper, gone at `fadeEndDegrees`
 * and shallower. An angle, not a distance, so the melt stays at the lowered strip's bottom edge however high the camera stands (the free walk lifts it), and the floor near the
 * hero keeps its sand and grid. World positions, so the zone's follow-the-hero floor melts the same. null when the variant has no band.
 */
export function fadeFloor(parts: THREE.Object3D, view: SkyView, order: number = FLOOR_ORDER): FloorFade | null {
  if (!(view.fadeStartDegrees > view.fadeEndDegrees)) return null;
  const eye = { value: new THREE.Vector3() }, band = { value: new THREE.Vector2(view.fadeStartDegrees, view.fadeEndDegrees) }, done = new WeakSet<THREE.Material>();
  const adopt = (root: THREE.Object3D) => {
    root.userData.skyviewFade = { eye, band };   // read by the stills' probe only
    root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (!m || Array.isArray(m) || done.has(m)) return;
      done.add(m);
      m.transparent = true;
      o.renderOrder = order;
      const before = m.onBeforeCompile;
      m.onBeforeCompile = (shader, renderer) => {
        before?.call(m, shader, renderer);
        shader.uniforms.fadeEye = eye; shader.uniforms.fadeBand = band;
        shader.vertexShader = shader.vertexShader
          .replace('void main() {', 'varying vec3 vFadeWorld;\nvoid main() {')
          .replace('#include <project_vertex>', '#include <project_vertex>\n  vFadeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('void main() {', 'uniform vec3 fadeEye;\nuniform vec2 fadeBand;\nvarying vec3 vFadeWorld;\nvoid main() {')
          .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n  float fadeDepression = degrees(atan(max(fadeEye.y - vFadeWorld.y, 0.0001), length(vFadeWorld.xz - fadeEye.xz)));\n  gl_FragColor.a *= smoothstep(fadeBand.y, fadeBand.x, fadeDepression);');
      };
      m.customProgramCacheKey = () => `skyview-fade-${view.fadeStartDegrees}-${view.fadeEndDegrees}`;
      m.needsUpdate = true;
    });
  };
  adopt(parts);
  return { move: (e) => { eye.value.copy(e); }, adopt };
}
