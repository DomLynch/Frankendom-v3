import * as THREE from 'three';
import type { CombatEvent, Fighter } from './duel.ts';
import type { OpponentId } from '../roster.ts';
import { advanceCast, shadowPhase, LAND_AT, type Cast } from './special-timing.ts';
import { crowdWave } from '../arena.ts';
import { clamp01, hash, noise, smooth } from './fx-math.ts';

// The Executioner's boss specials, rank 8, 9 and 10 (Executioner lane; Dom's picks via Strategy 2026-10-01). PREVIEW ONLY, behind ?special=<kind>, on the
// seam of Hades' Shadow (special-timing.ts: the one 120-tick wind-up, SpecialStarted / Landed / Fizzled). Presentation only: it reads the sim's special
// events and each side's feet, never the sim, the rig root or Math.random (every "random" is an index hash seeded by the cast's start tick).
// No props, no lights, no glow: painted, torn strokes of the arena's own sand, dust and shade, semi-transparent where they are air.
//   arawn    (L8,  level 36) Baying Circle: pale dust trails run low along the sand from points on the rim and converge on the target; the last arrives on the landing.
//   thanatos (L9,  level 41) Long Shadow:    the light dims over the target only and his shadow stretches across the sand to reach them; nothing flies.
//   reaper   (L10, level 46) Harvest Sweep:  one huge scythe crescent sweeps the frame, the sand is cut in a swath behind it, the crowd leans in a wave.
export type BossKind = 'arawn' | 'thanatos' | 'reaper';
export const BOSS_KINDS: readonly BossKind[] = ['arawn', 'thanatos', 'reaper'];
export const BUILD = 30;   // ticks of visible build-up before the landing (0.5 s; Dom: a 1-2 s build-up was too slow on Red Wind)

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const fbm = (x: number, y: number, seed: number) => noise(x, y, seed) * 0.55 + noise(x * 2.1, y * 2.1, seed + 7) * 0.3 + noise(x * 4.3, y * 4.3, seed + 13) * 0.15;

// Where each trail of the Baying Circle is, in fractions of the build-up: it leaves the rim at `from` and reaches the target at `to`. Uneven on purpose;
// exactly one trail (the last) arrives at 1, the landing tick, and none sets off before the build-up starts.
export function trailSchedule(count: number, seed: number) {
  const last = Math.floor(hash(seed, 7) * count);
  return Array.from({ length: count }, (_, i) => {
    const to = i === last ? 1 : 0.58 + 0.34 * hash(i + seed * 3, 8);
    return { from: Math.max(0, to - (i === last ? 0.8 : 0.5 + 0.3 * hash(i + seed * 3, 9))), to };
  });
}
// How far the crowd leans at `u` (0 = where the sweep began, 1 = where it ends) when the scythe's front is at `front`: a bump riding the front, and a
// weaker lean left in its wake. Radians forward; nothing ahead of the front.
export const waveLean = (u: number, front: number) => 0.2 * (Math.exp(-(((u - front) / 0.16) ** 2)) + (u < front && u > -0.1 ? 0.3 * (1 - clamp01(front - u)) : 0));

