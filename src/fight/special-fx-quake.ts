import * as THREE from 'three';
import type { CombatEvent, Fighter } from './duel.ts';
import type { OpponentId } from '../roster.ts';
import { advanceCast, castPhase, LAND_AT, RIPPLE, SLAM_AT, type Cast } from './special-timing.ts';
import { clamp01, hash, noise, smooth } from './fx-math.ts';

// Red Wind's painted-stroke helpers (Nightborn lane, special-fx-wind.ts on #1220), copied here so this preview stacks on #1120 alone, not on Red Wind.
// SandLook: what the strokes are painted with, a dark core and a pale rim, both linear working-space colours.
type SandLook = { core: THREE.Color; edge: THREE.Color; dim: boolean };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const fbm = (x: number, y: number, seed: number) => noise(x, y, seed) * 0.55 + noise(x * 2.1, y * 2.1, seed + 7) * 0.3 + noise(x * 4.3, y * 4.3, seed + 13) * 0.15;
function paintSheet(seed: number, look: SandLook, wide = false) {
  const w = 64, h = 192, px = new Uint8Array(w * h * 4), core = look.core, edge = look.edge;
  const width = wide ? 1.15 + 0.25 * hash(seed, 1) : 0.4 + 0.35 * hash(seed, 1), centre = 0.5 + 0.12 * (hash(seed, 2) - 0.5), wobble = 0.1 + 0.18 * hash(seed, 3);
  for (let y = 0; y < h; y++) {
    const l = y / (h - 1);
    const c = centre + (fbm(l * 3, seed, seed) - 0.5) * wobble * 2, half = width * (0.5 + 0.35 * fbm(l * 4, seed + 5, seed)) * (1 - 0.35 * l);
    for (let x = 0; x < w; x++) {
      const a = x / (w - 1), d = Math.abs(a - c) / half;   // 0 at the spine, 1 at the nominal edge
      const frayed = d + (noise(a * 18, l * 26, seed + 3) - 0.5) * 0.7;   // torn: the edge is pushed in and out by fine noise
      const body = smooth((1 - frayed) * 2.2);
      const streak = 0.3 + 0.7 * smooth(fbm(a * 22, l * 2.4, seed + 9) * 1.5 - 0.15);   // streaks along the stroke
      const head = smooth(l / 0.1), tail = smooth((1 - l) * 2.4 - 0.55 * noise(a * 9, l * 9, seed + 11));   // soft head, ragged tail
      const alpha = Math.min(1, body * streak * head * tail * 1.15);
      const dark = Math.min(1, smooth(1 - d) * (0.55 + 0.45 * streak) * 1.3), r = lerp(edge.r, core.r, dark), g = lerp(edge.g, core.g, dark), b = lerp(edge.b, core.b, dark);
      px.set([Math.min(255, r * 255), Math.min(255, g * 255), Math.min(255, b * 255), alpha * 255], (y * w + x) * 4);
    }
  }
  const map = new THREE.DataTexture(px, w, h); map.magFilter = map.minFilter = THREE.LinearFilter; map.needsUpdate = true;
  return map;
}
function softDot() {
  const n = 16, px = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const d = Math.hypot(x - 7.5, y - 7.5) / 8; px.set([255, 255, 255, 255 * smooth(1 - d)], (y * n + x) * 4); }
  const map = new THREE.DataTexture(px, n, n); map.needsUpdate = true; return map;
}

