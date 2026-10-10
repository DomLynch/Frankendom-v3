import * as THREE from 'three';
import type { CombatEvent, Fighter } from './duel.ts';
import type { OpponentId } from '../roster.ts';
import { specialGust } from './special-gust.ts';
import { advanceCast, shadowPhase as castPhase, LAND_AT, type Cast, type isHadesShadow } from './special-timing.ts';
import { clamp01, hash, noise, smooth } from './fx-math.ts';

// The Pitborn's rank 8-10 boss specials (Pitborn lane; Dom picked all three on 2026-10-01: Cracking Ground, Ash Fall, Wind Wall). One idea each, drawn
// from the arena itself, no props, no glow, painted and irregular. Presentation only, on Red Wind's seam (special-timing.ts) and its painted strokes
// (special-fx-wind.ts): it reads the sim's special events and each side's feet, never the sim, the rig root or Math.random (every "random" is an
// index hash). Preview-only, ?special=<kind>. The visible build-up is ~0.5 s before the landing (Dom: 1-2 s was too slow on Red Wind).
//   antaeus (rank 8, level 36): CRACKING GROUND. Ragged cracks split the sand out from his feet and dark clods lift off their edges, then fall back.
//   surtr   (rank 9, level 41): ASH FALL. Torn grey ash drifts down over the whole arena and thickens, soot scorches the sand under him, a low smoke lies on it.
//   typhon  (rank 10, level 46): WIND WALL. A gale from behind him tears sand sideways toward the target and snaps the crowd banners (special-gust.ts -> arena.ts).

// Painted-stroke helpers: hash, clamp01, smooth and noise come from fx-math.ts (shared with Red Wind and the Shield Quake); lerp stays local.
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const fbm = (x: number, y: number, seed: number) => noise(x, y, seed) * 0.55 + noise(x * 2.1, y * 2.1, seed + 7) * 0.3 + noise(x * 4.3, y * 4.3, seed + 13) * 0.15;
type SandLook = { core: THREE.Color; edge: THREE.Color; dim: boolean };
// Dark disturbed earth with a pale dry rim (the Shield Quake's).
const quakeLook = (exposure: number): SandLook => exposure > 1.5 ? { core: new THREE.Color(0.045, 0.02, 0.012), edge: new THREE.Color(0.115, 0.058, 0.03), dim: true }
  : { core: new THREE.Color(0.12, 0.065, 0.03), edge: new THREE.Color(0.5, 0.35, 0.19), dim: false };
// One painted stroke: x across its width, y along its length; a torn-edged band, streaked, soft at the head and ragged at the tail.
function paintSheet(seed: number, look: SandLook) {
  const w = 64, h = 192, px = new Uint8Array(w * h * 4), core = look.core, edge = look.edge;
  const width = 0.4 + 0.35 * hash(seed, 1), centre = 0.5 + 0.12 * (hash(seed, 2) - 0.5), wobble = 0.1 + 0.18 * hash(seed, 3);
  for (let y = 0; y < h; y++) {
    const l = y / (h - 1), c = centre + (fbm(l * 3, seed, seed) - 0.5) * wobble * 2, half = width * (0.5 + 0.35 * fbm(l * 4, seed + 5, seed)) * (1 - 0.35 * l);
    for (let x = 0; x < w; x++) {
      const a = x / (w - 1), d = Math.abs(a - c) / half, frayed = d + (noise(a * 18, l * 26, seed + 3) - 0.5) * 0.7, body = smooth((1 - frayed) * 2.2);
      const streak = 0.3 + 0.7 * smooth(fbm(a * 22, l * 2.4, seed + 9) * 1.5 - 0.15), head = smooth(l / 0.1), tail = smooth((1 - l) * 2.4 - 0.55 * noise(a * 9, l * 9, seed + 11));
      const alpha = Math.min(1, body * streak * head * tail * 1.15), dark = Math.min(1, smooth(1 - d) * (0.55 + 0.45 * streak) * 1.3);
      px.set([Math.min(255, lerp(edge.r, core.r, dark) * 255), Math.min(255, lerp(edge.g, core.g, dark) * 255), Math.min(255, lerp(edge.b, core.b, dark) * 255), alpha * 255], (y * w + x) * 4);
    }
  }
  const map = new THREE.DataTexture(px, w, h); map.magFilter = map.minFilter = THREE.LinearFilter; map.needsUpdate = true; return map;
}

