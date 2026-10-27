// The skyline plate's layers and their small coded motion (Dom 2026-10-27: "small motion on the static image"; the designer's registered layer set, manifest 2026-10-27). Presentation only: the plate's own
// material gets a few shader lines and a handful of uniforms, so a frame costs one clock tick and a few uniform writes (no texture re-upload, no extra draw). The base plate (`plate.file`) is the CLEAN
// plate (no globe, no planet), so the two cut-outs are composited over it at their registered place: they are part of the picture, not of the motion. Layers, all rows of data/stage.json
// `skyline.plate.anim` (validated by src/sim/validate.js checkSkyAnim); every layer file is named by its row, so a re-delivery is a file swap:
//   planet   the red planet's RGBA cut-out over the plate, plus a faint rim glow pulse            (static composite; the glow is the only motion)
//   globe    the small world: its RGBA cut-out, with a fake spin (the sphere's own pixels re-mapped, mirror-folded so it never seams) and a drifting glint, or (sprite.on) the designer's 24-frame turn sheet
//   glisten  the designer's greyscale mask drives an additive twinkle (and a slow sweep) on the ring technology; the halo itself never moves
// Cut-outs and the mask are cropped to their own rect when they land (so the GPU holds a few small textures, not four 4096 x 1024 ones) and are fetched after the plate lands; the plate waits for them (`ready`).
//   eyes     (pack 2) blink and wink RGBA patches over the face at native size on a seeded schedule, the patch edge feathered so no seam shows
//   drool    (pack 2) a slow shimmer down the stationary streak (the designer's mask) and a droplet that spawns, falls (plain sprite, then the stretched one at speed) and fades
//   planet.sphere (pack 2) the planet is a real turning sphere: an equirectangular surface wrapped on the disc, the designer's shading disc fixed on top, the cut-out's alpha still hides the part behind the clouds
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

/** Sky life maths (all from rows, all presentation). A small seeded generator (mulberry32): the sparkle order is the same every visit, so it is testable. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** A sparkle's brightness across its life (age 0..1): a quick rise to full at a fifth of the way, then a slow smooth fall to nothing. */
export function sparkleEnvelope(age: number): number {
  if (!(age > 0 && age < 1)) return 0;
  const k = age < 0.2 ? age / 0.2 : 1 - (age - 0.2) / 0.8;
  return k * k * (3 - 2 * k);
}
/** The sparkle scheduler: one glint at a time, a random gap (min..max seconds) between them, and never the same anchor twice running. `at(t)` returns the live glint (a shared object, no allocation). */
export function createSparkler(row: AnimRow['sparkle'], rand: () => number = seededRandom(row.seed)) {
  let nextAt = row.firstDelaySeconds, start = -1, anchor = -1, last = -1;
  const out = { anchor: 0, intensity: 0 };
  return {
    at(t: number) {
      if (anchor >= 0 && t - start >= row.durationSeconds) { last = anchor; anchor = -1; nextAt = start + row.durationSeconds + row.minGapSeconds + rand() * (row.maxGapSeconds - row.minGapSeconds); }
      if (anchor < 0 && t >= nextAt) {
        const n = row.anchors.length; let i = Math.floor(rand() * n) % n; if (i === last) i = (i + 1 + Math.floor(rand() * (n - 1))) % n;
        anchor = i; start = t;
      }
      out.anchor = Math.max(anchor, 0); out.intensity = anchor < 0 ? 0 : sparkleEnvelope((t - start) / row.durationSeconds);
      return out;
    },
  };
}
const sstep = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / Math.max(1e-9, b - a))); return k * k * (3 - 2 * k); };
/** How much of the breath's lift applies at plate point (u, v): 1 across the rect's middle, fading smoothly to 0 over `featherFraction` of the rect's size at every edge (the shader does the same). */
export function breathWindow(b: AnimRow['breathing'], u: number, v: number): number {
  const r = b.rect, fx = b.featherFraction * (r.u1 - r.u0), fy = b.featherFraction * (r.v1 - r.v0);
  return sstep(r.u0, r.u0 + fx, u) * (1 - sstep(r.u1 - fx, r.u1, u)) * sstep(r.v0, r.v0 + fy, v) * (1 - sstep(r.v1 - fy, r.v1, v));
}
/** A sine offset in plate pixels at clock `t`: `amplitudePx` either side over `periodSeconds`, started `phase` of a turn in. */
export function sineOffsetPx(amplitudePx: number, periodSeconds: number, phase: number, t: number): number { return amplitudePx * Math.sin(TAU * (t / periodSeconds + phase)); }