type P3 = [number, number, number];
// A grid surface over (along 0..1, across 0..1): the geometry of one stroke. UV: x across, y along, matching paintSheet.
function surface(fn: (l: number, a: number) => P3, nl = 18, na = 4) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= nl; i++) for (let j = 0; j <= na; j++) { const l = i / nl, a = j / na; pos.push(...fn(l, a)); uv.push(a, l); }
  for (let i = 0; i < nl; i++) for (let j = 0; j < na; j++) { const k = i * (na + 1) + j; idx.push(k, k + 1, k + na + 1, k + 1, k + na + 2, k + na + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}


// The sand's own colours, not Red Wind's wind-grey (the first quake clips read as a water splash): dark disturbed earth with a pale dry rim, warm and
// unsaturated, no glow. Linear working-space values; in the dim Night Pit (exposure above 1.5) both lift so the unlit strokes hold against dark clay.
export const quakeLook = (exposure: number): SandLook => exposure > 1.5
  ? { core: new THREE.Color(0.018, 0.008, 0.005), edge: new THREE.Color(0.05, 0.025, 0.014), dim: true }   // Strategy's Pit FAIL (2026-10-02): the plume read pale tan over the hero; darker than the shadowed clay now, and capped at CAP_PIT below
  : { core: new THREE.Color(0.12, 0.065, 0.03), edge: new THREE.Color(0.5, 0.35, 0.19), dim: false };

// The Centurion's Shield Quake, rank 8 (Ajax; Veteran lane, Dom's pick 2026-10-01; brief docs/briefs/specials/centurion-l8-l10-2026-10-01.md). One idea,
// the arena floor carrying the blow: he drives the tower shield's rim into the sand, a ripple of torn sand runs along the ground from him to the target
// and bursts up under his feet. Presentation only, on Red Wind's seam (special-timing.ts) and its painted-stroke sprites (special-fx-wind.ts): it reads
// the sim's special events and each side's feet, never the sim, the rig root or Math.random (every "random" is an index hash). Preview-only, ?special=shield.
//   wind-up: nothing on the sand while the shield rises; the ripple starts at the slam, RIPPLE ticks before the landing, and its front arrives on the
//   landing tick (the visible build-up is ~0.5 s, Dom: a 1-2 s one was too slow on Red Wind);
//   release: five broad sheets of sand stand up around the target's feet and a fountain of grit leaves the ground, then both fall back over ~0.75 s
//   and a low haze of settling dust thins out where the ripple ran. No glow, no props, no cylinder: every stroke is painted and torn.
const RIM = 0.6;   // metres in front of him: where the shield's rim meets the sand, and where the ripple starts
const STRIPS = 11, SHEETS = 6, GRIT = 220, DUST = 24;
const CAP = 0.92, CAP_PIT = 0.4;   // semi-transparent: both fighters stay readable through it; in the dim Pit no stroke or grit is over 0.4 (Strategy)

// A settling-dust patch: a soft, torn-edged blob, not a painted-sheet quad (those showed as a straight-edged box beside the player). Alpha falls off
// from a wandering, noise-bitten rim and reaches nothing at the sprite's own edge; colour is the dark earth inside going to the pale dry rim.
function dustBlob(seed: number, look: SandLook) {
  const n = 64, px = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x - 31.5) / 31.5, v = (y - 31.5) / 31.5, r = Math.hypot(u, v) + (fbm(u * 2.4 + 5, v * 2.4 + 5, seed) - 0.5) * 0.9;
    const a = smooth((1 - r) * 1.7) * (0.55 + 0.45 * fbm(x * 0.2, y * 0.2, seed + 3)) * smooth((1 - Math.max(Math.abs(u), Math.abs(v))) * 4), c = look.edge.clone().lerp(look.core, clamp01(1 - r * 0.9));
    px.set([c.r * 255, c.g * 255, c.b * 255, Math.min(1, a) * 255], (y * n + x) * 4);
  }
  const map = new THREE.DataTexture(px, n, n); map.magFilter = map.minFilter = THREE.LinearFilter; map.needsUpdate = true; return map;
}

