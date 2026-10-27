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
  if (view.fogColor) { fog.color.set(view.fogColor); if (scene.background instanceof THREE.Color) scene.background.set(view.fogColor); }   // the flat sky behind the strip is the haze too: where the melted sand shows no strip it blends to the haze, not to blue
  if (view.fogDensity > 0) fog.density = view.fogDensity;
}

/** Alpha for a floor point seen `depression` degrees below the eye's horizon: 1 at `start` and steeper, 0 at `end` and shallower, smooth between (the shader's smoothstep, here for the tests); 1 everywhere when the band is off. */
export function fadeAlpha(depression: number, start: number, end: number): number {
  if (!(start > end)) return 1;
  const t = Math.min(1, Math.max(0, (depression - end) / (start - end)));
  return t * t * (3 - 2 * t);
}

/**
 * Melts a floor material (the sand, the grid) to transparent by how far below the horizon the eye sees it: solid at `fadeStartDegrees` and steeper, gone at `fadeEndDegrees`
 * and shallower. An angle, not a distance, so the melt stays where the lowered strip's bottom edge is however high the camera stands (the free walk lifts it). Returns the
 * per-frame call that moves the eye; null when the variant has no band. The floor draws right after the strip and before every other transparent, so particles and trails stay over it.
 */
export function fadeFloor(parts: THREE.Object3D, view: SkyView, order: number): ((eye: THREE.Vector3) => void) | null {
  if (!(view.fadeStartDegrees > view.fadeEndDegrees)) return null;
  const eye = { value: new THREE.Vector3() }, band = { value: new THREE.Vector2(view.fadeStartDegrees, view.fadeEndDegrees) };
  parts.userData.skyviewFade = { eye, band };   // read by the stills' probe only
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
        .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n  float fadeDepression = degrees(atan(max(fadeEye.y - vFadeWorld.y, 0.0001), length(vFadeWorld.xz - fadeEye.xz)));\n  gl_FragColor.a *= smoothstep(fadeBand.y, fadeBand.x, fadeDepression);');
    };
    m.customProgramCacheKey = () => `skyview-fade-${view.fadeStartDegrees}-${view.fadeEndDegrees}`;
    m.needsUpdate = true;
  });
  return (e) => { eye.value.copy(e); };
}