// A painted stroke: x across its width, y along its length (the head soft at y = 0, the tail torn away). Alpha is a frayed band streaked along its length;
// colour runs from the dark core of the stroke to its light rim. `wide`: the stroke fills its sprite.
type Look = { core: THREE.Color; edge: THREE.Color; dim: boolean };
function paintSheet(seed: number, look: Look, wide = false) {
  const w = 64, h = 192, px = new Uint8Array(w * h * 4);
  const width = wide ? 1.15 + 0.25 * hash(seed, 1) : 0.4 + 0.35 * hash(seed, 1), centre = 0.5 + 0.12 * (hash(seed, 2) - 0.5), wobble = 0.1 + 0.18 * hash(seed, 3);
  for (let y = 0; y < h; y++) {
    const l = y / (h - 1), c = centre + (fbm(l * 3, seed, seed) - 0.5) * wobble * 2, half = width * (0.5 + 0.35 * fbm(l * 4, seed + 5, seed)) * (1 - 0.35 * l);
    for (let x = 0; x < w; x++) {
      const a = x / (w - 1), d = Math.abs(a - c) / half, frayed = d + (noise(a * 18, l * 26, seed + 3) - 0.5) * 0.7;
      const streak = 0.3 + 0.7 * smooth(fbm(a * 22, l * 2.4, seed + 9) * 1.5 - 0.15), head = smooth(l / 0.1), tail = smooth((1 - l) * 2.4 - 0.55 * noise(a * 9, l * 9, seed + 11));
      const alpha = Math.min(1, smooth((1 - frayed) * 2.2) * streak * head * tail * 1.15), dark = Math.min(1, smooth(1 - d) * (0.55 + 0.45 * streak) * 1.3);
      px.set([lerp(look.edge.r, look.core.r, dark) * 255, lerp(look.edge.g, look.core.g, dark) * 255, lerp(look.edge.b, look.core.b, dark) * 255, alpha * 255].map((v) => Math.min(255, v)), (y * w + x) * 4);
    }
  }
  const map = new THREE.DataTexture(px, w, h); map.magFilter = map.minFilter = THREE.LinearFilter; map.needsUpdate = true; return map;
}
// A soft torn pool (no straight edge): alpha leaves from the centre, bitten by noise; black, so the tint is the material's.
function poolMap(seed: number) {
  const n = 64, px = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x - 31.5) / 31.5, v = (y - 31.5) / 31.5, r = Math.hypot(u, v) + (fbm(u * 2.2 + 4, v * 2.2 + 4, seed) - 0.5) * 0.8;
    px.set([255, 255, 255, 255 * smooth((1 - r) * 1.8) * (0.7 + 0.3 * fbm(x * 0.2, y * 0.2, seed + 3))], (y * n + x) * 4);
  }
  const map = new THREE.DataTexture(px, n, n); map.magFilter = map.minFilter = THREE.LinearFilter; map.needsUpdate = true; return map;
}
// A cast shadow: a solid dark shape with a torn, wandering edge and no streaking, its head (the end that reaches the target) soft, the end at his feet ragged.
function shadowMap(seed: number, look: Look) {
  const w = 48, h = 128, px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = y / (h - 1), u = (x / (w - 1) - 0.5) * 2, edge = Math.abs(u) + (fbm(l * 3 + 2, u * 2.5 + 7, seed) - 0.5) * 0.6;
    const alpha = smooth((1 - edge) * 2.4) * smooth(l / 0.3) * smooth((1 - l) * 3.5 - 0.4 * fbm(x * 0.15, y * 0.1, seed + 5)) * (0.82 + 0.18 * fbm(x * 0.3, y * 0.2, seed + 9));
    px.set([look.core.r * 255, look.core.g * 255, look.core.b * 255, Math.min(1, alpha) * 255].map((v) => Math.min(255, v)), (y * w + x) * 4);
  }
  const map = new THREE.DataTexture(px, w, h); map.magFilter = map.minFilter = THREE.LinearFilter; map.needsUpdate = true; return map;
}
function softDot() {
  const n = 16, px = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) px.set([255, 255, 255, 255 * smooth(1 - Math.hypot(x - 7.5, y - 7.5) / 8)], (y * n + x) * 4);
  const map = new THREE.DataTexture(px, n, n); map.needsUpdate = true; return map;
}
// A grid surface over (along 0..1, across 0..1): UV x across, y along, matching paintSheet.
type P3 = [number, number, number];
function surface(fn: (l: number, a: number) => P3, nl = 14, na = 4) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= nl; i++) for (let j = 0; j <= na; j++) { pos.push(...fn(i / nl, j / na)); uv.push(j / na, i / nl); }
  for (let i = 0; i < nl; i++) for (let j = 0; j < na; j++) { const k = i * (na + 1) + j; idx.push(k, k + 1, k + na + 1, k + 1, k + na + 2, k + na + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}

// The colours (linear working space; the Night Pit is the arena with exposure above 1.5, where everything lifts so the unlit strokes hold on dark clay).
// Day sand is pale: dust trails go lighter-than-sand through a darker core; the pit's clay is dark: they go pale on it.
export const bossLook = (kind: BossKind, exposure: number): Look => {
  const dim = exposure > 1.5, c = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
  if (kind === 'arawn') return dim ? { core: c(0.05, 0.034, 0.026), edge: c(0.11, 0.08, 0.06), dim } : { core: c(0.1, 0.055, 0.04), edge: c(0.2, 0.12, 0.08), dim };
  if (kind === 'thanatos') return dim ? { core: c(0.003, 0.002, 0.002), edge: c(0.012, 0.009, 0.007), dim } : { core: c(0.004, 0.003, 0.003), edge: c(0.03, 0.024, 0.02), dim };
  return dim ? { core: c(0.04, 0.028, 0.022), edge: c(0.05, 0.036, 0.028), dim } : { core: c(0.09, 0.055, 0.04), edge: c(0.2, 0.13, 0.09), dim };   // the scythe: dried-blood brown by day (darker than the sand), dark clay-brown by night too (never pale over a fighter)
};
const cutLook = (dim: boolean): Look => dim ? { core: new THREE.Color(0.02, 0.011, 0.007), edge: new THREE.Color(0.04, 0.022, 0.013), dim } : { core: new THREE.Color(0.12, 0.065, 0.03), edge: new THREE.Color(0.5, 0.35, 0.19), dim };   // the cut sand: dark earth, pale dry rim

type Piece = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial };
// Which cast gets these arts: the Executioner's class skill, the Reaping Blow. Passed to advanceCast as its own test, so the shared timeline never sees it.
export const isExecutionerCast = (opponent: OpponentId, actor: number, move?: string) => opponent === 'executioner' && actor === 1 && move === 'skill_reaping';