type Piece = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial };
// Which cast gets the quake: the Centurion's class skill, the Scutum Shove. Passed to advanceCast as its own test, so the shared timeline (and Hades' cloud) never sees it.
export const isShieldQuake = (opponent: OpponentId, actor: number, move?: string) => opponent === 'veteran' && actor === 1 && move === 'skill_shove';
export type ShieldQuake = ReturnType<typeof createShieldQuake>;
export function createShieldQuake(scene: THREE.Scene, opponent: OpponentId, look: SandLook) {
  const root = new THREE.Group(); root.name = 'special fx'; root.visible = false; scene.add(root);
  const lane = new THREE.Group(), pit = new THREE.Group(); root.add(lane, pit);   // lane: at the caster, turned to the target; pit: at the target's feet
  const blobs = Array.from({ length: 4 }, (_, k) => dustBlob(k * 11 + 4, look)), long = Array.from({ length: 6 }, (_, s) => paintSheet(s * 5 + 3, look)), broad = Array.from({ length: 3 }, (_, s) => paintSheet(s * 7 + 61, look, true));
  const add = (parent: THREE.Group, g: THREE.BufferGeometry, map: THREE.Texture, name: string): Piece => {
    const mat = new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: true });
    const mesh = new THREE.Mesh(g, mat); mesh.name = name; mesh.frustumCulled = false; parent.add(mesh);
    return { mesh, mat };
  };
  // A ground strip along local +z (its head, the soft end of the painted stroke, toward the target), unit length, lying just off the sand.
  const strip = (i: number, seed: number) => {
    const wid = 0.4 + 0.5 * hash(i + seed, 5), bend = (hash(i + seed, 6) - 0.5) * 0.5;
    return surface((l, a) => { const z = 1 - l; return [(a - 0.5) * wid * (1 - 0.4 * z) + bend * z * z, 0.03 + (0.28 + 0.16 * hash(i + seed, 7)) * Math.sin(a * Math.PI) * (0.4 + 0.6 * z), z]; }, 14, 4);
  };
  // The seam: one raised ridge of torn sand from the shield's rim along the ground to the target, growing with the front (the first look had only soft smudges).
  const seamGeo = (seed: number) => surface((l, a) => { const z = 1 - l; return [(a - 0.5) * (0.5 - 0.18 * z) + Math.sin(z * 9 + seed) * 0.05 * z, 0.02 + (0.42 - 0.08 * z) * Math.sin(a * Math.PI) * (0.65 + 0.35 * hash(Math.floor(z * 12), seed)), z]; }, 28, 5);
  const dark = { ...look, core: look.core.clone().multiplyScalar(0.55), edge: look.edge.clone().multiplyScalar(0.7) };   // v3: a darker, taller seam, so it reads past the player's body before the burst
  const seam = add(lane, seamGeo(0), paintSheet(97, dark), 'quake seam');
  const strips: Piece[] = [], sheets: Piece[] = [], dust: Piece[] = [];
  for (let i = 0; i < STRIPS; i++) strips.push(add(lane, strip(i, 0), long[i % long.length], 'quake strip'));
  for (let j = 0; j < SHEETS; j++) {   // sand standing up around the target's feet, leaning out like a heaved crust
    const phi = 0.3 + j * 1.3 + 0.7 * hash(j, 51), R = 0.4 + 0.55 * hash(j, 52), H = 1.0 + 0.9 * hash(j, 53), wid = 1.1 + 0.8 * hash(j, 54), lean = 0.35 + 0.5 * hash(j, 55);
    const g = surface((l, a) => {
      const rad = R + lean * l * l * H * 0.6, y = H * Math.sin(l * Math.PI * 0.5), across = (a - 0.5) * wid * (1 - 0.45 * l);
      return [Math.cos(phi) * rad - Math.sin(phi) * across, y, Math.sin(phi) * rad + Math.cos(phi) * across];
    }, 14, 4);
    sheets.push(add(pit, g, broad[j % broad.length], 'quake sheet'));
  }
  for (let k = 0; k < DUST; k++) {   // the haze: flat torn patches that settle where the ripple ran, on both ends of the lane
    const wid = 0.7 + 0.6 * hash(k, 61), g = surface((l, a) => [(a - 0.5) * wid, 0.04 + 0.01 * l, l * wid], 4, 4);
    dust.push(add(k < DUST / 2 ? lane : pit, g, blobs[k % blobs.length], 'quake dust'));
  }
  const grit = new Float32Array(GRIT * 3).fill(-9), gritGeo = new THREE.BufferGeometry();
  gritGeo.setAttribute('position', new THREE.BufferAttribute(grit, 3).setUsage(THREE.DynamicDrawUsage));
  const gritMat = new THREE.PointsMaterial({ size: 0.13, sizeAttenuation: true, map: softDot(), color: look.edge.clone().multiplyScalar(0.8), transparent: true, opacity: 0, depthWrite: false, fog: true });
  const gritPoints = new THREE.Points(gritGeo, gritMat); gritPoints.name = 'quake grit'; gritPoints.frustumCulled = false; pit.add(gritPoints);

  const rimGrit = new Float32Array(40 * 3).fill(-9), rimGeo = new THREE.BufferGeometry();   // the puff the rim throws up as it bites the sand
  rimGeo.setAttribute('position', new THREE.BufferAttribute(rimGrit, 3).setUsage(THREE.DynamicDrawUsage));
  const rimMat = gritMat.clone(); rimMat.opacity = 0; const rimPoints = new THREE.Points(rimGeo, rimMat); rimPoints.name = 'quake rim grit'; rimPoints.frustumCulled = false; lane.add(rimPoints);
  const from = new THREE.Vector3(), to = new THREE.Vector3(), dir = new THREE.Vector3();
  let cast: Cast | null = null, clock = 0, lastTick = -1, have = false;
  const cap = look.dim ? CAP_PIT : CAP, setPiece = (p: Piece, opacity: number, sx = 1, sy = 1, sz = 1) => { p.mat.opacity = clamp01(opacity) * cap; p.mesh.scale.set(sx, sy, sz); p.mesh.visible = opacity > 0.01; };
  const hide = () => { for (const p of [...strips, ...sheets, ...dust]) { p.mat.opacity = 0; p.mesh.visible = false; } gritMat.opacity = 0; rimMat.opacity = 0; };

  return {
    // After the poses are final: `feet` each side's feet (the point on the ground; null while a rig loads), `yielding` true while a finisher plays.
    render(dt: number, events: readonly CombatEvent[], fighters: readonly [Fighter, Fighter], tick: number, feet: readonly [THREE.Vector3 | null, THREE.Vector3 | null], yielding: boolean) {
      clock = tick !== lastTick ? tick : Math.min(tick + 1, clock + dt * 60); lastTick = tick;
      const before = cast;
      cast = advanceCast(cast, events, fighters, tick, opponent, yielding, isShieldQuake);
      if (!before && cast) {
        strips.forEach((s, i) => { s.mesh.geometry.dispose(); s.mesh.geometry = strip(i, cast!.start); });
        seam.mesh.geometry.dispose(); seam.mesh.geometry = seamGeo(cast.start % 97);
      }   // a new ripple for every cast
      const a = cast ? feet[cast.actor] : null, b = cast ? feet[1 - cast.actor] : null;
      if (a && b) { from.copy(a); to.copy(b); have = true; }
      root.visible = !!cast && have;
      if (!cast || !have) { hide(); return; }
      const p = castPhase(cast, clock), seed = cast.start;
      const frozen = p.phase === 'dissolve' ? castPhase({ ...cast, fizzled: null }, cast.fizzled!) : p, fade = 1 - (p.phase === 'dissolve' ? smooth(p.k) : 0);
      const rel = p.phase === 'recover' ? p.age : -1;   // ticks since the landing
      const age = rel >= 0 ? LAND_AT + rel : frozen.age, ran = clamp01((age - SLAM_AT) / RIPPLE);   // 0..1 along the lane, from the slam
      dir.copy(to).sub(from).setY(0); const full = Math.max(0.9, dir.length()), dist = full - RIM; lane.position.copy(from).addScaledVector(dir.normalize(), RIM); lane.rotation.y = Math.atan2(dir.x, dir.z); pit.position.copy(to);
      const life = rel >= 0 ? 1 - smooth((rel - 14) / 34) : 1, burst = rel >= 0 ? smooth(rel / 9) : 0;
      const front = smooth(ran) * dist;   // metres of lane the front has covered
      setPiece(seam, ran > 0 ? 0.95 * (rel >= 0 ? life : 1) * fade : 0, 1, 1, Math.max(0.01, front * 0.97));
      strips.forEach((s, i) => {
        const h = (salt: number) => hash(i + seed * 7, salt), reachTo = dist - 0.2, u = (0.1 + 0.55 * h(21)) * reachTo, w = Math.min(reachTo - u, (0.7 + 1.3 * h(22)) * reachTo * 0.5), side = (h(23) - 0.5) * (0.12 + 0.5 * (u / reachTo));
        const shown = clamp01((front - u) / Math.max(0.2, w)), len = Math.max(0.01, w * shown);
        s.mesh.position.set(side, 0, u); s.mesh.rotation.y = (h(24) - 0.5) * 0.12;
        setPiece(s, (ran > 0 ? lerp(0.6, 1, h(25)) * smooth(shown * 3) * (rel >= 0 ? life : 1) : 0) * fade, 1, 1, len);
      });
      sheets.forEach((s, j) => {
        const rise = rel >= 0 ? smooth((rel - j * 0.8) / 10) : 0, sink = rel >= 0 ? smooth((rel - 12 - j) / 28) : 0;
        setPiece(s, rise * (1 - sink) * life * fade * (0.7 + 0.3 * hash(j, 81)), 0.6 + 0.4 * rise, (0.15 + 0.85 * rise) * (1 - 0.7 * sink), 0.6 + 0.4 * rise);
        s.mesh.rotation.y = hash(j, 82) * 0.4 * rise;
      });
      dust.forEach((d, k) => {   // settling dust: appears behind the front as it runs, holds a little, thins through the aftermath
        const onLane = k < DUST / 2, h = (salt: number) => hash(k + seed * 3, salt), at = onLane ? (0.08 + 0.7 * h(31)) * dist : 0;
        const here = onLane ? clamp01((front - at) / 0.5) : burst, settle = rel >= 0 ? 1 - smooth((rel - 10) / 40) : 1;
        d.mesh.position.set(onLane ? (h(32) - 0.5) * 0.7 : (h(33) - 0.5) * 0.9, 0, onLane ? at : (h(34) - 0.5) * 0.9); d.mesh.rotation.y = onLane ? 0 : h(35) * Math.PI * 2;
        setPiece(d, here * settle * (onLane ? 0.6 : 0.8) * fade, 1, 1, 0.5 + 0.5 * h(36));
      });
      const since = age - SLAM_AT;   // ticks since the rim bit the sand
      for (let i = 0; i < 40; i++) {
        const th = hash(i, 71) * Math.PI * 2, v = 0.6 + 1.6 * hash(i, 72), q = Math.max(0, since) / 60, r = (0.08 + 0.4 * hash(i, 73)) * (0.4 + 3 * q);
        rimGrit[i * 3] = Math.cos(th) * r; rimGrit[i * 3 + 1] = since < 0 ? -9 : Math.max(0.02, v * q - 4.5 * q * q); rimGrit[i * 3 + 2] = Math.sin(th) * r;
      }
      (rimGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true; rimMat.opacity = since >= 0 ? clamp01(1 - since / 28) * fade * (look.dim ? CAP_PIT : 1) : 0;
      const o: P3 = [0, 0, 0];
      for (let i = 0; i < GRIT; i++) {   // a fountain from the target's feet; before the landing, a few kernels skip ahead of the front
        const th = hash(i, 91) * Math.PI * 2, r = (0.1 + 0.8 * hash(i, 92)) * (0.3 + burst), v = 2.2 + 4 * hash(i, 93), s = Math.max(0, rel - 1) / 60, grounded = rel < 0;
        o[0] = Math.cos(th) * r * (1 + 0.8 * s); o[2] = Math.sin(th) * r * (1 + 0.8 * s);
        o[1] = grounded ? -9 : Math.max(0.02, v * s - 5 * s * s * (0.7 + 0.5 * hash(i, 94)));
        grit[i * 3] = o[0]; grit[i * 3 + 1] = o[1]; grit[i * 3 + 2] = o[2];
      }
      (gritGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true; gritMat.opacity = clamp01(rel >= 0 ? life * fade : 0) * (look.dim ? CAP_PIT : 1);
    },
    clear() { cast = null; have = false; root.visible = false; hide(); },
  };
}