/** The eye scheduler: one event at a time, every min..max seconds (seeded), a blink or a wink (a wink about every `wink.everyEvents` events, +/- `everyJitter`, always at least one blink between two winks). `at(t)` returns the live event (kind 0 none, 1 blink, 2 wink; amount 0..1 with a short ramp in and out). */
export function createBlinker(row: AnimRow['eyes'], rand: () => number = seededRandom(row.seed)) {
  const gap = () => row.intervalMinSeconds + rand() * (row.intervalMaxSeconds - row.intervalMinSeconds);
  const pickWink = () => Math.max(2, row.wink.everyEvents + Math.round((rand() * 2 - 1) * row.wink.everyJitter));
  let nextAt = row.firstDelaySeconds, start = 0, hold = 0, kind = 0, untilWink = pickWink();
  const out = { kind: 0, amount: 0 };
  return {
    at(t: number) {
      if (kind && t - start >= hold) { kind = 0; nextAt = start + hold + gap(); }
      if (!kind && t >= nextAt) {
        untilWink--;
        let k = 1; if (untilWink <= 0) { k = 2; untilWink = pickWink(); }
        const c = k === 2 ? row.wink : row.blink;
        if (c.on) { kind = k; start = t; hold = c.holdMinSeconds + rand() * (c.holdMaxSeconds - c.holdMinSeconds); } else nextAt = t + gap();
      }
      const f = Math.max(row.fadeSeconds, 1e-6);
      out.kind = kind; out.amount = kind ? Math.min(1, (t - start) / f, (start + hold - t) / f) : 0;
      return out;
    },
  };
}
/** The droplet scheduler: waits spawnMin..spawnMax seconds (seeded), then falls `fallDistancePx` plate pixels (start speed + constant acceleration), fading in, then out over the last `fadeOutPx`; `stretch` is 1 from `stretchFromSpeedPx`. `at(t)` returns the live drop (y = pixels fallen, alpha 0 when none). */
export function createDrooler(row: AnimRow['drool']['drop'], rand: () => number = seededRandom(row.seed)) {
  let nextAt = row.firstDelaySeconds, start = -1;
  const out = { y: 0, alpha: 0, stretch: 0, speed: 0 };
  const fall = (a: number) => row.startSpeedPx * a + 0.5 * row.accelPx * a * a;
  return {
    at(t: number) {
      if (start >= 0 && fall(t - start) >= row.fallDistancePx) { start = -1; nextAt = t + row.spawnMinSeconds + rand() * (row.spawnMaxSeconds - row.spawnMinSeconds); }
      if (start < 0 && t >= nextAt) start = t;
      if (start < 0) { out.y = 0; out.alpha = 0; out.stretch = 0; out.speed = 0; return out; }
      const a = t - start, y = Math.min(row.fallDistancePx, fall(a));
      out.y = y; out.speed = row.startSpeedPx + row.accelPx * a; out.stretch = out.speed >= row.stretchFromSpeedPx ? 1 : 0;
      out.alpha = row.strength * Math.min(1, a / Math.max(row.fadeInSeconds, 1e-6)) * (row.fadeOutPx > 0 ? Math.min(1, (row.fallDistancePx - y) / row.fadeOutPx) : 1);
      return out;
    },
  };
}
/** The planet's turn (a fraction of a turn, 0..1) at clock `t`: features move left to right (a world turning eastward), starting `startTurns` round. */
export function planetTurn(startTurns: number, secondsPerTurn: number, t: number): number { const x = (startTurns - t / secondsPerTurn) % 1; return x < 0 ? x + 1 : x; }

