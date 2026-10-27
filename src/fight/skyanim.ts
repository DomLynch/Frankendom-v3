// The skyline plate's layers and their small coded motion (Dom 2026-10-27: "small motion on the static image"; the designer's registered layer set, manifest 2026-10-27). Presentation only: the plate's own
// material gets a few shader lines and a handful of uniforms, so a frame costs one clock tick and a few uniform writes (no texture re-upload, no extra draw). The base plate (`plate.file`) is the CLEAN
// plate (no globe, no planet), so the two cut-outs are composited over it at their registered place: they are part of the picture, not of the motion. Layers, all rows of data/stage.json
// `skyline.plate.anim` (validated by src/sim/validate.js checkSkyAnim); every layer file is named by its row, so a re-delivery is a file swap:
//   planet   the red planet's RGBA cut-out over the plate, plus a faint rim glow pulse            (static composite; the glow is the only motion)
//   globe    the small world: its RGBA cut-out, with a fake spin (the sphere's own pixels re-mapped, mirror-folded so it never seams) and a drifting glint, or (sprite.on) the designer's 24-frame turn sheet
//   glisten  the designer's greyscale mask drives an additive twinkle (and a slow sweep) on the ring technology; the halo itself never moves
// Cut-outs and the mask are cropped to their own rect when they land (so the GPU holds a few small textures, not four 4096 x 1024 ones) and are fetched after the plate lands; the plate waits for them (`ready`).
// ?skyanim=off (`query`, `off`), prefers-reduced-motion (`respectReducedMotion`) and a hidden tab stop the MOTION (the composite stays: it is the picture). `on: false` draws no layers (use a flattened plate).
import * as THREE from 'three';
import STAGE from '../../data/stage.json' with { type: 'json' };

export type AnimRow = typeof STAGE.skyline.plate.anim;
export const SKY_ANIM: AnimRow = STAGE.skyline.plate.anim;

/** The motion is on: the row is on and the link does not say ?skyanim=off. (The layers composite either way.) */
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
/** The glisten band's centre across the picture (fraction) at clock `t`: it sweeps the rect over `sweepSeconds` of every `periodSeconds`, then rests off its far edge. */
export function bandCentre(g: AnimRow['glisten'], t: number): number {
  const k = (t % g.periodSeconds) / g.sweepSeconds, pad = g.width * 2.5;
  return k >= 1 ? g.rect.u1 + pad * 2 : g.rect.u0 - pad + k * (g.rect.u1 - g.rect.u0 + 2 * pad);
}
/** The sprite frame showing at clock `t`: one step every `frameSeconds`, round the sheet's `frames`. */
export function spriteFrame(s: AnimRow['globe']['sprite'], t: number): number { return Math.floor(t / s.frameSeconds) % s.frames; }

