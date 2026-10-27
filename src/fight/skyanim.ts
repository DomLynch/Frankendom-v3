// Small CODED motion on the skyline plate (Dom 2026-10-27: "small motion on the static image", lean: no video, under ~150 KB extra, here 0). Presentation only: the plate's own material gets a few
// shader lines and a handful of uniforms, so the per-frame cost is one clock tick and a few uniform writes (no texture re-upload, no extra draw). Three effects, every number a row of
// data/stage.json `skyline.plate.anim` (validated by src/sim/validate.js checkSkyAnim):
//   globe   the small world in the titan's raised hand: a fake spin (the sphere's own pixels re-mapped under a circle mask, longitude shifted, mirror-folded so it never seams) plus a drifting specular glint
//   planet  the red-pink planet: a slow swing of its disc and a faint rim/terminator glow pulse
//   glisten a soft additive sweep over the ring technology, driven by a mask derived in the shader from bright, high-contrast edge pixels (or by the designer's mask picture, `glisten.file`)
// ?skyanim=off (`query`, `off`) turns it all off; prefers-reduced-motion turns it off (`respectReducedMotion`); the clock stops while the tab is hidden.
// THE DESIGNER'S LAYERS drop in as rows (docs/SKY-LAYERS.md): `plate.file` = the clean plate, `globe.file` = an equirectangular surface map, `planet.file` = the same for the planet (a cut-out with alpha),
// `glisten.file` = a greyscale glisten mask. '' = made from the flattened plate (today). Positions and radii are fractions of the PLATE picture (radius: of its width), y down.
import * as THREE from 'three';
import STAGE from '../../data/stage.json' with { type: 'json' };

export type AnimRow = typeof STAGE.skyline.plate.anim;
export const SKY_ANIM: AnimRow = STAGE.skyline.plate.anim;

/** The motion is on: the row is on and the link does not say ?skyanim=off. */
export function animOn(search: string, row: AnimRow = SKY_ANIM): boolean {
  return row.on && new URLSearchParams(search).get(row.query) !== row.off;
}
function reducedMotion(): boolean { try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } }

const TAU = Math.PI * 2;
/** A sphere's longitude shift (radians) at clock `t` seconds: a continuous turn every `secondsPerTurn`, or (swingDegrees > 0) a sine swing of that many degrees each way with the same period. */
export function spinShift(secondsPerTurn: number, swingDegrees: number, t: number): number {
  const phase = TAU * t / secondsPerTurn;
  return swingDegrees > 0 ? THREE.MathUtils.degToRad(swingDegrees) * Math.sin(phase) : phase;
}
/** The glisten band's centre across the picture (fraction) at clock `t`: it sweeps the box over `sweepSeconds` of every `periodSeconds`, then rests off its far edge. */
export function bandCentre(g: AnimRow['glisten'], t: number): number {
  const k = (t % g.periodSeconds) / g.sweepSeconds, pad = g.width * 2.5;
  return k >= 1 ? g.box.u1 + pad * 2 : g.box.u0 - pad + k * (g.box.u1 - g.box.u0 + 2 * pad);
}

