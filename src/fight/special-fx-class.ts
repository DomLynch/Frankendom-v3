import * as THREE from 'three';
import type { CombatEvent, Fighter } from './duel.ts';
import type { OpponentId } from '../roster.ts';
import { advanceCast, castPhase, LAND_AT, type Cast, type isHadesShadow } from './special-timing.ts';
import { DRAG_FROM, STEP_BEATS, walkLateral, walkOffset, type ClassSpecial } from './special-class-timing.ts';
import { clamp01, hash, noise, smooth } from './fx-math.ts';

// The class specials of the Witch, the Plague Doctor and the Knight, ranks 1-3 (slot A) and 4-7 (slot B), GREY-BOX PREVIEWS (Weapons lane; Dom picked the six ★ takes on
// 2026-10-01: docs/briefs/specials/class-specials-witch-pd-knight-2026-10-01.md). Same seam as Red Wind and the Shield Quake (special-timing.ts): it reads the sim's special events,
// each side's feet and, for the two that walk, the caster's rig anchor; never the sim, the rig root or Math.random (every "random" is an index hash). Dom's rules: 20 % of max health,
// every 20 s, unblockable, ~2 s wind-up, grounded, smaller than the boss specials, NOTHING pale or glowing: every mark here is a decal or a grain DARKER THAN THE FLOOR, made of the
// arena's own sand. One clean idea each:
//   wake     Witch A, Stone Wake     the staff foot drags a dark damp furrow along the sand to the foe; it ends in a scuffed patch under him.
//   stirring Witch B, Stirring       dark stirred sand circles the foe's feet in two counter-turning rings that tighten, then burst.
//   tempo    Plague Doctor A         three measured steps (anchor walk-in, a pair of dark footprints per beat), the thrust on the third.
//   pulse    Plague Doctor B         a torn dark ring round the foe's feet thumps on three beats, tighter each time; the third is the blow.
//   drag     Knight A, Ground Drag   he walks in dragging the maul head: a rutted trench behind it, clods flicked up, a heave on the landing.
//   swing    Knight B, Held Swing    he winds back and holds: dark sand shivers round his feet, grit hangs; then one wide swept arc of it.
// Any cast of the opponent's side: a page that asks for this effect has no other special running (Hades' own test stays the default everywhere else).
export const isClassCast: typeof isHadesShadow = (_opponent, actor) => actor === 1;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

// A torn dark blob, white so the material's colour tints it: alpha falls off from a noise-bitten rim and reaches nothing at the sprite's edge. `long` stretches it along its length.
function blob(seed: number, long = 1, tapered = false) {
  const n = 48, px = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x - 23.5) / 23.5, v = (y - 23.5) / 23.5, r = Math.hypot(tapered ? (u + Math.sin(v * 5 + seed) * 0.12) / (0.24 + 0.5 * (1 - v) / 2) : u, v / long) + (noise(u * 3 + 4, v * 3 + 4, seed) - 0.5) * 0.8;
    px.set([255, 255, 255, 255 * Math.min(1, smooth((1 - r) * 1.7) * (0.6 + 0.4 * noise(x * 0.25, y * 0.25, seed + 3)) * smooth((1 - Math.max(Math.abs(u), Math.abs(v))) * 4))], (y * n + x) * 4);
  }
  const map = new THREE.DataTexture(px, n, n); map.magFilter = map.minFilter = THREE.LinearFilter; map.needsUpdate = true; return map;
}
function grain() {
  const n = 12, px = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) px.set([255, 255, 255, 255 * clamp01((1 - Math.hypot(x - 5.5, y - 5.5) / 6) * 3)], (y * n + x) * 4);
  const map = new THREE.DataTexture(px, n, n); map.needsUpdate = true; return map;
}

// Darker than the floor, day and night: the dim Night Pit (exposure above 1.5) has a darker clay, so its marks go darker still: the first Pit films (c56fc0ce) read olive and lighter than the shadowed floor, so the Pit palette is near-black and neutral. Linear working-space colours, no glow.
export const classLook = (exposure: number) => exposure > 1.5
  ? { core: new THREE.Color(0.007, 0.005, 0.004), edge: new THREE.Color(0.02, 0.014, 0.01) }
  : { core: new THREE.Color(0.035, 0.019, 0.01), edge: new THREE.Color(0.1, 0.058, 0.03) };