const HEAD = /* glsl */ `
uniform float uAspect, uPlanetOn, uGlobeOn, uSpriteOn, uGlisOn;
uniform sampler2D uPlanetTex, uGlobeTex, uSpriteTex, uMaskTex;
uniform vec4 uPlanetRect, uGlobeRect, uMaskRect;
uniform vec2 uPlanetC, uGlobeC, uSpriteFrame, uSpriteSheet, uMaskTexel;
uniform float uPlanetR, uPlanetPulse, uPlanetLower, uGlobeR, uGlobeShift, uGlobeHiSize, uGlobeHiStr, uSpriteBall, uSpriteCell;
uniform vec2 uGlobeHi; uniform vec3 uPlanetGlowCol;
uniform float uBand, uBandW, uBandStr, uSlant, uTime, uTwinkleSec, uTwinkleCells, uTwinkleAmt, uBase, uSpread;
uniform vec3 uBandCol;
float skyFold(float a) { float m = mod(a + 1.5707963, 6.2831853); if (m > 3.1415927) m = 6.2831853 - m; return m - 1.5707963; }
float skyHash(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
vec4 skyLayer(sampler2D tex, vec4 rect, vec2 p) {   // p, rect in plate fractions (y down); a cropped layer, transparent outside its rect
  vec2 l = (p - rect.xy) / (rect.zw - rect.xy);
  if (l.x < 0.0 || l.y < 0.0 || l.x > 1.0 || l.y > 1.0) return vec4(0.0);
  return texture2D(tex, vec2(l.x, 1.0 - l.y));
}
`;
const BODY = /* glsl */ `
vec4 sampledDiffuseColor = texture2D(map, vMapUv);
vec2 skyP = vec2(vMapUv.x, 1.0 - vMapUv.y);
if (uPlanetOn > 0.5) {
  vec4 o = skyLayer(uPlanetTex, uPlanetRect, skyP);
  sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, o.rgb, o.a);
  vec2 q = vec2((skyP.x - uPlanetC.x) / uPlanetR, (skyP.y - uPlanetC.y) / (uPlanetR / uAspect)); float d = length(q);
  float rim = smoothstep(0.80, 1.0, d) * (1.0 - smoothstep(1.0, 1.06, d)) * (0.45 + 0.55 * clamp(q.x, 0.0, 1.0)) * (1.0 - smoothstep(uPlanetLower, uPlanetLower + 0.35, q.y));
  sampledDiffuseColor.rgb += uPlanetGlowCol * uPlanetPulse * rim * o.a;
}
if (uGlobeOn > 0.5) {
  vec2 q = vec2((skyP.x - uGlobeC.x) / uGlobeR, (skyP.y - uGlobeC.y) / (uGlobeR / uAspect)); float d = length(q), cy = sqrt(max(1e-4, 1.0 - q.y * q.y));
  vec2 p2 = skyP;
  if (d < 1.0 && uGlobeShift != 0.0) { float l2 = skyFold(asin(clamp(q.x / cy, -1.0, 1.0)) + uGlobeShift); p2 = vec2(uGlobeC.x + sin(l2) * cy * uGlobeR, uGlobeC.y + q.y * uGlobeR / uAspect); }
  vec4 o = skyLayer(uGlobeTex, uGlobeRect, p2);
  if (uSpriteOn > 0.5) {
    vec2 off = vec2(skyP.x - uGlobeC.x, (skyP.y - uGlobeC.y) / uAspect) * (uSpriteBall / uGlobeR);
    if (abs(off.x) < uSpriteCell * 0.5 && abs(off.y) < uSpriteCell * 0.5) o = texture2D(uSpriteTex, vec2((uSpriteFrame.x + off.x) / uSpriteSheet.x, 1.0 - (uSpriteFrame.y + off.y) / uSpriteSheet.y));
  }
  sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, o.rgb, o.a);
  sampledDiffuseColor.rgb += vec3(1.0, 0.97, 0.9) * uGlobeHiStr * exp(-dot(q - uGlobeHi, q - uGlobeHi) / (uGlobeHiSize * uGlobeHiSize)) * sqrt(max(0.0, 1.0 - d * d)) * o.a;
}
if (uGlisOn > 0.5) {
  vec2 lc = (skyP - uMaskRect.xy) / (uMaskRect.zw - uMaskRect.xy);
  if (lc.x > 0.0 && lc.y > 0.0 && lc.x < 1.0 && lc.y < 1.0) {
    float m = 0.0; vec2 t = uMaskTexel * uSpread;   // the mask's speckles are a pixel or two: spread them a few texels so they read at phone size
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) m = max(m, texture2D(uMaskTex, vec2(lc.x, 1.0 - lc.y) + vec2(float(i), float(j)) * t).r * (i == 0 && j == 0 ? 1.0 : 0.7));
    vec2 cell = floor(skyP * uTwinkleCells);
    float tw = 0.5 + 0.5 * sin(6.2831853 * (uTime / uTwinkleSec + skyHash(cell)));
    float s = (skyP.x + uSlant * skyP.y - uBand) / uBandW;
    sampledDiffuseColor.rgb += uBandCol * uBandStr * m * mix(1.0, tw, uTwinkleAmt) * (uBase + exp(-s * s));
  }
}
diffuseColor *= sampledDiffuseColor;
`;