const HEAD = /* glsl */ `
uniform float uAspect; uniform vec2 uTexel;
uniform vec2 uGlobeC; uniform float uGlobeR, uGlobeShift; uniform vec2 uGlobeHi; uniform float uGlobeHiSize, uGlobeHiStr, uGlobeMapOn, uGlobeLit; uniform sampler2D uGlobeMap;
uniform vec2 uPlanetC; uniform float uPlanetR, uPlanetShift, uPlanetPulse, uPlanetLower, uPlanetMapOn, uPlanetLit; uniform vec3 uPlanetGlowCol; uniform sampler2D uPlanetMap;
uniform vec3 uLight;
uniform vec4 uBox; uniform float uBand, uBandW, uBandStr, uSlant, uEdgeLo, uEdgeHi, uLumLo, uMaskOn; uniform vec3 uBandCol; uniform sampler2D uMask;
float skyFold(float a) { float m = mod(a + 1.5707963, 6.2831853); if (m > 3.1415927) m = 6.2831853 - m; return m - 1.5707963; }
float skyLuma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
`;
// q = the point on a disc (-1..1, y down); its longitude is shifted and mirror-folded (no seam) and the plate is read there; a designer map is read by true longitude/latitude instead.
const BODY = /* glsl */ `
vec4 sampledDiffuseColor = texture2D(map, vMapUv);
vec2 skyP = vec2(vMapUv.x, 1.0 - vMapUv.y);
{
  vec2 q = vec2((skyP.x - uGlobeC.x) / uGlobeR, (skyP.y - uGlobeC.y) / (uGlobeR / uAspect)); float d = length(q);
  if (d < 1.0) {
    float m = 1.0 - smoothstep(0.78, 1.0, d), z = sqrt(max(0.0, 1.0 - d * d)), cy = sqrt(max(1e-4, 1.0 - q.y * q.y)), lon = asin(clamp(q.x / cy, -1.0, 1.0)) + uGlobeShift;
    if (uGlobeMapOn > 0.5) {
      vec4 s = texture2D(uGlobeMap, vec2(lon / 6.2831853 + 0.5, 0.5 + asin(clamp(-q.y, -1.0, 1.0)) / 3.1415927));
      s.rgb *= mix(1.0, 0.4 + 0.6 * max(0.0, dot(normalize(vec3(q.x, -q.y, z)), uLight)), uGlobeLit);
      sampledDiffuseColor = mix(sampledDiffuseColor, s, s.a * (1.0 - smoothstep(0.92, 1.0, d)));
    } else {
      float l2 = skyFold(lon); vec2 p2 = vec2(uGlobeC.x + sin(l2) * cy * uGlobeR, uGlobeC.y + q.y * uGlobeR / uAspect);
      sampledDiffuseColor = mix(sampledDiffuseColor, texture2D(map, vec2(p2.x, 1.0 - p2.y)), m);
    }
    sampledDiffuseColor.rgb += vec3(1.0, 0.97, 0.9) * uGlobeHiStr * exp(-dot(q - uGlobeHi, q - uGlobeHi) / (uGlobeHiSize * uGlobeHiSize)) * z * (1.0 - smoothstep(0.85, 1.0, d));
  }
}
{
  vec2 q = vec2((skyP.x - uPlanetC.x) / uPlanetR, (skyP.y - uPlanetC.y) / (uPlanetR / uAspect)); float d = length(q);
  if (d < 1.06) {
    float low = 1.0 - smoothstep(uPlanetLower, uPlanetLower + 0.35, q.y), z = sqrt(max(0.0, 1.0 - d * d)), cy = sqrt(max(1e-4, 1.0 - q.y * q.y)), lon = asin(clamp(q.x / cy, -1.0, 1.0)) + uPlanetShift;
    if (d < 1.0) {
      if (uPlanetMapOn > 0.5) {
        vec4 s = texture2D(uPlanetMap, vec2(lon / 6.2831853 + 0.5, 0.5 + asin(clamp(-q.y, -1.0, 1.0)) / 3.1415927));
        s.rgb *= mix(1.0, 0.4 + 0.6 * max(0.0, dot(normalize(vec3(q.x, -q.y, z)), uLight)), uPlanetLit);
        sampledDiffuseColor = mix(sampledDiffuseColor, s, s.a * (1.0 - smoothstep(0.96, 1.0, d)));
      } else {
        float l2 = skyFold(lon); vec2 p2 = vec2(uPlanetC.x + sin(l2) * cy * uPlanetR, uPlanetC.y + q.y * uPlanetR / uAspect);
        sampledDiffuseColor = mix(sampledDiffuseColor, texture2D(map, vec2(p2.x, 1.0 - p2.y)), (1.0 - smoothstep(0.7, 1.0, d)) * low);
      }
    }
    float rim = smoothstep(0.80, 1.0, d) * (1.0 - smoothstep(1.0, 1.06, d)) * (0.45 + 0.55 * clamp(q.x, 0.0, 1.0));
    sampledDiffuseColor.rgb += uPlanetGlowCol * uPlanetPulse * rim * low;
  }
}
if (uBandStr > 0.0) {
  float feat;
  if (uMaskOn > 0.5) feat = texture2D(uMask, vMapUv).r;
  else {
    float l0 = skyLuma(sampledDiffuseColor.rgb), lx = skyLuma(texture2D(map, vMapUv + vec2(uTexel.x * 2.0, 0.0)).rgb), ly = skyLuma(texture2D(map, vMapUv + vec2(0.0, uTexel.y * 2.0)).rgb);
    feat = smoothstep(uEdgeLo, uEdgeHi, abs(l0 - lx) + abs(l0 - ly)) * smoothstep(uLumLo, uLumLo + 0.15, l0);
  }
  vec2 b = smoothstep(vec2(uBox.x, uBox.z), vec2(uBox.x + 0.03, uBox.z + 0.05), skyP) * (1.0 - smoothstep(vec2(uBox.y - 0.03, uBox.w - 0.05), vec2(uBox.y, uBox.w), skyP));
  float s = (skyP.x + uSlant * skyP.y - uBand) / uBandW;
  sampledDiffuseColor.rgb += uBandCol * uBandStr * feat * b.x * b.y * exp(-s * s);
}
diffuseColor *= sampledDiffuseColor;
`;

export type SkyAnim = {
  /** Patches the plate's material (its `map` must be set). */
  apply(material: THREE.MeshBasicMaterial): void;
  /** Advances the clock by `dt` seconds (clamped; a hidden tab does not advance it). */
  update(dt: number): void;
  readonly time: number;
  dispose(): void;
};