// Class B: a broken, caster-local furrow. Reuses painted sheets only; no boss
// crowd, lighting or arena resources. The current equipped pose remains native.
export function createBlackFurrow(scene: THREE.Scene, opponent: OpponentId, exposure: number) {
  const root = new THREE.Group(); root.name = 'black furrow'; root.visible = false; scene.add(root);
  const color = exposure > 1.5 ? new THREE.Color(0.006, 0.004, 0.003) : new THREE.Color(0.012, 0.007, 0.005);
  const maps = [3, 11, 23].map(seed => {
    const map = poolMap(seed), { width, height } = map.image, pixels = map.image.data as Uint8Array;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const a = (y * width + x) * 4 + 3, edge = smooth(Math.min(x, y, width - 1 - x, height - 1 - y) / 4);
      pixels[a] = Math.min(255, pixels[a] * 3) * edge;
    }
    return map;
  });
  const geometry = surface((l, a) => [l - 0.5, 0, (a - 0.5) * (0.65 + 0.25 * Math.sin(l * Math.PI)) + 0.12 * Math.sin(l * 5)], 16, 4);
  const fragments = [{ x: -0.65, z: 0.03, length: 0.95, width: 0.48 }, { x: 0, z: -0.03, length: 0.9, width: 0.4 }, { x: 0.55, z: 0.04, length: 0.56, width: 0.27 }];
  const strokes = fragments.map((_, i) => {
    const material = new THREE.MeshBasicMaterial({ map: maps[i], color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: true });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = 'furrow stroke'; mesh.visible = false; root.add(mesh); return mesh;
  });
  let cast: Cast | null = null;
  const hide = () => { root.visible = false; for (const stroke of strokes) { stroke.visible = false; stroke.material.opacity = 0; } };
  return {
    render(_dt: number, events: readonly CombatEvent[], fighters: readonly [Fighter, Fighter], tick: number, feet: readonly [THREE.Vector3 | null, THREE.Vector3 | null], yielding: boolean) {
      if (yielding) { cast = null; hide(); return; }
      cast = advanceCast(cast, events, fighters, tick, opponent, false, isExecutionerCast);
      const caster = feet[1], target = feet[0];
      if (!cast || !caster || !target) { hide(); return; }
      const phase = shadowPhase(cast, tick);
      const build = smooth(((cast.fizzled ?? tick) - cast.start) / (LAND_AT - 12)), fade = phase.phase === 'dissolve' || phase.phase === 'recover' ? 1 - smooth(phase.k) : 1;
      const shear = cast.landed === null ? 0 : smooth((tick - cast.landed) / 14);
      root.position.copy(caster); root.rotation.y = Math.atan2(target.x - caster.x, target.z - caster.z); root.visible = true;
      for (let i = 0; i < strokes.length; i++) {
        const stroke = strokes[i], fragment = fragments[i], end = i === strokes.length - 1;
        stroke.position.set(fragment.x * build + (end ? shear * 0.25 : 0), 0.025, 0.85 + fragment.z);
        stroke.rotation.y = end ? shear * 0.48 : 0;
        stroke.scale.set(fragment.length * build, 1, fragment.width); stroke.material.opacity = build * fade * 0.95;
        stroke.visible = stroke.material.opacity > 0.001;
      }
    },
    clear() { cast = null; hide(); },
  };
}
// Preview class A: a compact hooked scuff at the caster's heel; no boss sweep.
export function createHeelReap(scene: THREE.Scene, opponent: OpponentId, exposure: number) {
  const root = new THREE.Group(); root.name = 'heel reap'; root.visible = false; scene.add(root);
  const geometry = surface((l, a) => { const angle = -0.9 + l * 2.4, radius = 0.48 + (a - 0.5) * 0.31; return [Math.cos(angle) * radius - 0.4, 0.026, Math.sin(angle) * radius + 0.3]; }, 24, 3);
  const map = paintSheet(41, cutLook(exposure > 1.5), true), pixels = map.image.data as Uint8Array;
  for (let a = 3; a < pixels.length; a += 4) pixels[a] = Math.min(255, pixels[a] * 3);
  const material = new THREE.MeshBasicMaterial({ map, color: exposure > 1.5 ? new THREE.Color(0.12, 0.08, 0.05) : new THREE.Color(0.035, 0.024, 0.015), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const hook = new THREE.Mesh(geometry, material); hook.visible = false; root.add(hook);
  const dustGeometry = new THREE.PlaneGeometry(1, 1); dustGeometry.rotateX(-Math.PI / 2);
  const dustMaterial = new THREE.MeshBasicMaterial({ map: poolMap(19), color: exposure > 1.5 ? '#24150e' : '#392416', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const dust = new THREE.Mesh(dustGeometry, dustMaterial); dust.visible = false; root.add(dust);
  let cast: Cast | null = null;
  const hide = () => { root.visible = hook.visible = dust.visible = false; material.opacity = dustMaterial.opacity = 0; };
  return {
    render(_dt: number, events: readonly CombatEvent[], fighters: readonly [Fighter, Fighter], tick: number, feet: readonly [THREE.Vector3 | null, THREE.Vector3 | null], yielding: boolean) {
      if (yielding) { cast = null; hide(); return; }
      cast = advanceCast(cast, events, fighters, tick, opponent, false, isExecutionerCast);
      const caster = feet[1], target = feet[0]; if (!cast || !caster || !target) { hide(); return; }
      const phase = shadowPhase(cast, tick), build = smooth(((cast.fizzled ?? tick) - cast.start) / 80), flick = cast.landed === null ? 0 : smooth((tick - cast.landed) / 10);
      const fade = phase.phase === 'recover' || phase.phase === 'dissolve' ? 1 - smooth(phase.k) : 1;
      root.position.copy(caster); root.rotation.y = Math.atan2(target.x - caster.x, target.z - caster.z); root.visible = true;
      const sideX = -Math.cos(root.rotation.y), sideZ = -Math.sin(root.rotation.y);
      hook.position.set(sideX * 0.65, 0, sideZ * 0.65); hook.scale.set(build, 1, build); hook.rotation.y = -0.25 * flick; material.opacity = build * fade * 0.94; hook.visible = material.opacity > 0.001;
      dust.position.set(sideX * (0.72 + flick * 0.18), 0.03, sideZ * (0.72 + flick * 0.18) + 0.25 + flick * 0.18); dust.scale.set(0.23 + flick * 0.2, 1, 0.3 + flick * 0.15);
      dustMaterial.opacity = flick * fade * 0.85; dust.visible = dustMaterial.opacity > 0.001;
    },
    clear() { cast = null; hide(); },
  };
}

const TRAILS = 11, GRIT = 160;
const RIM_R = 4.4;   // metres from the fighters' midpoint: where the trails start. The fight camera sees about this far, so they come in from the frame's edge; the arena's wall is further than the camera shows

export type ExecutionerSpecial = ReturnType<typeof createExecutionerSpecial>;
export function createExecutionerSpecial(scene: THREE.Scene, opponent: OpponentId, kind: BossKind, look: Look) {
  const root = new THREE.Group(); root.name = 'special fx'; root.visible = false; scene.add(root);
  const add = (g: THREE.BufferGeometry, map: THREE.Texture, name: string): Piece => {
    const mat = new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: true });
    const mesh = new THREE.Mesh(g, mat); mesh.name = name; mesh.frustumCulled = false; mesh.visible = false; root.add(mesh); return { mesh, mat };
  };
  const sheet = (seed: number, l: Look = look, wide = false) => paintSheet(seed, l, wide);
  // A strip lying on the sand along local +z (head, the soft end of the stroke, at z = 1), unit length, `wid` metres across, drifting sideways by `bend`.
  const strip = (i: number, seed: number, wid: number, bend: number, rise = 0.05) => surface((l, a) => { const z = 1 - l; return [(a - 0.5) * wid * (1 - 0.3 * z) + bend * Math.sin(z * 3.1) * z, 0.025 + rise * Math.sin(a * Math.PI) * (0.4 + 0.6 * hash(i + seed, 5)), z]; }, 16, 4);
  const gritPos = new Float32Array(GRIT * 3).fill(-9), gritGeo = new THREE.BufferGeometry();
  gritGeo.setAttribute('position', new THREE.BufferAttribute(gritPos, 3).setUsage(THREE.DynamicDrawUsage));
  const gritMat = new THREE.PointsMaterial({ size: kind === 'arawn' ? 0.07 : 0.13, sizeAttenuation: true, map: softDot(), color: (kind === 'reaper' ? cutLook(look.dim).edge : look.edge).clone().multiplyScalar(kind === 'arawn' ? 0.8 : 0.9), transparent: true, opacity: 0, depthWrite: false, fog: true });
  const gritPoints = new THREE.Points(gritGeo, gritMat); gritPoints.name = 'boss grit'; gritPoints.frustumCulled = false; root.add(gritPoints);
  const setPiece = (p: Piece, opacity: number, cap: number) => { p.mat.opacity = clamp01(opacity) * cap; p.mesh.visible = opacity > 0.01; };

  const dim: THREE.Sprite[] = [], puffs: THREE.Sprite[] = [];
  const sprite = (size: number, seed: number, color: string, order = 0) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: poolMap(seed), color, transparent: true, opacity: 0, depthWrite: false, depthTest: order === 0, fog: true })); s.renderOrder = order; s.scale.setScalar(size); s.visible = false; root.add(s); return s; };
  if (kind === 'arawn') for (let j = 0; j < 8; j++) puffs.push(sprite(0.5, j * 9 + 2, look.dim ? '#2c2219' : '#5a4a38'));   // the low torn puff where the trails meet
  // arawn: thin pale strokes, one per rim point
  const trailMaps = Array.from({ length: 6 }, (_, s) => sheet(s * 5 + 2));
  // thanatos: his shadow and the pool of shade at the target; the body-height dimming is soft sprites over the target
  // reaper: the crescent, and three strokes of cut sand lying across the lane
  const cutMaps = Array.from({ length: 3 }, (_, s) => paintSheet(s * 7 + 31, cutLook(look.dim), true));
  const crescentGeo = (seed: number) => {   // a huge vertical crescent facing the camera: an arch with its tips drawn back, thick in the middle and torn thin at the tips
    const half = 0.95, R = 3.7;
    return surface((l, a) => {
      const f = (l - 0.5) * 2 * half, thick = 0.12 + 0.62 * Math.cos((f / half) * Math.PI * 0.5) ** 0.8, tx = Math.cos(f), ty = -Math.sin(f) * 0.55, tl = Math.hypot(tx, ty), off = (a - 0.5) * thick;
      return [R * Math.sin(f) - (ty / tl) * off, 0.7 + 1.2 * (Math.cos(f) - Math.cos(half)) * R * 0.34 + (tx / tl) * off, f * f * 0.9 + Math.sin(f * 5 + seed) * 0.05];
    }, 28, 5);
  };
  let trails: Piece[] = [], shadow: Piece | null = null, pool: Piece | null = null, crescent: Piece | null = null, cuts: Piece[] = [];
  if (kind === 'arawn') trails = Array.from({ length: TRAILS }, (_, i) => add(strip(i, 0, 0.3, 0), trailMaps[i % trailMaps.length], 'trail'));
  if (kind === 'thanatos') {
    const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0.02, 0);
    pool = add(g, poolMap(5), 'shade pool'); pool.mat.color.set('#0a0807');
    shadow = add(surface((l, a) => { const z = 1 - l, w = 0.95 * (1 - 0.45 * z) + 0.28 * smooth((z - 0.8) / 0.2); return [(a - 0.5) * w + Math.sin(z * 6) * 0.05 * z, 0.03, z]; }, 20, 5), shadowMap(41, look), 'long shadow');
    for (const s of [2.7, 2.2, 1.8]) dim.push(sprite(s, Math.round(s * 10), '#0b0908', 7));
  }
  if (kind === 'reaper') {
    crescent = add(crescentGeo(0), sheet(17, look, true), 'crescent');
    cuts = [0, 1, 2].map((i) => add(strip(i, 40, 1.3 - 0.35 * i, 0.15, 0.1), cutMaps[i], 'swath'));
  }

  const caster = new THREE.Vector3(), target = new THREE.Vector3(), dir = new THREE.Vector3(), side = new THREE.Vector3();
  const sweep = { from: 0, to: 1, front: 0, live: false, a0: 0, a1: 1 };   // the Harvest Sweep, for the crowd: angles round the arena of where it starts and ends
  let cast: Cast | null = null, clock = 0, lastTick = -1, have = false, schedule = trailSchedule(TRAILS, 0);
  const hide = () => { root.visible = false; sweep.live = false; if (kind === 'reaper') crowdWave.lean = null; for (const p of [...trails, ...cuts, shadow, pool, crescent]) if (p) { p.mat.opacity = 0; p.mesh.visible = false; } dim.forEach((s) => (s.visible = false)); puffs.forEach((s) => (s.visible = false)); gritMat.opacity = 0; };
  const putGrit = (fn: (i: number, out: P3) => void, opacity: number) => {
    const o: P3 = [0, 0, 0];
    for (let i = 0; i < GRIT; i++) { fn(i, o); gritPos[i * 3] = o[0]; gritPos[i * 3 + 1] = o[1]; gritPos[i * 3 + 2] = o[2]; }
    (gritGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true; gritMat.opacity = clamp01(opacity);
  };
  const angleOf = (x: number, z: number) => Math.atan2(z, x);
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

  // The Harvest Sweep's lean for the crowd (arena.ts crowdWave): the angle round the pit -> radians forward. Zero when idle; only the Reaper registers it.
  const lean = (angle: number) => {
    if (!sweep.live) return 0;
    const u = wrap(angle - sweep.a0) / (wrap(sweep.a1 - sweep.a0) || 1);
    return u < -0.1 || u > 1.1 ? 0 : waveLean(u, sweep.front);
  };

  return {
    // After the poses are final: `feet` each side's feet on the sand in world space (null while a rig loads), `yielding` true while a finisher plays.
    render(dt: number, events: readonly CombatEvent[], fighters: readonly [Fighter, Fighter], tick: number, feet: readonly [THREE.Vector3 | null, THREE.Vector3 | null], yielding: boolean) {
      clock = tick !== lastTick ? tick : Math.min(tick + 1, clock + dt * 60); lastTick = tick;
      const before = cast;
      cast = advanceCast(cast, events, fighters, tick, opponent, yielding, isExecutionerCast);
      if (!before && cast) {   // a new set of trails, a new crescent, for every cast
        schedule = trailSchedule(TRAILS, cast.start);
        trails.forEach((t, i) => { t.mesh.geometry.dispose(); t.mesh.geometry = strip(i, cast!.start, 0.3 + 0.25 * hash(i + cast!.start, 3), (hash(i + cast!.start, 4) - 0.5) * 0.6); });
        if (crescent) { crescent.mesh.geometry.dispose(); crescent.mesh.geometry = crescentGeo(cast.start % 97); }
      }
      const a = cast ? feet[cast.actor] : null, b = cast ? feet[1 - cast.actor] : null;
      if (a && b) { caster.copy(a); target.copy(b); have = true; }
      if (!cast || !have) { hide(); return; }
      root.visible = true;
      const p = shadowPhase(cast, clock), seed = cast.start;
      const shown = p.phase === 'dissolve' ? shadowPhase({ ...cast, fizzled: null }, cast.fizzled!) : p, fade = 1 - (p.phase === 'dissolve' ? smooth(p.k) : 0);
      const rel = p.phase === 'recover' ? p.age : -1, age = rel >= 0 ? LAND_AT + rel : shown.age;   // ticks since the landing, and since the cast began
      const k = clamp01((age - (LAND_AT - BUILD)) / BUILD), life = (rel >= 0 ? 1 - smooth((rel - 12) / 32) : 1) * fade;   // build-up 0..1; the aftermath thins out
      dir.set(target.x - caster.x, 0, target.z - caster.z); const gap = Math.max(0.9, dir.length()); dir.normalize(); side.set(dir.z, 0, -dir.x);
      const h = (i: number, salt: number) => hash(i + seed * 5, salt);

      if (kind === 'arawn') {
        const turn = h(0, 61), mx = (caster.x + target.x) / 2, mz = (caster.z + target.z) / 2;
        const rim = (i: number) => { const ang = turn + ((i + 0.5 * (h(i, 62) - 0.5)) / TRAILS) * Math.PI * 2, r = RIM_R + 1.3 * h(i, 63); return [mx + Math.cos(ang) * r, mz + Math.sin(ang) * r] as const; };
        const headAt = (i: number, D: number) => { const { from, to } = schedule[i], run = clamp01((k - from) / Math.max(0.05, to - from)); return { run, head: (run * run * 0.5 + run * 0.5) * D, since: Math.max(0, (k - to) * BUILD) + Math.max(0, rel) }; };
        trails.forEach((t, i) => {   // from a point on the rim (uneven spacing, uneven distance) straight at the target's feet; the head runs ahead of a tail of dust, and a trail thins away once it has arrived
          const [sx, sz] = rim(i), ex = target.x + (h(i, 64) - 0.5) * 0.5, ez = target.z + (h(i, 65) - 0.5) * 0.5, D = Math.hypot(ex - sx, ez - sz), tail = 1.2 + 1.2 * h(i, 66);
          const { run, head, since } = headAt(i, D), start = lerp(Math.max(0, head - tail), D, smooth(since / 8)), len = Math.max(0.01, (run >= 1 ? D : head) - start);
          t.mesh.position.set(sx + ((ex - sx) / D) * start, 0, sz + ((ez - sz) / D) * start); t.mesh.rotation.y = Math.atan2(ex - sx, ez - sz); t.mesh.scale.set(1, 1, len);
          setPiece(t, run > 0 ? (0.75 + 0.25 * h(i, 67)) * (1 - smooth(since / 10)) * fade : 0, 0.85);
        });
        putGrit((i, o) => {   // a little dust thrown off each head, then one low puff where they meet
          const trail = i % TRAILS, [sx, sz] = rim(trail), D = Math.hypot(target.x - sx, target.z - sz), { run, head } = headAt(trail, D);
          if (rel >= 0) { o[0] = o[2] = 0; o[1] = -9; }
          else if (run > 0 && run < 1) { o[0] = sx + ((target.x - sx) / D) * (head - 0.15 * h(i, 71)) + (h(i, 72) - 0.5) * 0.3; o[1] = 0.04 + 0.22 * h(i, 73); o[2] = sz + ((target.z - sz) / D) * (head - 0.15 * h(i, 71)) + (h(i, 74) - 0.5) * 0.3; }
          else { o[0] = o[2] = 0; o[1] = -9; }
        }, (k > 0 && rel < 0 ? 0.8 : 0) * fade);
        puffs.forEach((q, j) => {   // the strike: a low torn puff of dust stands up round his feet, rolls out and settles
          const th = h(j, 68) * Math.PI * 2, grow = smooth(rel / 14), r = (0.1 + 0.45 * h(j, 69)) * (0.4 + 1.3 * grow);
          q.position.set(target.x + Math.cos(th) * r, target.y + 0.12 + 0.3 * grow * (0.5 + h(j, 70)), target.z + Math.sin(th) * r);
          q.scale.setScalar((0.5 + 0.5 * h(j, 71)) * (0.5 + 1.1 * grow)); q.visible = rel >= 0 && life > 0.02;
          (q.material as THREE.SpriteMaterial).opacity = 0.5 * smooth(rel / 4) * (1 - smooth((rel - 6) / 34)) * fade;
        });
      } else if (kind === 'thanatos') {
        const reach = smooth(k) * (rel >= 0 ? 1 - 0.5 * smooth((rel - 10) / 30) : 1), full = gap + 1.1;   // his shadow runs from his feet over the target's, then draws back
        shadow!.mesh.position.set(caster.x, 0, caster.z); shadow!.mesh.rotation.y = Math.atan2(dir.x, dir.z); shadow!.mesh.scale.set(1, 1, Math.max(0.01, reach * full));
        setPiece(shadow!, smooth(k * 1.4) * life, look.dim ? 0.85 : 0.8);
        pool!.mesh.position.set(target.x, 0, target.z); pool!.mesh.scale.set(3.6, 1, 3.6); setPiece(pool!, smooth((k - 0.2) / 0.8) * (rel >= 0 ? 1 - smooth((rel - 8) / 34) : 1) * fade, look.dim ? 0.9 : 0.62);
        dim.forEach((s, j) => {   // the light dims over the target: soft shade at body height over him only (never the caster), rising with the shadow
          s.position.set(target.x, target.y + 0.75 + 0.16 * j, target.z); s.visible = true;
          (s.material as THREE.SpriteMaterial).opacity = (look.dim ? 0.2 : 0.26) * smooth((k - 0.35) / 0.65) * (rel >= 0 ? 1 - smooth((rel - 8) / 34) : 1) * fade;
        });
        gritMat.opacity = 0;
      } else {
        const S0 = -7.4, S1 = 2.2, front = k < 1 ? lerp(S0, 0, k * k * 0.6 + k * 0.4) : lerp(0, S1, smooth(rel / 14)), live = rel >= 0 ? 1 - smooth((rel - 4) / 24) : smooth(k * 3);
        const centre = (s: number, depth: number, v: THREE.Vector3) => v.copy(target).addScaledVector(side, s).addScaledVector(dir, depth);
        const at = centre(front, -0.5, new THREE.Vector3());
        crescent!.mesh.position.set(at.x, 0, at.z); crescent!.mesh.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI; crescent!.mesh.scale.set(1, 1, 1);
        setPiece(crescent!, live * fade, look.dim ? 0.4 : 0.6);
        cuts.forEach((c, i) => {   // the sand cut behind it: three uneven strokes of dark earth lying across the lane, their heads trailing the blade
          const lag = 0.25 + 0.5 * h(i, 81), head = Math.max(S0, front - lag), from = centre(S0, (h(i, 82) - 0.5) * 0.9, new THREE.Vector3());
          c.mesh.position.set(from.x, 0, from.z); c.mesh.rotation.y = Math.atan2(side.x, side.z); c.mesh.scale.set(1, 1, Math.max(0.01, head - S0));
          setPiece(c, (k > 0.05 || rel >= 0 ? 1 : 0) * (rel >= 0 ? 1 - smooth((rel - 10) / 34) : 0.95) * fade, 0.9);
        });
        putGrit((i, o) => {   // grit lifted along the swath, thrown up behind the blade and falling back
          const at2 = lerp(S0, Math.max(S0 + 0.1, front - 0.3), h(i, 83)), since = Math.max(0, (front - at2) / 14), up = Math.max(0, (0.6 + 1.5 * h(i, 84)) * since * 2 - 4 * since * since * 2);
          const q = centre(at2, (h(i, 85) - 0.5) * 1.3, new THREE.Vector3()); o[0] = q.x; o[1] = k > 0.05 || rel >= 0 ? 0.04 + up : -9; o[2] = q.z;
        }, (k > 0.05 ? 0.8 : 0) * (rel >= 0 ? 1 - smooth((rel - 6) / 38) : 1) * fade);
        const wall = (s: number) => { const q = centre(s, 9, new THREE.Vector3()); return angleOf(q.x, q.z); };
        sweep.a0 = wall(S0); sweep.a1 = wall(S1); sweep.front = (front - S0) / (S1 - S0); sweep.live = live * fade > 0.02; crowdWave.lean = sweep.live ? lean : null;   // registered only while the sweep runs
      }
      if (kind !== 'reaper') sweep.live = false;
    },
    clear() { cast = null; have = false; hide(); },
  };
}
