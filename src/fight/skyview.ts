// How much of the skyline shows (Dom 2026-10-27: love the image, the sand fills the screen, the camera stays as it is). Three link-chosen looks, every number a
// row in data/stage.json `skyline.views` (validated by src/sim/validate.js checkSkyline): ?skyview=a fogs the far sand into the strip's horizon haze, ?skyview=b
// melts the far sand to nothing (alpha) over a distance band so the lowered strip's cloud sea shows where it ends, ?skyview=c only lowers the strip. No link
// = today's look, nothing here runs. The sim, the camera and the fight's framing are not touched: this is the fog, the floor's alpha and the strip's height.
import * as THREE from 'three';
import STAGE from '../../data/stage.json' with { type: 'json' };

export type SkyViews = typeof STAGE.skyline.views;
export type SkyView = SkyViews['variants']['a'];
export const SKYVIEWS: SkyViews = STAGE.skyline.views;

/** The variant the link asks for (?skyview=a|b|c), or null = today's look (no link, an unknown word, or a variant the rows do not have). */
export function skyViewFor(search: string, rows: SkyViews = SKYVIEWS): SkyView | null {
  const id = new URLSearchParams(search).get(rows.query);
  return id !== null && Object.prototype.hasOwnProperty.call(rows.variants, id) ? (rows.variants as Record<string, SkyView>)[id] : null;
}

/** Variant A / B fog: the colour (the strip's horizon haze) and the density; a 0 density or an empty colour leaves the scene's own. */
export function applyFog(scene: THREE.Scene, view: SkyView): void {
  const fog = scene.fog;
  if (!(fog instanceof THREE.FogExp2)) return;
  if (view.fogColor) fog.color.set(view.fogColor);
  if (view.fogDensity > 0) fog.density = view.fogDensity;
}

/** Alpha for a surface `metres` from the eye: 1 up to `start`, 0 from `end`, smooth between (the shader's smoothstep, here for the tests); 1 everywhere when the band is off. */
export function fadeAlpha(metres: number, start: number, end: number): number {
  if (!(end > start)) return 1;
  const t = Math.min(1, Math.max(0, (metres - start) / (end - start)));
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Melts a floor material (the sand, the grid) to transparent between `fadeStartMetres` and `fadeEndMetres` of the eye (horizontal). Returns the per-frame call that
 * moves the eye; null when the variant has no band. The floor draws right after the strip and before every other transparent, so particles and trails stay over it.
 */
export function fadeFloor(parts: THREE.Object3D, view: SkyView, order: number): ((eye: THREE.Vector3) => void) | null {
  if (!(view.fadeEndMetres > view.fadeStartMetres)) return null;
  const eye = { value: new THREE.Vector3() }, band = { value: new THREE.Vector2(view.fadeStartMetres, view.fadeEndMetres) };
  parts.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (!m || Array.isArray(m)) return;
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
        .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n  gl_FragColor.a *= 1.0 - smoothstep(fadeBand.x, fadeBand.y, length(vFadeWorld.xz - fadeEye.xz));');
    };
    m.customProgramCacheKey = () => `skyview-fade-${view.fadeStartMetres}-${view.fadeEndMetres}`;
    m.needsUpdate = true;
  });
  return (e) => { eye.value.copy(e); };
}