// The Pitborn's cast test, passed to advanceCast as `is` (the seam's own isHadesShadow stays the Nightborn's): his Cleave on the opponent's side.
export const isPitbornSpecial: typeof isHadesShadow = (opponent, actor, move) => opponent === 'pitborn' && actor === 1 && move === 'skill_cleave';
export type PitbornKind = 'antaeus' | 'surtr' | 'typhon';
export const PITBORN_KINDS: readonly PitbornKind[] = ['antaeus', 'surtr', 'typhon'];
const BUILD = 30;   // ticks of visible build-up before the landing
const CRACKS = 7, CLODS = 46, GRIT = 90, FLAKES = 150, PATCHES = 7, SMOKE = 9, STREAKS = 17, SAND = 82;
// Opacity ceilings (Strategy's bar 10-01: haze <= 0.7 on the day sand, <= 0.4 on the Night Pit). HAZE = what hangs in the air and can wash the picture: Surtr's smoke
// (0.55 / 0.3) and Typhon's gale strokes (0.7 / 0.4); pinned by tests/special-fx-pitborn.test.ts. Ground marks and specks are not haze: Antaeus's cracks (CAP) and clods,
// Surtr's soot and flakes, Typhon's sand specks (small, each a few pixels; on the Night Pit they too are capped at 0.4).
const CAP = 0.85;   // semi-transparent: both fighters stay readable through it

// Ash: the Night Pit's exposure lifts any grey into a pale cloud (Strategy FAILed it 10-02), so there it is soot-black; the day look is unchanged.
const ashLook = (exposure: number): SandLook => exposure > 1.5 ? { core: new THREE.Color(0.02, 0.018, 0.016), edge: new THREE.Color(0.06, 0.05, 0.042), dim: true }
  : { core: new THREE.Color(0.05, 0.045, 0.04), edge: new THREE.Color(0.2, 0.17, 0.14), dim: false };
// Antaeus's earth: the day sand takes the Shield Quake's dark seam and pale dry rim; the Night Pit's seam is soot-dark with at most a dim ember-red rim, no pale (Strategy 10-02: pale on dark clay FAILs).
const earthLook = (exposure: number): SandLook => exposure > 1.5
  ? { core: new THREE.Color(0.006, 0.004, 0.003), edge: new THREE.Color(0.05, 0.022, 0.012), dim: true } : quakeLook(exposure);
// Ash flakes: grey-brown, never pale (pale flakes read as snow on the Night Pit).
const flakeLook = (exposure: number): SandLook => ashLook(exposure);
// Ash smoke: the day sand swallowed the paler grey, so it goes darker and denser there (the Night Pit's reads as it is).
const smokeLook = (exposure: number): SandLook => exposure > 1.5 ? { core: new THREE.Color(0.012, 0.011, 0.01), edge: new THREE.Color(0.04, 0.034, 0.029), dim: true }
  : { core: new THREE.Color(0.03, 0.028, 0.026), edge: new THREE.Color(0.13, 0.11, 0.09), dim: false };
// The gale's grit: a near-black brown core with a pale torn edge on the day sand (pale grey, then sand-brown, vanished against it); near-black warm grey on the Night Pit (pale strokes FAILed 10-02).
const galeLook = (exposure: number): SandLook => exposure > 1.5 ? { core: new THREE.Color(0.02, 0.018, 0.015), edge: new THREE.Color(0.035, 0.031, 0.026), dim: true }
  : { core: new THREE.Color(0.022, 0.014, 0.008), edge: new THREE.Color(0.46, 0.35, 0.2), dim: false };