export type SkyAnim = {
  /** Patches the plate's material (its `map` must be set). */
  apply(material: THREE.MeshBasicMaterial): void;
  /** Advances the clock by `dt` seconds (clamped; a hidden tab does not advance it; no motion = no change). */
  update(dt: number): void;
  /** Resolves when the layer pictures have landed (or failed, or `row.readyTimeoutSeconds` passed): the plate shows then, so a layer never pops in. */
  readonly ready: Promise<void>;
  readonly time: number;
  /** The motion is running (?skyanim=off and prefers-reduced-motion make it false: the layers still composite). */
  readonly moving: boolean;
  dispose(): void;
};

type Rect = { u0: number; v0: number; u1: number; v1: number };
const rectVec = (r: Rect) => new THREE.Vector4(r.u0, r.v0, r.u1, r.v1);

/** Crops a layer picture to `rect` (fractions of the picture, null = all of it), at `scale`, into a canvas texture. */
async function loadLayer(file: string, rect: Rect | null, scale: number, srgb: boolean): Promise<THREE.Texture> {
  const url = new URL(`../assets/skyline/${file}`, import.meta.url).href;
  const img = new Image(); img.decoding = 'async'; img.src = url; await img.decode();
  const r = rect ?? { u0: 0, v0: 0, u1: 1, v1: 1 }, sx = Math.floor(r.u0 * img.naturalWidth), sy = Math.floor(r.v0 * img.naturalHeight);
  const sw = Math.max(1, Math.ceil(r.u1 * img.naturalWidth) - sx), sh = Math.max(1, Math.ceil(r.v1 * img.naturalHeight) - sy);
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(sw * scale)); c.height = Math.max(1, Math.round(sh * scale));
  const g = c.getContext('2d')!; g.imageSmoothingQuality = 'high'; g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 1;
  return t;
}

