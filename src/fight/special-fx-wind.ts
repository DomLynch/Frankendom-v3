import * as THREE from 'three';
import type { CombatEvent, Fighter } from './duel.ts';
import type { OpponentId } from '../roster.ts';
import { advanceCast, castPhase, LAND_AT, type Cast } from './special-timing.ts';
import { clamp01, hash, noise, smooth } from './fx-math.ts';

// Set's Red Wind, the in-game effect (Nightborn lane; Dom's GO via Lead 2026-09-30, his pick of "A, the ground burst" 2026-10-01; the seam is Hades'
// special-fx.ts and special-timing.ts). One idea, the arena floor itself hitting the TARGET: a ring of sand erupts outward at his feet in radial
// streaks, and broad curved sheets peel up and over him like a wave breaking, with grit lifted off the floor. Presentation only: it reads the sim's
// special events and the target's feet, never the sim, the rig root or Math.random (every "random" is an index hash). Loaded lazily by the scene,
// only in a fight with Special Moves.
//   wind-up (2 s): the radial streaks snap onto the sand in ~0.5 s (Dom: 1-2 s was too slow) and hold there, faint, with a little grit;
//   release: the streaks lengthen to a burst in ~0.4 s and four broad sheets peel up and over the target; all gone by ~0.8 s.
// No cylinder and no code-drawn lines (Dom on v6: "a manufacturing-plant circular piece of plastic"): the strokes are painted sprites (below),
// each a different length, width, curl and opacity. Every cast makes a different star (seeded by its start tick). No lights, no shadows.
// The earlier looks (the cylinder veil, the spiral updraft B and the wind wall C) are in git history at cacd7fab.

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const fbm = (x: number, y: number, seed: number) => noise(x, y, seed) * 0.55 + noise(x * 2.1, y * 2.1, seed + 7) * 0.3 + noise(x * 4.3, y * 4.3, seed + 13) * 0.15;
const CAP = 0.8;   // semi-transparent: the fighter stays readable through the wind

// The wind's colours (Dom's verdict on v2, 2026-09-30: the fire-orange red "looks cheesy", make it grey / wind coloured and semi-transparent): a
// dust-grey core, darker than the pale floor so the strokes read on motion and density, with a lighter warm-grey rim; no saturation, no glow. In a
// dim arena (the Night Pit, exposure above 1.5) the core is a pale grey, bright enough for the unlit strokes to hold against dark clay. Linear
// values: the unlit strokes are drawn in the working space and tone-mapped by the arena's own exposure.
export function sandLook(exposure: number) {
  const dim = exposure > 1.5;
  return dim ? { core: new THREE.Color(0.42, 0.41, 0.39), edge: new THREE.Color(0.3, 0.29, 0.27), dim }
    : { core: new THREE.Color(0.14, 0.135, 0.125), edge: new THREE.Color(0.36, 0.34, 0.3), dim };
}
export type SandLook = ReturnType<typeof sandLook>;