const texture = (n: number, fill: (x: number, y: number, put: (r: number, g: number, b: number, a: number) => void) => void) => {
  const px = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) fill(x, y, (r, g, b, a) => px.set([Math.min(255, r * 255), Math.min(255, g * 255), Math.min(255, b * 255), clamp01(a) * 255], (y * n + x) * 4));
  const map = new THREE.DataTexture(px, n, n); map.magFilter = map.minFilter = THREE.LinearFilter; map.needsUpdate = true; return map;
};
const mix = (look: SandLook, k: number): [number, number, number] => [lerp(look.edge.r, look.core.r, k), lerp(look.edge.g, look.core.g, k), lerp(look.edge.b, look.core.b, k)];

// One crack: a torn dark seam wandering down the sprite's length (v from the root at his feet to the tip) with a pale lifted rim and a short side branch.
function crackMap(seed: number, look: SandLook) {
  const w = 64, h = 192, px = new Uint8Array(w * h * 4), branchAt = 0.3 + 0.3 * hash(seed, 4), side = hash(seed, 5) < 0.5 ? -1 : 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = y / (h - 1), a = x / (w - 1), c = 0.5 + (fbm(l * 5, seed, seed) - 0.5) * 0.34, taper = 1 - 0.8 * l ** 0.8;
    const seam = Math.abs(a - c) / (0.07 * taper + 0.006), bc = c + side * (a > c ? 1 : 1) * (l - branchAt) * 0.9, bran = l > branchAt ? Math.abs(a - bc) / (0.03 * (1 - l) + 0.004) : 9;
    const d = Math.min(seam, bran) + (fbm(a * 22, l * 30, seed + 3) - 0.5) * 0.9, dark = smooth(1 - d), rim = smooth(1 - d / 4) * 0.85, alpha = Math.max(dark, rim) * smooth(1 - l * 0.92) * (0.7 + 0.3 * fbm(a * 9, l * 9, seed + 7));
    const [r, g, b] = mix(look, dark > 0.35 ? 1 : 0);
    px.set([r * 255, g * 255, b * 255, clamp01(alpha) * 255], (y * w + x) * 4);
  }
  const map = new THREE.DataTexture(px, w, h); map.magFilter = map.minFilter = THREE.LinearFilter; map.needsUpdate = true; return map;
}
// A chunk of sand: an angular, noise-bitten lump, dark underneath with a dry pale top.
const clodMap = (seed: number, look: SandLook) => texture(32, (x, y, put) => {
  const u = (x - 15.5) / 15.5, v = (y - 15.5) / 15.5, ang = Math.atan2(v, u), edge = 0.62 + 0.3 * fbm(Math.cos(ang) * 1.6 + 4, Math.sin(ang) * 1.6 + 4, seed) + 0.1 * hash(Math.round(ang * 2.2), seed);
  const r = Math.hypot(u, v) / edge, [c0, c1, c2] = mix(look, clamp01(0.8 + 0.5 * (v * 0.5 + 0.1) + 0.3 * (fbm(x * 0.3, y * 0.3, seed + 2) - 0.5)));
  put(c0, c1, c2, smooth((1 - r) * 5));
});
// A torn blob (soot patch, smoke): soft inside, bitten at the rim, nothing at the sprite's own edge.
const blobMap = (seed: number, look: SandLook, soft: number) => texture(64, (x, y, put) => {
  const u = (x - 31.5) / 31.5, v = (y - 31.5) / 31.5, r = Math.hypot(u, v) + (fbm(u * 2.6 + 5, v * 2.6 + 5, seed) - 0.5) * 0.9;
  const [c0, c1, c2] = mix(look, clamp01(1 - r * 0.9));
  put(c0, c1, c2, smooth((1 - r) * soft) * (0.6 + 0.4 * fbm(x * 0.2, y * 0.2, seed + 3)) * smooth((1 - Math.max(Math.abs(u), Math.abs(v))) * 4));
});
// An ash flake: a small torn sliver, hard-edged and irregular.
const flakeMap = (seed: number, look: SandLook) => texture(16, (x, y, put) => {
  const u = (x - 7.5) / 7.5, v = (y - 7.5) / 7.5, r = Math.hypot(u, v) / (0.8 + 0.15 * hash(seed, 1)) + (fbm(x * 0.4, y * 0.4, seed) - 0.5) * 0.35;
  const [c0, c1, c2] = mix(look, 0.5 + 0.5 * hash(seed, 3)); put(c0, c1, c2, smooth((1 - r) * 1.6));
});
const gritMap = () => texture(16, (x, y, put) => put(1, 1, 1, smooth(1 - Math.hypot(x - 7.5, y - 7.5) / 8)));