/** Builds the motion for a plate picture of `imgW` x `imgH`, or null when it is off (?skyanim=off, the row off, prefers-reduced-motion). */
export function createSkyAnim(search: string, imgW: number, imgH: number, row: AnimRow = SKY_ANIM): SkyAnim | null {
  if (!animOn(search, row) || (row.respectReducedMotion && reducedMotion())) return null;
  let t = 0, disposed = false;
  const g = row.globe, p = row.planet, l = row.glisten, dummy = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat); dummy.needsUpdate = true;
  const own: THREE.Texture[] = [dummy], loader = new THREE.TextureLoader();
  const u = {
    uAspect: { value: imgW / imgH }, uTexel: { value: new THREE.Vector2(1 / imgW, 1 / imgH) }, uLight: { value: new THREE.Vector3(row.light.x, row.light.y, row.light.z).normalize() },
    uGlobeC: { value: new THREE.Vector2(g.centre.u, g.centre.v) }, uGlobeR: { value: g.radius }, uGlobeShift: { value: 0 }, uGlobeHi: { value: new THREE.Vector2() }, uGlobeHiSize: { value: g.highlight.size }, uGlobeHiStr: { value: g.highlight.strength },
    uGlobeMapOn: { value: 0 }, uGlobeLit: { value: g.mapLit }, uGlobeMap: { value: dummy as THREE.Texture },
    uPlanetC: { value: new THREE.Vector2(p.centre.u, p.centre.v) }, uPlanetR: { value: p.radius }, uPlanetShift: { value: 0 }, uPlanetPulse: { value: 0 }, uPlanetLower: { value: p.lowerFadeFrom }, uPlanetMapOn: { value: 0 }, uPlanetLit: { value: p.mapLit },
    uPlanetGlowCol: { value: new THREE.Color(p.glow.color).multiplyScalar(p.glow.strength) }, uPlanetMap: { value: dummy as THREE.Texture },
    uBox: { value: new THREE.Vector4(l.box.u0, l.box.u1, l.box.v0, l.box.v1) }, uBand: { value: -9 }, uBandW: { value: l.width }, uBandStr: { value: l.strength }, uSlant: { value: l.slant }, uEdgeLo: { value: l.edgeLo }, uEdgeHi: { value: l.edgeHi }, uLumLo: { value: l.lumaFrom },
    uMaskOn: { value: 0 }, uBandCol: { value: new THREE.Color(l.color) }, uMask: { value: dummy as THREE.Texture },
  };
  const grab = (file: string, key: 'uGlobeMap' | 'uPlanetMap' | 'uMask', on: 'uGlobeMapOn' | 'uPlanetMapOn' | 'uMaskOn', srgb: boolean) => {   // an optional designer picture: fetched once, then just a uniform
    if (!file) return;
    loader.loadAsync(new URL(`../assets/skyline/${file}`, import.meta.url).href).then((tx) => {
      if (disposed) { tx.dispose(); return; }
      tx.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; tx.wrapS = THREE.RepeatWrapping; tx.generateMipmaps = false; tx.minFilter = THREE.LinearFilter;
      own.push(tx); u[key].value = tx; u[on].value = 1;
    }).catch(() => {});   // a missing layer: the flattened plate's own pixels carry on
  };
  grab(g.file, 'uGlobeMap', 'uGlobeMapOn', true); grab(p.file, 'uPlanetMap', 'uPlanetMapOn', true); grab(l.file, 'uMask', 'uMaskOn', false);
  const tick = () => {
    u.uGlobeShift.value = spinShift(g.secondsPerTurn, g.swingDegrees, t);
    const a = TAU * t / g.highlight.orbitSeconds; u.uGlobeHi.value.set(g.highlight.orbit * Math.cos(a), g.highlight.orbit * Math.sin(a) - g.highlight.lift);
    u.uPlanetShift.value = spinShift(p.secondsPerTurn, p.swingDegrees, t);
    u.uPlanetPulse.value = 0.5 + 0.5 * Math.sin(TAU * t / p.glow.pulseSeconds);
    u.uBand.value = bandCentre(l, t);
  };
  tick();
  return {
    apply(m) {
      m.onBeforeCompile = (s) => {
        Object.assign(s.uniforms, u);
        s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\n${HEAD}`).replace('#include <map_fragment>', BODY);
      };
      m.customProgramCacheKey = () => 'skyanim1'; m.needsUpdate = true;
    },
    update(dt) {
      if (typeof document !== 'undefined' && document.hidden) return;   // a hidden tab stands still
      t += Math.min(0.1, Math.max(0, dt)); tick();
    },
    get time() { return t; },
    dispose() { disposed = true; for (const x of own) x.dispose(); },
  };
}