// One painted stroke: x runs across its width, y along its length. Alpha = a torn-edged band (the edges wander and fray), streaked along the
// length, soft at its head and torn away at its tail; colour = the dark core of the stroke into the light dusty rim, streaks darker than the rest.
// `wide`: a stroke that fills its sprite (the peeling sheets).
export function paintSheet(seed: number, look: SandLook, wide = false) {
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
export function surface(fn: (l: number, a: number) => P3, nl = 18, na = 4) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= nl; i++) for (let j = 0; j <= na; j++) { const l = i / nl, a = j / na; pos.push(...fn(l, a)); uv.push(a, l); }
  for (let i = 0; i < nl; i++) for (let j = 0; j < na; j++) { const k = i * (na + 1) + j; idx.push(k, k + 1, k + na + 1, k + 1, k + na + 2, k + na + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}

// One ground streak of the burst, different on every cast (`seed` is the cast's start tick, so it is a pure function of the sim: no Math.random). Uneven
// angles, one of three lengths, a slight curve either way; a couple of streaks are dropped (the gaps) by `streakGap`.
const STREAKS = 11, SHEETS = 4, GRIT = 80, GATHER_TICKS = 30;
const LENGTHS = [[0.8, 1.15], [1.6, 2.0], [2.6, 3.2]] as const;
const streakGap = (i: number, seed: number) => i === Math.floor(hash(seed, 101) * STREAKS) || i === Math.floor(hash(seed, 102) * STREAKS) || (hash(seed, 103) < 0.5 && i === Math.floor(hash(seed, 104) * STREAKS));
function streakGeometry(i: number, seed: number) {
  const h = (salt: number) => hash(i + seed * 13, salt), spacing = (Math.PI * 2) / STREAKS;
  const th = i * spacing + (h(131) - 0.5) * spacing * 1.7 + hash(seed, 105) * Math.PI * 2;   // the whole star is turned by the cast, each streak off its slot
  const [lo, hi] = LENGTHS[Math.min(2, Math.floor(h(132) * 3))], len = lerp(lo, hi, h(133)), wid = 0.4 + 0.6 * h(134), r0 = 0.22, bend = (h(135) - 0.5) * 1.1;
  return surface((l, a) => {
    const rad = r0 + l * len, ang = th + bend * l * l, across = (a - 0.5) * wid * (1 - 0.5 * l);
    return [Math.cos(ang) * rad - Math.sin(ang) * across, 0.03 + 0.07 * l * h(136), Math.sin(ang) * rad + Math.cos(ang) * across];
  }, 14, 3);
}

type Piece = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial };
export type RedWind = ReturnType<typeof createRedWind>;
export function createRedWind(scene: THREE.Scene, opponent: OpponentId, look: SandLook) {
  const root = new THREE.Group(); root.name = 'special fx'; root.visible = false; scene.add(root);
  const sprites = Array.from({ length: 6 }, (_, s) => paintSheet(s * 5 + 2, look)), broad = Array.from({ length: 3 }, (_, s) => paintSheet(s * 7 + 40, look, true));
  const add = (g: THREE.BufferGeometry, map: THREE.Texture, name: string): Piece => {
    const mat = new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: true });
    const mesh = new THREE.Mesh(g, mat); mesh.name = name; mesh.frustumCulled = false; root.add(mesh);
    return { mesh, mat };
  };
  const grit = new Float32Array(GRIT * 3).fill(-9), gritGeo = new THREE.BufferGeometry();
  gritGeo.setAttribute('position', new THREE.BufferAttribute(grit, 3).setUsage(THREE.DynamicDrawUsage));
  const gritMat = new THREE.PointsMaterial({ size: 0.05, sizeAttenuation: true, map: softDot(), color: look.edge.clone().multiplyScalar(0.8), transparent: true, opacity: 0, depthWrite: false, fog: true });
  const gritPoints = new THREE.Points(gritGeo, gritMat); gritPoints.name = 'wind grit'; gritPoints.frustumCulled = false; root.add(gritPoints);

  const streaks: Piece[] = [], sheets: Piece[] = [];
  for (let i = 0; i < STREAKS; i++) streaks.push(add(streakGeometry(i, 0), sprites[i % sprites.length], 'wind streak'));
  for (let j = 0; j < SHEETS; j++) {   // broad curved sheets rising from the ground at a radius and curving in over the target's head, like a wave breaking
    const phi = 0.5 + j * 1.55 + 0.6 * hash(j, 41), R = 1 + 0.35 * hash(j, 42), H = 1.5 + 0.8 * hash(j, 43), wid = 1.1 + 0.7 * hash(j, 44);
    const g = surface((l, a) => {
      const arc = l * Math.PI * 0.62, rad = R * (0.35 + 0.65 * Math.cos(arc)), y = H * Math.sin(arc), across = (a - 0.5) * wid * (0.6 + 0.8 * l);
      return [Math.cos(phi) * rad - Math.sin(phi) * across, y, Math.sin(phi) * rad + Math.cos(phi) * across];
    }, 20, 4);
    sheets.push(add(g, broad[j % broad.length], 'wind sheet'));
  }

  const foot = new THREE.Vector3();
  let cast: Cast | null = null, clock = 0, lastTick = -1, haveFoot = false;
  const hide = () => { for (const p of [...streaks, ...sheets]) p.mat.opacity = 0; gritMat.opacity = 0; };
  const setPiece = (p: Piece, opacity: number, sx = 1, sy = 1, sz = 1) => { p.mat.opacity = clamp01(opacity) * CAP; p.mesh.scale.set(sx, sy, sz); p.mesh.visible = opacity > 0.01; };
  const setGrit = (fn: (i: number, out: P3) => void, opacity: number) => {
    const o: P3 = [0, 0, 0];
    for (let i = 0; i < GRIT; i++) { fn(i, o); grit[i * 3] = o[0]; grit[i * 3 + 1] = o[1]; grit[i * 3 + 2] = o[2]; }
    (gritGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true; gritMat.opacity = clamp01(opacity);
  };

  return {
    // After the poses are final: `tick` is the sim tick of this frame, `feet` each side's feet (the point on the ground between them; null
    // while a rig loads), `yielding` true while a finisher plays (no new cast starts; one in flight finishes, per Combat's double-kill rule).
    render(dt: number, events: readonly CombatEvent[], fighters: readonly [Fighter, Fighter], tick: number, feet: readonly [THREE.Vector3 | null, THREE.Vector3 | null], yielding: boolean) {
      clock = tick !== lastTick ? tick : Math.min(tick + 1, clock + dt * 60); lastTick = tick;   // smooth between sim ticks, never ahead by more than one
      const before = cast;
      cast = advanceCast(cast, events, fighters, tick, opponent, yielding);
      if (!before && cast) streaks.forEach((s, i) => { s.mesh.geometry.dispose(); s.mesh.geometry = streakGeometry(i, cast!.start); });   // a new star for every cast
      const target = cast ? feet[1 - cast.actor] : null;
      if (target) { foot.copy(target); haveFoot = true; }
      root.visible = !!cast && haveFoot;
      if (!cast || !haveFoot) { hide(); return; }
      const p = castPhase(cast, clock);
      // A fizzle (the caster fell in the windup) freezes the wind where it was and lets it settle: no burst.
      const shown = p.phase === 'dissolve' ? castPhase({ ...cast, fizzled: null }, cast.fizzled!) : p, fade = 1 - (p.phase === 'dissolve' ? smooth(p.k) : 0);
      const rel = p.phase === 'recover' ? p.age : -1;   // ticks since the release
      const wp = rel >= 0 ? 1 : clamp01(shown.age / LAND_AT), t = clock / 60;
      root.position.copy(foot);
      const burst = rel >= 0 ? smooth(rel / 22) : 0, life = rel >= 0 ? 1 - smooth((rel - 18) / 30) : 1;   // the snap in 0.37 s, gone by ~0.8 s
      const gather = smooth(shown.age / GATHER_TICKS);   // the streaks snap onto the sand in ~0.5 s and hold there
      streaks.forEach((s, i) => {
        const wind = lerp(0.2, 0.45, gather) + (rel >= 0 ? 0 : 0.04 * Math.sin(t * 3 + i)), ext = rel >= 0 ? lerp(0.5, 1.15, burst) : wind;
        setPiece(s, streakGap(i, cast!.start) ? 0 : (rel >= 0 ? lerp(0.5, 0.95, burst) * life : lerp(0.15, 0.5, gather)) * fade, ext, 1, ext);
      });
      sheets.forEach((s, j) => {
        const rise = rel >= 0 ? smooth((rel - j * 1.5) / 16) : 0, scale = 0.5 + 0.5 * rise;
        setPiece(s, rise * life * fade * (0.75 + 0.25 * hash(j, 81)), scale, 0.15 + 0.85 * rise, scale);
        s.mesh.rotation.y = hash(j, 82) * 0.3 * rise;
      });
      setGrit((i, o) => {
        const th = hash(i, 91) * Math.PI * 2, r = (0.25 + 1.6 * hash(i, 92)) * (rel >= 0 ? 0.4 + burst : 0.3 + 0.2 * wp), fall = rel >= 0 ? Math.max(0, rel - 6) / 60 : 0;
        o[0] = Math.cos(th) * r; o[1] = 0.05 + (rel >= 0 ? burst * (0.2 + 1.1 * hash(i, 93)) - 7 * fall * fall * (0.5 + hash(i, 94)) : 0.08 * hash(i, 93)); o[2] = Math.sin(th) * r; if (o[1] < 0.02) o[1] = 0.02;
      }, (rel >= 0 ? life : 0.35 * wp) * fade);
    },
    clear() { cast = null; haveFoot = false; root.visible = false; hide(); },
  };
}