const HEAD = /* glsl */ `
uniform vec4 uBreathRect; uniform vec2 uBreathFeather, uSparkPos, uCrownC, uCrownR; uniform float uBreathLift, uBob, uSparkI, uSparkSize, uCrownI; uniform vec3 uSparkCol, uCrownCol;
uniform float uAspect, uPlanetOn, uGlobeOn, uSpriteOn, uGlisOn;
uniform sampler2D uPlanetTex, uGlobeTex, uSpriteTex, uMaskTex;
uniform vec4 uPlanetRect, uGlobeRect, uMaskRect;
uniform vec2 uPlanetC, uGlobeC, uSpriteFrame, uSpriteSheet, uMaskTexel;
uniform float uPlanetR, uPlanetPulse, uPlanetLower, uGlobeR, uGlobeShift, uGlobeHiSize, uGlobeHiStr, uSpriteBall, uSpriteCell;
uniform vec2 uGlobeHi; uniform vec3 uPlanetGlowCol;
uniform float uBand, uBandW, uBandStr, uSlant, uTime, uTwinkleSec, uTwinkleCells, uTwinkleAmt, uBase, uSpread;
uniform vec3 uBandCol;
uniform sampler2D uEyeTexA, uEyeTexB, uDroolTex, uDropTexA, uDropTexB, uSurfTex, uShadeTex;
uniform vec4 uEyeRect, uDroolRect, uDropRect; uniform vec2 uEyeFeather, uDroolTexel; uniform vec3 uDroolCol;
uniform float uEyeAmt, uEyeKind, uDropA, uDropUse, uDroolI, uDroolPhase, uDroolWaves, uDroolSpread, uSphereOn, uPlanetTurn, uShadeDisc, uShadeStr;
float skyFold(float a) { float m = mod(a + 1.5707963, 6.2831853); if (m > 3.1415927) m = 6.2831853 - m; return m - 1.5707963; }
float skyHash(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
vec4 skyLayer(sampler2D tex, vec4 rect, vec2 p) {   // p, rect in plate fractions (y down); a cropped layer, transparent outside its rect
  vec2 l = (p - rect.xy) / (rect.zw - rect.xy);
  if (l.x < 0.0 || l.y < 0.0 || l.x > 1.0 || l.y > 1.0) return vec4(0.0);
  return texture2D(tex, vec2(l.x, 1.0 - l.y));
}
`;
const BODY = /* glsl */ `
vec2 skyP = vec2(vMapUv.x, 1.0 - vMapUv.y);
float skyWin = smoothstep(uBreathRect.x, uBreathRect.x + uBreathFeather.x, skyP.x) * (1.0 - smoothstep(uBreathRect.z - uBreathFeather.x, uBreathRect.z, skyP.x)) * smoothstep(uBreathRect.y, uBreathRect.y + uBreathFeather.y, skyP.y) * (1.0 - smoothstep(uBreathRect.w - uBreathFeather.y, uBreathRect.w, skyP.y));
vec2 skyB = vec2(skyP.x, skyP.y + uBreathLift * skyWin);   // the BODY's picture space: sampled a little lower = the body lifted; the clouds, horizon and edges (window 0) stay put
vec4 sampledDiffuseColor = texture2D(map, vec2(vMapUv.x, 1.0 - skyB.y));
if (uEyeAmt > 0.0) {   // a blink or wink patch at native size, in the body's picture space (it rides the breath), its edge feathered
  vec2 el = (skyB - uEyeRect.xy) / (uEyeRect.zw - uEyeRect.xy);
  if (el.x > 0.0 && el.y > 0.0 && el.x < 1.0 && el.y < 1.0) {
    vec2 ef = min(el, 1.0 - el) / uEyeFeather; float ew = clamp(min(ef.x, ef.y), 0.0, 1.0); ew = ew * ew * (3.0 - 2.0 * ew);
    vec4 e = uEyeKind < 1.5 ? texture2D(uEyeTexA, vec2(el.x, 1.0 - el.y)) : texture2D(uEyeTexB, vec2(el.x, 1.0 - el.y));
    sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, e.rgb, e.a * ew * uEyeAmt);
  }
}
if (uDroolI > 0.0) {   // a slow light running down the stationary streak (the designer's mask)
  vec2 dl = (skyB - uDroolRect.xy) / (uDroolRect.zw - uDroolRect.xy);
  if (dl.x > 0.0 && dl.y > 0.0 && dl.x < 1.0 && dl.y < 1.0) {
    float dm = 0.0; vec2 dt = uDroolTexel * uDroolSpread;
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) dm = max(dm, texture2D(uDroolTex, vec2(dl.x, 1.0 - dl.y) + vec2(float(i), float(j)) * dt).r * (i == 0 && j == 0 ? 1.0 : 0.7));
    sampledDiffuseColor.rgb += uDroolCol * uDroolI * dm * (0.5 + 0.5 * sin(6.2831853 * (uDroolPhase - dl.y * uDroolWaves)));
  }
}
if (uDropA > 0.0) {   // the falling droplet (plain sprite, or the stretched one at speed), in the body's picture space
  vec2 dd = (skyB - uDropRect.xy) / (uDropRect.zw - uDropRect.xy);
  if (dd.x > 0.0 && dd.y > 0.0 && dd.x < 1.0 && dd.y < 1.0) {
    vec4 dp = uDropUse < 0.5 ? texture2D(uDropTexA, vec2(dd.x, 1.0 - dd.y)) : texture2D(uDropTexB, vec2(dd.x, 1.0 - dd.y));
    sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, dp.rgb, dp.a * uDropA);
  }
}
if (uPlanetOn > 0.5) {
  vec4 o = skyLayer(uPlanetTex, uPlanetRect, skyP);
  vec2 q = vec2((skyP.x - uPlanetC.x) / uPlanetR, (skyP.y - uPlanetC.y) / (uPlanetR / uAspect)); float d = length(q);
  if (uSphereOn > 0.5 && o.a > 0.0) {   // a real sphere: the surface wrapped on the disc and turned, the shading disc fixed on top; the cut-out's alpha still hides what is behind the clouds
    vec2 qs = q / max(d, 1.0); float z = sqrt(max(0.0, 1.0 - dot(qs, qs)));
    vec3 sf = texture2D(uSurfTex, vec2(0.5 + atan(qs.x, max(z, 1e-4)) * 0.15915494 + uPlanetTurn, 0.5 - asin(clamp(qs.y, -1.0, 1.0)) * 0.31830989)).rgb;
    vec2 su = 0.5 + 0.5 * q * uShadeDisc; vec4 sh = texture2D(uShadeTex, vec2(su.x, 1.0 - su.y));
    o.rgb = mix(sf, sh.rgb, sh.a * uShadeStr);
  }
  sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, o.rgb, o.a);
  float rim = smoothstep(0.80, 1.0, d) * (1.0 - smoothstep(1.0, 1.06, d)) * (0.45 + 0.55 * clamp(q.x, 0.0, 1.0)) * (1.0 - smoothstep(uPlanetLower, uPlanetLower + 0.35, q.y));
  sampledDiffuseColor.rgb += uPlanetGlowCol * uPlanetPulse * rim * o.a;
}
if (uGlobeOn > 0.5) {
  vec2 skyG = vec2(skyP.x, skyP.y + uBob);   // the globe floats: sampled lower = it sits higher
  vec2 q = vec2((skyG.x - uGlobeC.x) / uGlobeR, (skyG.y - uGlobeC.y) / (uGlobeR / uAspect)); float d = length(q), cy = sqrt(max(1e-4, 1.0 - q.y * q.y));
  vec2 p2 = skyG;
  if (d < 1.0 && uGlobeShift != 0.0) { float l2 = skyFold(asin(clamp(q.x / cy, -1.0, 1.0)) + uGlobeShift); p2 = vec2(uGlobeC.x + sin(l2) * cy * uGlobeR, uGlobeC.y + q.y * uGlobeR / uAspect); }
  vec4 o = skyLayer(uGlobeTex, uGlobeRect, p2);
  if (uSpriteOn > 0.5) {
    vec2 off = vec2(skyG.x - uGlobeC.x, (skyG.y - uGlobeC.y) / uAspect) * (uSpriteBall / uGlobeR);
    if (abs(off.x) < uSpriteCell * 0.5 && abs(off.y) < uSpriteCell * 0.5) o = texture2D(uSpriteTex, vec2((uSpriteFrame.x + off.x) / uSpriteSheet.x, 1.0 - (uSpriteFrame.y + off.y) / uSpriteSheet.y));
  }
  sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, o.rgb, o.a);
  sampledDiffuseColor.rgb += vec3(1.0, 0.97, 0.9) * uGlobeHiStr * exp(-dot(q - uGlobeHi, q - uGlobeHi) / (uGlobeHiSize * uGlobeHiSize)) * sqrt(max(0.0, 1.0 - d * d)) * o.a;
}
if (uGlisOn > 0.5) {
  vec2 lc = (skyB - uMaskRect.xy) / (uMaskRect.zw - uMaskRect.xy);
  if (lc.x > 0.0 && lc.y > 0.0 && lc.x < 1.0 && lc.y < 1.0) {
    float m = 0.0; vec2 t = uMaskTexel * uSpread;   // the mask's speckles are a pixel or two: spread them a few texels so they read at phone size
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) m = max(m, texture2D(uMaskTex, vec2(lc.x, 1.0 - lc.y) + vec2(float(i), float(j)) * t).r * (i == 0 && j == 0 ? 1.0 : 0.7));
    vec2 cell = floor(skyB * uTwinkleCells);
    float tw = 0.5 + 0.5 * sin(6.2831853 * (uTime / uTwinkleSec + skyHash(cell)));
    float s = (skyB.x + uSlant * skyB.y - uBand) / uBandW;
    sampledDiffuseColor.rgb += uBandCol * uBandStr * m * mix(1.0, tw, uTwinkleAmt) * (uBase + exp(-s * s));
  }
}
if (uCrownI > 0.0) {   // a soft slow pulse over the crown's ring-tech
  vec2 cq = vec2((skyB.x - uCrownC.x) / uCrownR.x, (skyB.y - uCrownC.y) / (uAspect * uCrownR.y));
  sampledDiffuseColor.rgb += uCrownCol * uCrownI * exp(-dot(cq, cq));
}
if (uSparkI > 0.0) {   // a 4-point star glint: a bright core and four thin arms, in the body's picture space so it rides the breath
  vec2 sd = vec2(skyB.x - uSparkPos.x, (skyB.y - uSparkPos.y) / uAspect); float ss = uSparkSize;
  float star = exp(-dot(sd, sd) / (ss * ss * 0.12)) + 0.85 * (exp(-abs(sd.y) / (ss * 0.1) - abs(sd.x) / ss) + exp(-abs(sd.x) / (ss * 0.1) - abs(sd.y) / ss));
  sampledDiffuseColor.rgb += uSparkCol * uSparkI * star;
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
type PxRect = { x: number; y: number; w: number; h: number };
const pxRect = (r: PxRect, W: number, H: number) => new THREE.Vector4(r.x / W, r.y / H, (r.x + r.w) / W, (r.y + r.h) / H);
const pxFrac = (r: PxRect, W: number, H: number): Rect => ({ u0: r.x / W, v0: r.y / H, u1: (r.x + r.w) / W, v1: (r.y + r.h) / H });

/** Crops a layer picture to `rect` (fractions of the picture, null = all of it), at `scale`, into a canvas texture. */
async function loadLayer(file: string, rect: Rect | null, scale: number, srgb: boolean, wrapU = false): Promise<THREE.Texture> {
  const url = new URL(`../assets/skyline/${file}`, import.meta.url).href;
  const img = new Image(); img.decoding = 'async'; img.src = url; await img.decode();
  const r = rect ?? { u0: 0, v0: 0, u1: 1, v1: 1 }, sx = Math.floor(r.u0 * img.naturalWidth), sy = Math.floor(r.v0 * img.naturalHeight);
  const sw = Math.max(1, Math.ceil(r.u1 * img.naturalWidth) - sx), sh = Math.max(1, Math.ceil(r.v1 * img.naturalHeight) - sy);
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(sw * scale)); c.height = Math.max(1, Math.round(sh * scale));
  const g = c.getContext('2d')!; g.imageSmoothingQuality = 'high'; g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 1;
  if (wrapU) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; }   // an equirectangular surface: repeats across, clamps up and down
  return t;
}

/** Builds the layers (and, unless it is off, the motion) for a plate picture of `imgW` x `imgH`; null when the row is off. `flat` = the plate already has them baked in (?skyflat): draw none. */
export function createSkyAnim(search: string, imgW: number, imgH: number, row: AnimRow = SKY_ANIM, flat = false): SkyAnim | null {
  if (!row.on || flat) return null;
  const moving = animOn(search, row) && !(row.respectReducedMotion && reducedMotion());
  let t = 0, disposed = false;
  const g = row.globe, p = row.planet, ey = row.eyes, dr = row.drool, ds = dr.shimmer, dd = dr.drop, sph = p.sphere, l = row.glisten, sk = row.sparkle, cg = row.crownGlow, br = row.breathing, sp = g.sprite, dummy = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat); dummy.needsUpdate = true;
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
    uBreathRect: { value: rectVec(br.rect) }, uBreathFeather: { value: new THREE.Vector2(br.featherFraction * (br.rect.u1 - br.rect.u0), br.featherFraction * (br.rect.v1 - br.rect.v0)) }, uBreathLift: { value: 0 }, uBob: { value: 0 },
    uSparkPos: { value: new THREE.Vector2() }, uSparkI: { value: 0 }, uSparkSize: { value: sk.size }, uSparkCol: { value: new THREE.Color(sk.color).multiplyScalar(sk.strength) },
    uEyeTexA: { value: dummy as THREE.Texture }, uEyeTexB: { value: dummy as THREE.Texture }, uDroolTex: { value: dummy as THREE.Texture }, uDropTexA: { value: dummy as THREE.Texture }, uDropTexB: { value: dummy as THREE.Texture }, uSurfTex: { value: dummy as THREE.Texture }, uShadeTex: { value: dummy as THREE.Texture },
    uEyeRect: { value: pxRect(ey.rectPx, imgW, imgH) }, uEyeFeather: { value: new THREE.Vector2(Math.max(1e-4, ey.featherPx / ey.rectPx.w), Math.max(1e-4, ey.featherPx / ey.rectPx.h)) }, uEyeAmt: { value: 0 }, uEyeKind: { value: 1 },
    uDroolRect: { value: pxRect(ds.rectPx, imgW, imgH) }, uDroolTexel: { value: new THREE.Vector2(1, 1) }, uDroolCol: { value: new THREE.Color(ds.color).multiplyScalar(ds.strength) }, uDroolI: { value: 0 }, uDroolPhase: { value: 0 }, uDroolWaves: { value: ds.waves }, uDroolSpread: { value: ds.spreadTexels },
    uDropRect: { value: new THREE.Vector4() }, uDropA: { value: 0 }, uDropUse: { value: 0 },
    uSphereOn: { value: 0 }, uPlanetTurn: { value: planetTurn(sph.startTurns, sph.secondsPerTurn, 0) }, uShadeDisc: { value: sph.shading.discFraction }, uShadeStr: { value: sph.shading.strength },
    uCrownC: { value: new THREE.Vector2(cg.centre.u, cg.centre.v) }, uCrownR: { value: new THREE.Vector2(cg.radiusU, cg.radiusV) }, uCrownI: { value: 0 }, uCrownCol: { value: new THREE.Color(cg.color).multiplyScalar(cg.strength) },
  };
  const sparkler = sk.on ? createSparkler(sk) : null;
  const jobs: Promise<void>[] = [];
  const grab = (on: boolean, file: string, rect: Rect | null, scale: number, srgb: boolean, set: (tx: THREE.Texture) => void, wrapU = false) => {
    if (!on || !file || typeof document === 'undefined' || typeof Image === 'undefined') return;   // a layer that is off is not even fetched
    jobs.push(loadLayer(file, rect, scale, srgb, wrapU).then((tx) => { if (disposed) { tx.dispose(); return; } own.push(tx); set(tx); }).catch(() => {}));   // a missing layer: that layer is skipped, the plate carries on
  };
  grab(p.on, p.file, p.rect, 1, true, (tx) => { u.uPlanetTex.value = tx; u.uPlanetOn.value = 1; });
  grab(g.on, g.file, g.rect, 1, true, (tx) => { u.uGlobeTex.value = tx; u.uGlobeOn.value = 1; });
  grab(sp.on && moving, sp.file, null, sp.loadScale, true, (tx) => { u.uSpriteTex.value = tx; u.uSpriteOn.value = 1; });
  grab(l.on && moving, l.file, l.rect, 1, false, (tx) => { u.uMaskTex.value = tx; u.uGlisOn.value = 1; const im = tx.image as { width: number; height: number }; u.uMaskTexel.value.set(1 / im.width, 1 / im.height); });
  // Pack 2. The turning planet is part of the picture (the plate waits for it); the eyes and the droplet only show later, so they load after the plate shows and never hold it.
  if (sph.on) {
    let got = 0; const both = () => { if (++got === 2) u.uSphereOn.value = 1; };
    grab(p.on, sph.file, null, sph.loadScale, true, (tx) => { u.uSurfTex.value = tx; both(); }, true);
    grab(p.on, sph.shading.file, null, 1, true, (tx) => { u.uShadeTex.value = tx; both(); });
  }
  const grabLate = (on: boolean, file: string, rect: Rect | null, srgb: boolean, set: (tx: THREE.Texture) => void) => {
    if (!on || !moving || typeof document === 'undefined' || typeof Image === 'undefined') return;
    void loadLayer(file, rect, 1, srgb).then((tx) => { if (disposed) { tx.dispose(); return; } own.push(tx); set(tx); }).catch(() => {});
  };
  const spriteH = { a: 0, b: 0 }, spriteW = { a: 0, b: 0 };
  const imgOf = (tx: THREE.Texture) => tx.image as { width: number; height: number };
  void Promise.resolve().then(() => {
    grabLate(ey.on && ey.blink.on, ey.blink.file, null, true, (tx) => { u.uEyeTexA.value = tx; });
    grabLate(ey.on && ey.wink.on, ey.wink.file, null, true, (tx) => { u.uEyeTexB.value = tx; });
    grabLate(dr.on && ds.on, ds.file, pxFrac(ds.rectPx, imgW, imgH), false, (tx) => { u.uDroolTex.value = tx; u.uDroolI.value = 1; u.uDroolTexel.value.set(1 / imgOf(tx).width, 1 / imgOf(tx).height); });
    grabLate(dr.on && dd.on, dd.file, null, true, (tx) => { u.uDropTexA.value = tx; spriteW.a = imgOf(tx).width; spriteH.a = imgOf(tx).height; });
    grabLate(dr.on && dd.on, dd.stretchedFile, null, true, (tx) => { u.uDropTexB.value = tx; spriteW.b = imgOf(tx).width; spriteH.b = imgOf(tx).height; });
  });
  const blinker = ey.on && moving ? createBlinker(ey) : null, drooler = dr.on && dd.on && moving ? createDrooler(dd) : null;
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
    u.uBreathLift.value = br.on ? sineOffsetPx(br.amplitudePx, br.periodSeconds, br.phase, t) / imgH : 0;   // plate pixels -> a fraction of the picture's height
    u.uBob.value = g.bob.on ? sineOffsetPx(g.bob.amplitudePx, g.bob.periodSeconds, g.bob.phase, t) / imgH : 0;
    u.uCrownI.value = cg.on ? 0.5 + 0.5 * Math.sin(TAU * t / cg.pulseSeconds) : 0;
    u.uPlanetTurn.value = planetTurn(sph.startTurns, sph.secondsPerTurn, t);
    if (blinker) { const b = blinker.at(t); u.uEyeKind.value = b.kind; u.uEyeAmt.value = b.amount; }
    u.uDroolPhase.value = t / ds.periodSeconds;
    if (drooler) {
      const d = drooler.at(t), w = d.stretch ? spriteW.b : spriteW.a, h = d.stretch ? spriteH.b : spriteH.a;
      u.uDropA.value = w && h ? d.alpha : 0; u.uDropUse.value = d.stretch;
      const x0 = (dd.spawnPx.x - dd.anchorPx.x) / imgW, y0 = (dd.spawnPx.y - dd.anchorPx.y + d.y) / imgH; u.uDropRect.value.set(x0, y0, x0 + w / imgW, y0 + h / imgH);
    }
    if (sparkler) { const s = sparkler.at(t), a = sk.anchors[s.anchor]; u.uSparkPos.value.set(a.u, a.v); u.uSparkSize.value = sk.size * a.scale; u.uSparkI.value = s.intensity; }
  };
  tick();
  return {
    apply(m) {
      m.onBeforeCompile = (s) => {
        Object.assign(s.uniforms, u);
        s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\n${HEAD}`).replace('#include <map_fragment>', BODY);
      };
      m.customProgramCacheKey = () => 'skyanim4'; m.needsUpdate = true;
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