// A flat strip on the sand along +x from the origin: v (the stroke's length) runs 0 at the origin to 1 at x = 1, u across it.
const stripGeometry = () => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.rotateY(-Math.PI / 2); g.translate(0.5, 0, 0); return g; };
const flatDisc = () => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); return g; };

// Class B: two short banks bunch inward; only one folds forward on the landing.
export function createEarthFold(scene: THREE.Scene, opponent: OpponentId, exposure: number) {
  const root = new THREE.Group(); root.name = 'earth fold'; root.visible = false; scene.add(root);
  const look = earthLook(exposure), maps = [1, 4, 7].map(seed => clodMap(seed, look));
  const foldedMaps = exposure > 1.5 ? [1, 4, 7].map(seed => clodMap(seed, { ...look, core: new THREE.Color('#94724d'), edge: new THREE.Color('#b28b60') })) : maps;
  const banks = [-1, 1].map(side => {
    const bank = new THREE.Group(); bank.name = 'fold bank'; root.add(bank);
    for (let i = 0; i < 9; i++) {
      const material = new THREE.SpriteMaterial({ map: (side === -1 ? foldedMaps : maps)[i % maps.length], transparent: true, opacity: 0, depthWrite: false, fog: true });
      const clod = new THREE.Sprite(material); clod.name = 'fold clod';
      clod.position.set((hash(i, side + 8) - 0.5) * 0.17, 0.11 + hash(i, 3) * 0.05, (i - 4) * 0.1);
      clod.scale.set(0.22 + hash(i, 5) * 0.1, 0.2 + hash(i, 7) * 0.08, 1); bank.add(clod);
    }
    return bank;
  });
  let cast: Cast | null = null;
  const hide = () => { root.visible = false; for (const bank of banks) for (const clod of bank.children as THREE.Sprite[]) { clod.visible = false; clod.material.opacity = 0; } };
  return {
    render(_dt: number, events: readonly CombatEvent[], fighters: readonly [Fighter, Fighter], tick: number, feet: readonly [THREE.Vector3 | null, THREE.Vector3 | null], yielding: boolean) {
      if (yielding) { cast = null; hide(); return; }
      cast = advanceCast(cast, events, fighters, tick, opponent, false, isPitbornSpecial);
      const from = feet[1], to = feet[0]; if (!cast || !from || !to) { hide(); return; }
      const phase = castPhase(cast, tick), build = smooth(((cast.fizzled ?? tick) - cast.start) / (LAND_AT - 12));
      const fade = phase.phase === 'recover' || phase.phase === 'dissolve' ? 1 - smooth(phase.k) : 1, fold = cast.landed === null ? 0 : smooth((tick - cast.landed) / 14);
      root.position.copy(from); root.rotation.y = Math.atan2(to.x - from.x, to.z - from.z); root.visible = true;
      banks.forEach((bank, i) => {
        bank.position.set((i ? 1 : -1) * (0.85 - 0.25 * build), 0, 0.6 + (i === 0 ? fold * 0.55 : 0)); bank.scale.y = i === 0 ? 1 - fold * 0.7 : 1;
        for (const clod of bank.children as THREE.Sprite[]) { clod.material.opacity = build * fade * 0.9; clod.visible = clod.material.opacity > 0.001; }
      });
    },
    clear() { cast = null; hide(); },
  };
}