const DECALS = 48, GRIT = 72;
// The camera sits behind the player, so a mark along the line between the fighters is foreshortened and half hidden by his body: the walking and in-line specials draw bigger (first clip, 2026-10-02: the drag's trench and the Doctor's prints were not seen).
const BIG: Record<ClassSpecial, number> = { wake: 1.15, stirring: 1, tempo: 2, pulse: 1.3, drag: 0.9, swing: 1.7 };
// `age`: ticks since the cast began (LAND_AT is the blow); `rel`: ticks since the landing, -1 before it; `life`: 1 until the landing then 0 over the recover.
type Stage = { age: number; rel: number; life: number };
type Place = { from: THREE.Vector3; to: THREE.Vector3; home: THREE.Vector3; heading: number; dir: THREE.Vector3; dist: number };

export type ClassFx = ReturnType<typeof createClassSpecial>;
export function createClassSpecial(scene: THREE.Scene, opponent: OpponentId, kind: ClassSpecial, exposure: number) {
  const look = classLook(exposure);
  const root = new THREE.Group(); root.name = 'special fx'; root.visible = false; scene.add(root);
  const maps = kind === 'drag' ? [3, 17, 29, 41].map((seed) => blob(seed, 1, true)) : [blob(3), blob(17), blob(29, 2.4), blob(41, 2.4)];
  const decals = Array.from({ length: DECALS }, (_, i) => {
    const mat = new THREE.MeshBasicMaterial({ map: maps[i % maps.length], color: i % 3 === 2 ? look.edge : look.core, transparent: true, opacity: 0, depthWrite: false, fog: true, side: THREE.DoubleSide });
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat); mesh.name = 'class decal'; mesh.frustumCulled = false; mesh.visible = false; root.add(mesh); return mesh;
  });
  const grit = new Float32Array(GRIT * 3), gritGeo = new THREE.BufferGeometry();
  gritGeo.setAttribute('position', new THREE.BufferAttribute(grit, 3).setUsage(THREE.DynamicDrawUsage));
  const gritMat = new THREE.PointsMaterial({ size: kind === 'drag' ? 0.055 : 0.15, sizeAttenuation: true, map: grain(), color: look.edge, transparent: true, opacity: 0, depthWrite: false, fog: true });
  const gritPoints = new THREE.Points(gritGeo, gritMat); gritPoints.name = 'class grit'; gritPoints.frustumCulled = false; root.add(gritPoints);

  // One decal lying on the sand at (x, z): `w` wide, `l` long along the yaw (+z turned by `yaw`); one grain at (x, y, z).
  const put = (i: number, x: number, z: number, w: number, l: number, yaw: number, op: number) => {
    const m = decals[i]; w *= BIG[kind]; l *= BIG[kind]; m.position.set(x, 0.03 + i * 0.0006, z); m.rotation.y = yaw; m.scale.set(w, 1, l); (m.material as THREE.MeshBasicMaterial).opacity = clamp01(op * (kind === 'drag' && exposure > 1.5 ? 1.45 : 1)) * 0.95; m.visible = op > 0.01;
  };
  const speck = (i: number, x: number, y: number, z: number) => { grit[i * 3] = x; grit[i * 3 + 1] = y; grit[i * 3 + 2] = z; };
  const ring = (i0: number, n: number, c: THREE.Vector3, radius: number, turn: number, op: number, w: number, l: number, salt: number) => {   // n torn dashes round c, each lying along the circle
    for (let i = 0; i < n; i++) {
      const a = turn + (i / n) * Math.PI * 2 + (hash(i, salt) - 0.5) * 0.35, r = radius * (0.92 + 0.16 * hash(i, salt + 1));
      put(i0 + i, c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, w * (0.8 + 0.4 * hash(i, salt + 2)), l * (0.8 + 0.5 * hash(i, salt + 3)), Math.atan2(-Math.sin(a), Math.cos(a)), op);
    }
  };
  // A fountain of grains from a point, gravity pulling them back: `s` seconds since it began.
  const burst = (i0: number, n: number, c: THREE.Vector3, s: number, spread: number, salt: number, up = 2.4) => {
    for (let i = 0; i < n; i++) {
      const th = hash(i, salt) * Math.PI * 2, r = (0.1 + 0.9 * hash(i, salt + 1)) * spread * Math.min(1, s * 2.5), v = up * (0.5 + 0.7 * hash(i, salt + 2));
      speck(i0 + i, c.x + Math.cos(th) * r, s <= 0 ? -9 : Math.max(0.02, v * s - 4.5 * s * s), c.z + Math.sin(th) * r);
    }
  };
  const hold = new THREE.Vector3(), lat = new THREE.Vector3(), tmp = new THREE.Vector3(), perp = new THREE.Vector3(), shift = new THREE.Vector3();

  const effects: Record<ClassSpecial, (s: Stage, p: Place) => void> = {
    wake(s, p) {   // the staff foot drags a furrow from her to him: the front runs from age 56 and arrives on the landing; the furrow stays and fades with the recover
      const front = smooth((s.age - 56) / (LAND_AT - 56)) * p.dist, N = 14;
      perp.set(-p.dir.z, 0, p.dir.x);
      for (let i = 0; i < N; i++) {
        const along = 0.5 + ((i + 0.5) / N) * Math.max(0.3, p.dist - 1.0), sway = Math.sin(along * 3.2) * 0.5 + (hash(i, 5) - 0.5) * 0.22;   // it snakes, so the camera behind the player sees it pass beside him, not behind his back
        put(i, p.home.x + p.dir.x * along + perp.x * sway, p.home.z + p.dir.z * along + perp.z * sway, 0.34 + 0.16 * hash(i, 6), 0.7 + 0.3 * hash(i, 7), p.heading + Math.cos(along * 3.2) * 0.9 + (hash(i, 8) - 0.5) * 0.25, smooth((front - along) / 0.4) * 0.85 * s.life);
      }
      const head = tmp.copy(p.home).addScaledVector(p.dir, 0.5 + Math.min(front, p.dist - 0.5));
      for (let i = 0; i < 24; i++) speck(i, head.x + (hash(i, 9) - 0.5) * 0.5, s.rel < 0 && front > 0.05 ? 0.03 + 0.2 * Math.abs(Math.sin(s.age * 0.3 + i)) * hash(i, 10) : -9, head.z + (hash(i, 11) - 0.5) * 0.5);
      ring(N, 6, p.to, 0.45, 0.4, s.rel >= 0 ? smooth(s.rel / 6) * s.life : 0, 0.5, 0.8, 21);   // the scuffed patch under him
      burst(24, 40, p.to, s.rel >= 0 ? s.rel / 60 : 0, 0.9, 31);
    },
    stirring(s, p) {   // two rings of stirred sand turn opposite ways round his feet, tightening to the landing; the burst throws them up
      const k = smooth((s.age - 50) / (LAND_AT - 50)), r = s.rel >= 0 ? lerp(0.55, 0.95, smooth(s.rel / 20)) : lerp(1.5, 0.55, k), op = (s.rel >= 0 ? s.life : smooth((s.age - 38) / 22)) * 0.9;
      ring(0, 12, p.to, r, s.age * 0.045, op, 0.3, 0.75, 41); ring(12, 8, p.to, r * 0.6, -s.age * 0.06, op, 0.26, 0.6, 61);
      burst(0, 36, p.to, s.rel >= 0 ? s.rel / 60 : 0, 0.8, 71, 2.0);
    },
    tempo(s, p) {   // he backs off, then three beats in: two pairs of dark footprints and a broad dark puff each, laid in the open ground behind him and left there; the anchor walks him (applied in render)
      perp.set(-p.dir.z, 0, p.dir.x);
      STEP_BEATS.forEach((b, n) => {
        const seen = smooth((s.age - b) / 4) * 0.9 * s.life;
        for (let j = 0; j < 2; j++) {
          tmp.copy(p.home).addScaledVector(p.dir, walkOffset('tempo', b, p.dist) + (j ? 0.26 : -0.26));
          for (let side = 0; side < 2; side++) put(n * 5 + j * 2 + side, tmp.x + perp.x * (side ? 0.15 : -0.15), tmp.z + perp.z * (side ? 0.15 : -0.15), 0.3, 0.7, p.heading, seen);
        }
        tmp.copy(p.home).addScaledVector(p.dir, walkOffset('tempo', b, p.dist));
        put(n * 5 + 4, tmp.x, tmp.z, 1.1, 1.1, hash(n, 3) * 3, smooth((s.age - b) / 3) * 0.85 * s.life);
        const t = (s.age - b) / 60;
        for (let i = 0; i < 10; i++) speck(n * 10 + i, tmp.x + (hash(i + n * 9, 4) - 0.5) * 0.6, t < 0 || t > 0.6 ? -9 : 0.03 + 0.5 * t * (1 - t) * hash(i, 5), tmp.z + (hash(i + n * 9, 6) - 0.5) * 0.6);
      });
      burst(30, 24, p.to, s.rel >= 0 ? s.rel / 60 : 0, 0.7, 81, 1.8);
    },
    pulse(s, p) {   // a torn ring that thumps three times and draws in; the third thump is the blow
      const beats = [50, 84, LAND_AT], thump = (a: number) => Math.max(...beats.map((b) => (a >= b ? Math.exp(-(a - b) / 6) : 0))), n = beats.filter((b) => s.age >= b).length;
      const r = s.rel >= 0 ? lerp(0.4, 0.8, smooth(s.rel / 18)) : lerp(1.15, 0.55, smooth((s.age - 40) / 79)) * (1 - 0.14 * thump(s.age));
      ring(0, 16, p.to, r, 0.3, (s.rel >= 0 ? s.life : smooth((s.age - 36) / 14) * (0.55 + 0.15 * n)) * 0.95, 0.3, 0.55, 91);
      for (let i = 0; i < 48; i++) { const a = hash(i, 92) * Math.PI * 2, rr = r * (0.7 + 0.5 * hash(i, 93)); speck(i, p.to.x + Math.cos(a) * rr, thump(s.age) > 0.05 ? 0.03 + 0.35 * thump(s.age) * hash(i, 94) : -9, p.to.z + Math.sin(a) * rr); }
      burst(48, 24, p.to, s.rel >= 0 ? s.rel / 60 : 0, 0.6, 95, 1.8);
    },
    drag(s, p) {   // a thin broken scrape follows the maul, with low loose grit; it never forms a wall beside the caster
      const N = 10, last = LAND_AT - 8;
      perp.set(-p.dir.z, 0, p.dir.x);
      const at = (age: number, out: THREE.Vector3) => out.copy(p.home).addScaledVector(p.dir, walkOffset('drag', age, p.dist) + 0.55).addScaledVector(perp, walkLateral('drag', age));
      for (let i = 0; i < N; i++) {
        const a = DRAG_FROM + ((i + (i > 0 && i < N - 1 ? (hash(i, 20) - 0.5) * 0.6 : 0)) / (N - 1)) * (last - DRAG_FROM), here = at(a, tmp), ahead = at(a + 4, shift), yaw = Math.atan2(ahead.x - here.x, ahead.z - here.z), shown = smooth((s.age - a) / 5) * s.life;
        const sx = Math.cos(yaw), sz = -Math.sin(yaw);   // across the path
        put(i, here.x, here.z, 0.13 + 0.07 * hash(i, 21), 0.28 + 0.17 * hash(i, 12), yaw + (hash(i, 22) - 0.5) * 0.45, shown * 0.65);
        const side = i % 2 ? 0.12 : -0.12;
        put(N + i, here.x + sx * side, here.z + sz * side, 0.06, 0.25, yaw + (hash(i, 13) - 0.5) * 0.2, shown * 0.4);
      }
      const head = at(s.age, tmp);
      for (let i = 0; i < 12; i++) { const t = ((s.age * 0.05 + hash(i, 14)) % 1), live = s.rel < 0 && s.age >= DRAG_FROM; speck(i, head.x + (hash(i, 15) - 0.5) * 0.2, live ? 0.03 + 0.08 * 4 * t * (1 - t) * hash(i, 16) : -9, head.z + (hash(i, 17) - 0.5) * 0.2); }
      ring(3 * N, 6, p.to, 0.35, 0.7, s.rel >= 0 ? smooth(s.rel / 6) * s.life * 0.5 : 0, 0.18, 0.3, 18);
      burst(12, 16, tmp.copy(p.to).addScaledVector(p.dir, -0.9), s.rel >= 0 ? s.rel / 60 : 0, 0.45, 19, 0.65);
    },
    swing(s, p) {   // wound back and held: dark sand shivers round his feet and grit hangs in the still air; then one wide arc sweeps out of it
      const still = smooth((s.age - 30) / 30), shiver = still * (s.rel < 0 ? 1 : 0), tick = Math.floor(s.age / 3);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + (hash(i, 22) - 0.5) * 0.4, r = 0.75 * (0.85 + 0.3 * hash(i, 23)) + shiver * 0.05 * (hash(i + tick * 7, 24) - 0.5);
        put(i, p.home.x + Math.cos(a) * r, p.home.z + Math.sin(a) * r, 0.28, 0.6, Math.atan2(-Math.sin(a), Math.cos(a)), smooth((s.age - 50) / 40) * 0.8 * (s.rel >= 0 ? s.life : 1));
      }
      for (let i = 0; i < 40; i++) { const a = hash(i, 25) * Math.PI * 2, r = 0.2 + 0.8 * hash(i, 26); speck(i, p.home.x + Math.cos(a) * r, s.rel < 0 && still > 0.02 ? 0.1 + 0.8 * hash(i, 27) * still + 0.015 * Math.sin(s.age * 0.5 + i) : -9, p.home.z + Math.sin(a) * r); }
      const sweep = s.rel >= 0 ? smooth(s.rel / 10) : 0;   // the arc: from one side of him across the front to the other
      for (let i = 0; i < 18; i++) {
        const a = p.heading - 0.95 + (i / 17) * 1.9 * sweep, r = 0.8 + 0.9 * smooth(s.rel / 14) + 0.25 * hash(i, 28), x = p.home.x + Math.sin(a) * r, z = p.home.z + Math.cos(a) * r;
        put(14 + i, x, z, 0.34, 0.7, a + Math.PI / 2, (i / 17 <= sweep ? 1 : 0) * s.life * 0.9);
        speck(40 + i, x, s.rel >= 0 ? 0.05 + 0.25 * hash(i, 29) * (1 - smooth(s.rel / 40)) : -9, z);
      }
    },
  };

  const place: Place = { from: new THREE.Vector3(), to: new THREE.Vector3(), home: new THREE.Vector3(), heading: 0, dir: new THREE.Vector3(), dist: 0 };
  let cast: Cast | null = null, clock = 0, lastTick = -1, have = false, homed = false;
  let host: THREE.Object3D | null = null, shifted = false;
  const inverse = new THREE.Quaternion();
  const hide = () => { for (const m of decals) m.visible = false; grit.fill(-9); gritMat.opacity = 0; };
  // The walking specials write the caster's anchor ABSOLUTELY every frame (characters.ts zeroes anchor.position in update(), so a delta would collapse): the offset is a world vector off his sim spot.
  const restore = () => { if (host && shifted) host.position.set(0, 0, 0); shifted = false; };

  return {
    // After the poses are final: `feet` each side's feet (null while a rig loads), `anchor` the caster's rig anchor (the opponent's), `yielding` true while a finisher plays.
    render(dt: number, events: readonly CombatEvent[], fighters: readonly [Fighter, Fighter], tick: number, feet: readonly [THREE.Vector3 | null, THREE.Vector3 | null], yielding: boolean, anchor: THREE.Object3D | null = null) {
      if (anchor !== host) { restore(); host = anchor; }
      clock = tick !== lastTick ? tick : Math.min(tick + 1, clock + dt * 60); lastTick = tick;
      const before = cast;
      cast = advanceCast(cast, events, fighters, tick, opponent, yielding, isClassCast);
      if (!before && cast) homed = false;
      const a = cast ? feet[cast.actor] : null, b = cast ? feet[1 - cast.actor] : null;
      if (cast && a && b) {
        if (!homed) { place.home.copy(a).setY(0); homed = true; }
        place.from.copy(a); place.to.copy(b).setY(0);
        place.dir.copy(place.to).sub(place.home).setY(0); place.dist = Math.max(1.2, place.dir.length()); place.dir.normalize(); place.heading = Math.atan2(place.dir.x, place.dir.z); have = true;
      }
      root.visible = !!cast && have;
      if (!cast || !have) { hide(); restore(); return; }
      const p = castPhase(cast, clock), frozen = p.phase === 'dissolve' ? castPhase({ ...cast, fizzled: null }, cast.fizzled!) : p, fade = 1 - (p.phase === 'dissolve' ? smooth(p.k) : 0);
      const rel = p.phase === 'recover' ? p.age : -1, age = rel >= 0 ? LAND_AT + rel : frozen.age, life = (rel >= 0 ? 1 - smooth((rel - 6) / 36) : 1) * fade;
      hide(); effects[kind]({ age, rel, life }, place);
      gritMat.opacity = life * (kind === 'drag' ? 0.35 : 1); (gritGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      if (host?.parent && (kind === 'tempo' || kind === 'drag')) {   // the walk: backs off, then stepwise for the Doctor / one drag for the Knight, gliding home over the recover
        shift.copy(place.dir).multiplyScalar(walkOffset(kind, age, place.dist)).addScaledVector(lat.set(-place.dir.z, 0, place.dir.x), walkLateral(kind, age)).multiplyScalar(rel >= 0 ? life : 1);
        inverse.copy(host.parent.quaternion).invert(); hold.copy(shift).applyQuaternion(inverse); host.position.copy(hold); shifted = true;
      } else restore();
    },
    clear() { cast = null; have = false; homed = false; root.visible = false; hide(); restore(); },
  };
}