/** Builds the layers (and, unless it is off, the motion) for a plate picture of `imgW` x `imgH`; null when the row is off. `flat` = the plate already has them baked in (?skyflat): draw none. */
export function createSkyAnim(search: string, imgW: number, imgH: number, row: AnimRow = SKY_ANIM, flat = false): SkyAnim | null {
  if (!row.on || flat) return null;
  const moving = animOn(search, row) && !(row.respectReducedMotion && reducedMotion());
  let t = 0, disposed = false;
  const g = row.globe, p = row.planet, l = row.glisten, sp = g.sprite, dummy = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat); dummy.needsUpdate = true;
  const own: THREE.Texture[] = [dummy];
  const u = {
    uAspect: { value: imgW / imgH }, uPlanetOn: { value: 0 }, uGlobeOn: { value: 0 }, uSpriteOn: { value: 0 }, uGlisOn: { value: 0 },
    uPlanetTex: { value: dummy as THREE.Texture }, uGlobeTex: { value: dummy as THREE.Texture }, uSpriteTex: { value: dummy as THREE.Texture }, uMaskTex: { value: dummy as THREE.Texture },
    uPlanetRect: { value: rectVec(p.rect) }, uGlobeRect: { value: rectVec(g.rect) }, uMaskRect: { value: rectVec(l.rect) },
    uPlanetC: { value: new THREE.Vector2(p.centre.u, p.centre.v) }, uGlobeC: { value: new THREE.Vector2(g.centre.u, g.centre.v) }, uSpriteFrame: { value: new THREE.Vector2() }, uSpriteSheet: { value: new THREE.Vector2(sp.sheetPx.w, sp.sheetPx.h) }, uMaskTexel: { value: new THREE.Vector2(1, 1) },
    uPlanetR: { value: p.radius }, uPlanetPulse: { value: 0 }, uPlanetLower: { value: p.glow.lowerFadeFrom }, uGlobeR: { value: g.radius }, uGlobeShift: { value: 0 }, uGlobeHiSize: { value: g.highlight.size }, uGlobeHiStr: { value: 0 },
    uSpriteBall: { value: sp.ballRadiusPx }, uSpriteCell: { value: sp.cellPx }, uGlobeHi: { value: new THREE.Vector2() }, uPlanetGlowCol: { value: new THREE.Color(p.glow.color).multiplyScalar(p.glow.strength) },
    uBand: { value: -9 }, uBandW: { value: l.width }, uBandStr: { value: l.strength }, uSlant: { value: l.slant }, uTime: { value: 0 }, uTwinkleSec: { value: l.twinkle.periodSeconds }, uTwinkleCells: { value: l.twinkle.cells }, uTwinkleAmt: { value: l.twinkle.amount },
    uBase: { value: l.baseGlow }, uSpread: { value: l.spreadTexels }, uBandCol: { value: new THREE.Color(l.color) },
  };
  const jobs: Promise<void>[] = [];
  const grab = (on: boolean, file: string, rect: Rect | null, scale: number, srgb: boolean, set: (tx: THREE.Texture) => void) => {
    if (!on || !file || typeof document === 'undefined' || typeof Image === 'undefined') return;   // a layer that is off is not even fetched
    jobs.push(loadLayer(file, rect, scale, srgb).then((tx) => { if (disposed) { tx.dispose(); return; } own.push(tx); set(tx); }).catch(() => {}));   // a missing layer: that layer is skipped, the plate carries on
  };
  grab(p.on, p.file, p.rect, 1, true, (tx) => { u.uPlanetTex.value = tx; u.uPlanetOn.value = 1; });
  grab(g.on, g.file, g.rect, 1, true, (tx) => { u.uGlobeTex.value = tx; u.uGlobeOn.value = 1; });
  grab(sp.on && moving, sp.file, null, sp.loadScale, true, (tx) => { u.uSpriteTex.value = tx; u.uSpriteOn.value = 1; });
  grab(l.on && moving, l.file, l.rect, 1, false, (tx) => { u.uMaskTex.value = tx; u.uGlisOn.value = 1; const im = tx.image as { width: number; height: number }; u.uMaskTexel.value.set(1 / im.width, 1 / im.height); });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ready = Promise.race([Promise.all(jobs).then(() => undefined), new Promise<void>((done) => { timer = setTimeout(done, row.readyTimeoutSeconds * 1000); (timer as { unref?: () => void }).unref?.(); })]).then(() => clearTimeout(timer));
  const tick = () => {
    if (!moving) return;
    u.uGlobeShift.value = g.spin.on ? spinShift(g.spin.secondsPerTurn, g.spin.swingDegrees, t) : 0;
    u.uGlobeHiStr.value = g.highlight.on ? g.highlight.strength : 0;
    const a = TAU * t / g.highlight.orbitSeconds; u.uGlobeHi.value.set(g.highlight.orbit * Math.cos(a), g.highlight.orbit * Math.sin(a) - g.highlight.lift);
    u.uPlanetPulse.value = p.glow.on ? 0.5 + 0.5 * Math.sin(TAU * t / p.glow.pulseSeconds) : 0;
    const f = sp.rects[spriteFrame(sp, t)]; u.uSpriteFrame.value.set(f.x + f.w / 2, f.y + f.h / 2);
    u.uBand.value = bandCentre(l, t); u.uTime.value = t;
  };
  tick();
  return {
    apply(m) {
      m.onBeforeCompile = (s) => {
        Object.assign(s.uniforms, u);
        s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\n${HEAD}`).replace('#include <map_fragment>', BODY);
      };
      m.customProgramCacheKey = () => 'skyanim2'; m.needsUpdate = true;
    },
    update(dt) {
      if (!moving || (typeof document !== 'undefined' && document.hidden)) return;   // a hidden tab stands still
      t += Math.min(0.1, Math.max(0, dt)); tick();
    },
    ready,
    get time() { return t; },
    get moving() { return moving; },
    dispose() { disposed = true; for (const x of own) x.dispose(); },
  };
}