export type PitbornSpecial = ReturnType<typeof createPitbornSpecial>;
export function createPitbornSpecial(scene: THREE.Scene, opponent: OpponentId, kind: PitbornKind, exposure: number) {
  const root = new THREE.Group(); root.name = 'special fx'; root.visible = false; scene.add(root);
  const look = kind === 'antaeus' ? earthLook(exposure) : kind === 'surtr' ? ashLook(exposure) : galeLook(exposure);
  const mat = (map: THREE.Texture, color = '#ffffff') => new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const spriteMat = (map: THREE.Texture, color = '#ffffff') => new THREE.SpriteMaterial({ map, color, transparent: true, opacity: 0, depthWrite: false, fog: true });
  const over = kind === 'typhon';   // the gale draws in front of the fighters, so a Night Pit silhouette in the shadow band is still crossed by it
  const sprites = (n: number, make: (i: number) => THREE.SpriteMaterial, name: string) => Array.from({ length: n }, (_, i) => { const s = new THREE.Sprite(make(i)); if (over) { s.material.depthTest = false; s.renderOrder = 6; } s.name = `${name} ${i}`; s.visible = false; root.add(s); return s; });
  const meshes = (n: number, g: THREE.BufferGeometry, make: (i: number) => THREE.Material, name: string) => Array.from({ length: n }, (_, i) => { const m = new THREE.Mesh(g, make(i)); if (over) { m.material.depthTest = false; m.renderOrder = 6; } m.name = `${name} ${i}`; m.frustumCulled = false; m.visible = false; root.add(m); return m; });
  const op = (o: THREE.Object3D, v: number) => { ((o as THREE.Mesh | THREE.Sprite).material as THREE.Material).opacity = v; o.visible = v > 0.01; };
  const gritTint = kind === 'antaeus' ? (exposure > 1.5 ? '#14100c' : '#7a5a36') : kind === 'surtr' ? '#3a3a3c' : exposure > 1.5 ? '#14110d' : '#2a1a0c';

  const cracks = kind === 'antaeus' ? meshes(CRACKS, stripGeometry(), (i) => mat(crackMap(i * 7 + 2, look)), 'crack') : [];
  const tex = new Map<string, THREE.Texture>(), once = (key: string, make: () => THREE.Texture) => { let t = tex.get(key); if (!t) { t = make(); tex.set(key, t); } return t; };   // a texture per seed, shared by the sprites that use it
  const clods = kind === 'antaeus' ? sprites(CLODS, (i) => spriteMat(once(`clod${i % 5}`, () => clodMap(i % 5 * 3 + 1, look))), 'clod') : [];
  const grit = kind === 'surtr' ? [] : sprites(GRIT, () => spriteMat(once('grit', gritMap), gritTint), 'grit');
  const flakes = kind === 'surtr' ? sprites(FLAKES, (i) => spriteMat(once(`flake${i % 6}`, () => flakeMap(i % 6 * 5 + 2, flakeLook(exposure)))), 'flake') : [];
  const patches = kind === 'surtr' ? meshes(PATCHES, flatDisc(), (i) => mat(blobMap(i * 9 + 3, look, 2.2)), 'soot') : [];
  const smoke = kind === 'surtr' ? sprites(SMOKE, (i) => spriteMat(blobMap(i * 13 + 8, smokeLook(exposure), 1.4)), 'smoke') : [];
  const streaks = kind === 'typhon' ? meshes(STREAKS, stripGeometry(), (i) => mat(paintSheet(i * 5 + 31, look)), 'gale') : [];
  const sand = kind === 'typhon' ? sprites(SAND, () => spriteMat(once('grit', gritMap), gritTint), 'sand') : [];
  const all = [...cracks, ...clods, ...grit, ...flakes, ...patches, ...smoke, ...streaks, ...sand];
  const caster = new THREE.Vector3(), target = new THREE.Vector3(), dir = new THREE.Vector3();
  let cast: Cast | null = null, clock = 0, lastTick = -1;

  let casterAnchor: THREE.Object3D | null = null;
  function hide() { root.visible = false; specialGust.k = 0; if (casterAnchor) casterAnchor.rotation.z = 0; all.forEach((o) => (o.visible = false)); }
  return {
    // `feet`: each side's feet midpoint on the sand in world space (null while a rig loads). Same call shape as Red Wind and the Shield Quake.
    render(dt: number, events: readonly CombatEvent[], fighters: readonly [Fighter, Fighter], tick: number, feet: readonly [THREE.Vector3 | null, THREE.Vector3 | null], yielding: boolean, anchor?: THREE.Object3D | null) {
      clock = tick !== lastTick ? tick : Math.min(tick + 1, clock + dt * 60); lastTick = tick;
      cast = advanceCast(cast, events, fighters, tick, opponent, yielding, isPitbornSpecial);
      if (anchor) casterAnchor = anchor;
      const from = cast ? feet[cast.actor] : null, to = cast ? feet[1 - cast.actor] : null;
      if (!cast || !from || !to) { hide(); return; }
      caster.copy(from); target.copy(to);
      const p = castPhase(cast, clock), age = p.phase === 'gather' || p.phase === 'fall' ? p.age : LAND_AT + p.age;
      const build = smooth((age - (LAND_AT - BUILD)) / BUILD), post = p.phase === 'recover' || p.phase === 'dissolve' ? smooth(p.k) : 0;
      const live = build * (1 - post * post), t = clock * 0.0167, struck = p.phase === 'recover' ? smooth(Math.min(1, p.k * 5)) : 0;
      dir.set(target.x - caster.x, 0, target.z - caster.z); const gap = dir.length() || 1; dir.divideScalar(gap);
      const cx = (target.x + caster.x) / 2, cz = (target.z + caster.z) / 2, gy = Math.min(caster.y, target.y);
      root.visible = true; specialGust.k = 0;
      if (kind === 'antaeus') {
        cracks.forEach((m, i) => {   // seven seams split out from his feet in uneven lengths and headings, widest at the root; they hold, then close as the clods settle
          const len = build ** 0.7 * (1.6 + 2.4 * hash(i, 21)), wid = 1.1 + 0.8 * hash(i, 22);
          m.position.set(caster.x, gy + 0.03 + 0.003 * i, caster.z); m.rotation.y = Math.atan2(-dir.z, dir.x) + (i % 2 ? 1 : -1) * (0.45 + 1.1 * hash(i, 23)); m.scale.set(len, 1, wid);
          op(m, CAP * (1 - post * post) * clamp01(build * 3));
        });
        clods.forEach((s, i) => {   // chunks lift off the seams, hang a beat, and drop back with the landing
          const a = hash(i, 24) * Math.PI * 2, r = 0.2 + 1.5 * hash(i, 25) * (0.35 + 0.65 * build), up = (0.12 + 0.85 * hash(i, 26)) * build * (1 - 0.9 * smooth(struck)) * (1 - post);
          s.position.set(caster.x + Math.cos(a) * r, gy + 0.06 + up, caster.z + Math.sin(a) * r);
          s.scale.setScalar(0.08 + 0.16 * hash(i, 27)); op(s, 0.95 * clamp01(build * 2) * (1 - post * post));
        });
        grit.forEach((s, i) => {
          const a = hash(i, 28) * Math.PI * 2, r = 0.3 + 1.4 * hash(i, 29), up = (0.05 + 0.5 * hash(i, 30)) * build * (1 - post);
          s.position.set(caster.x + Math.cos(a) * r, gy + 0.05 + up, caster.z + Math.sin(a) * r); s.scale.setScalar(0.04 + 0.05 * hash(i, 31)); op(s, 0.7 * live);
        });
      } else if (kind === 'surtr') {
        patches.forEach((m, i) => {   // soot scorched into the sand under him: torn dark patches creeping out, never a clean ring
          const a = hash(i, 41) * Math.PI * 2, r = 0.15 + 1.6 * hash(i, 42) * build, s = 1.3 + 1.2 * hash(i, 43);
          m.position.set(caster.x + Math.cos(a) * r, gy + 0.03 + 0.003 * i, caster.z + Math.sin(a) * r); m.rotation.y = hash(i, 44) * 6.3; m.scale.set(s * build, 1, s * build * 0.8);
          op(m, (look.dim ? 0.4 : 0.9) * (1 - post * 0.8) * clamp01(build * 2));
        });
        smoke.forEach((s, i) => {   // a low smoke lying along the sand where he stands
          const a = hash(i, 45) * Math.PI * 2, r = 0.2 + 1.3 * hash(i, 46), rise = 0.12 + 0.3 * hash(i, 47) + 0.25 * build;
          s.position.set(caster.x + Math.cos(a + t * 0.2) * r, gy + rise, caster.z + Math.sin(a + t * 0.2) * r); s.scale.setScalar((0.7 + 0.6 * hash(i, 48)) * (0.4 + 0.6 * build)); op(s, (look.dim ? 0.3 : 0.55) * build * (1 - post * post));
        });
        flakes.forEach((s, i) => {   // ash drifts down over the whole arena, thickening: a flake only appears once the build passes its own threshold
          const fall = (t * (0.25 + 0.2 * hash(i, 31)) + hash(i, 32)) % 1, on = clamp01(build * 1.5 - hash(i, 36) * 0.5);
          s.position.set(cx + (hash(i, 33) - 0.5) * 7 + Math.sin(t * 1.7 + i) * 0.15, gy + 3.4 * (1 - fall), cz + (hash(i, 34) - 0.5) * 7);
          s.scale.setScalar((look.dim ? 0.07 : 0.05) + (look.dim ? 0.08 : 0.07) * hash(i, 35)); (s.material as THREE.SpriteMaterial).rotation = hash(i, 37) * 6.3 + t * (hash(i, 38) - 0.5); op(s, (look.dim ? 0.4 : 0.75) * on * (1 - post * post));
        });
      } else {
        // The wind IS the tell (Strategy 2026-10-02): it starts thin and low with the wind-up and grows over the whole 2 s to the full sweep at the release; he sways in it.
        const wk = smooth(age / LAND_AT), gale = wk ** 1.3 * (1 - post * post);
        specialGust.k = gale;
        if (casterAnchor) casterAnchor.rotation.z = Math.sin(clock / 60 * Math.PI * 2 * 1.1) * 0.16 * wk * (1 - post);
        streaks.forEach((m, i) => {   // painted strokes torn along the wind, flat and tilted, running from behind him through to the target and past
          const span = gap + 4, run = (t * (1.8 + hash(i, 51)) * 2 + hash(i, 52) * span) % span, lat = (hash(i, 53) - 0.5) * 3.4 * (0.45 + 0.55 * wk), hgt = (0.04 + 1.1 * hash(i, 54)) * (0.25 + 0.75 * wk), len = (1.2 + 1.5 * hash(i, 55)) * (0.6 + 0.4 * wk);
          m.position.set(caster.x - dir.x * 1.8 + dir.x * (run - len) - dir.z * lat, gy + hgt, caster.z - dir.z * 1.8 + dir.z * (run - len) + dir.x * lat);
          m.rotation.set((hash(i, 56) - 0.5) * 1.1, Math.atan2(-dir.z, dir.x), 0, 'YXZ'); m.scale.set(len, 1, 0.5 + 0.5 * hash(i, 57)); op(m, (look.dim ? 0.4 : 0.7) * gale * clamp01((wk * 1.25 - hash(i, 58) * 0.9) * 4));   // the Night Pit's pale strokes wash over both fighters at the peak: 30% lighter there
        });
        sand.forEach((s, i) => {   // grit whipped sideways, fast
          const span = gap + 4, run = (t * (3.2 + 1.5 * hash(i, 61)) + hash(i, 62) * span) % span, lat = (hash(i, 63) - 0.5) * 3.6;
          s.position.set(caster.x - dir.x * 1.8 + dir.x * run - dir.z * lat, gy + 0.05 + 1.2 * hash(i, 64), caster.z - dir.z * 1.8 + dir.z * run + dir.x * lat);
          s.scale.setScalar(0.05 + 0.07 * hash(i, 65)); op(s, (look.dim ? 0.4 : 0.8) * gale * clamp01((wk * 1.25 - hash(i, 66) * 0.9) * 4));
        });
      }
    },
    clear() { cast = null; hide(); },
  };
}

// Class A: one stance-local patch gathers beside the Cleave, then sets down sharply on the accepted strike.
// The scene manager normalizes either real caster to actor 1 and owns this group's resources.
export function createCleaverSet(scene: THREE.Scene, opponent: OpponentId, exposure: number) {
  const root = new THREE.Group(); root.name = 'cleaver set'; root.visible = false; scene.add(root);
  const look: SandLook = exposure > 1.5
    ? { core: new THREE.Color(0.012, 0.008, 0.004), edge: new THREE.Color(0.1, 0.052, 0.025), dim: true }
    : { core: new THREE.Color(0.06, 0.03, 0.014), edge: new THREE.Color(0.25, 0.135, 0.06), dim: false };
  const maps = [1, 4, 7].map(seed => clodMap(seed, look));
  const clods = Array.from({ length: 9 }, (_, i) => {
    const material = new THREE.SpriteMaterial({ map: maps[i % maps.length], transparent: true, opacity: 0, depthWrite: false, fog: true });
    const clod = new THREE.Sprite(material); clod.name = 'set clod'; clod.visible = false;
    clod.scale.set(0.18 + hash(i, 5) * 0.08, 0.16 + hash(i, 7) * 0.06, 1); root.add(clod); return clod;
  });
  let cast: Cast | null = null;
  const hide = () => { root.visible = false; for (const clod of clods) { clod.visible = false; clod.material.opacity = 0; } };
  return {
    render(_dt: number, events: readonly CombatEvent[], fighters: readonly [Fighter, Fighter], tick: number, feet: readonly [THREE.Vector3 | null, THREE.Vector3 | null], yielding: boolean) {
      if (yielding) { cast = null; hide(); return; }
      cast = advanceCast(cast, events, fighters, tick, opponent, false, isPitbornSpecial);
      const from = feet[1], to = feet[0]; if (!cast || !from || !to) { hide(); return; }
      const phase = castPhase(cast, tick), build = smooth(((cast.fizzled ?? tick) - cast.start) / (LAND_AT - 12));
      const fade = phase.phase === 'recover' || phase.phase === 'dissolve' ? 1 - smooth(phase.k) : 1;
      const settle = cast.landed === null ? 0 : smooth((tick - cast.landed) / 8);
      root.position.copy(from); root.rotation.y = Math.atan2(to.x - from.x, to.z - from.z); root.visible = true;
      for (let i = 0; i < clods.length; i++) {
        const clod = clods[i];
        clod.position.set(0.48 + (hash(i, 8) - 0.5) * (0.36 - 0.12 * build),
          0.045 + (0.08 + hash(i, 3) * 0.08) * build * (1 - settle),
          0.3 + (i - 4) * (0.075 - 0.025 * build) + settle * 0.12);
        clod.material.opacity = build * fade * 0.9; clod.visible = clod.material.opacity > 0.001;
      }
    },
    clear() { cast = null; hide(); },
  };
}
