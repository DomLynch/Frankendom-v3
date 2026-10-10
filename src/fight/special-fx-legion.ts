import * as THREE from 'three';
import type { CombatEvent, Fighter } from './duel.ts';
import type { OpponentId } from '../roster.ts';
import { advanceCast, shadowPhase, castPhase, isBloodTithe, LAND_AT, type Cast } from './special-timing.ts';
import { clamp01, hash, smooth } from './fx-math.ts';

// Accepted Centurion class B: Stand Fast, ranks 4-7 (levels 16-35), previewed at level 21.
// Combat owns the shared class selector; this effect observes Scutum Shove events only.
// Presentation only, in Charge's style (charge-fx.ts): it reads the sim's special events and each side's feet, never the sim, a rig or Math.random (every
// "random" is an index hash), so a frame is a pure function of the clock. Dom's bar: dark ink, nothing pale or glowing. Every mark is DARKER than the floor
// (churned wet sand, scuffed earth), low (knee height at most), semi-transparent, nothing additive, so both fighters stay readable. No prop is added.

// A churned blot: a soft disc eaten into by two sine swirls and an uneven rim (Charge's), so each mark is a smear of dirt, not a gradient.
function blot(seed: number) {
  const size = 64, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x - 31.5) / 31.5, v = (y - 31.5) / 31.5, r = Math.hypot(u, v), a = Math.atan2(v, u);
    // rim <= 0.86: alpha is zero before the texture's edge, so no sprite quad shows.
    const rim = 0.6 + 0.16 * Math.sin(a * 3 + seed * 2.1) + 0.1 * Math.sin(a * 7 + seed * 5.3), churn = 0.62 + 0.38 * Math.sin(x * 0.31 + Math.sin(y * 0.21 + seed) * 3.1) * Math.cos(y * 0.27 - x * 0.13 + seed * 1.7);
    pixels.set([255, 255, 255, 255 * Math.min(1, Math.max(0, 1 - r / rim) ** 1.3 * churn)], (y * size + x) * 4);
  }
  const map = new THREE.DataTexture(pixels, size, size); map.needsUpdate = true; map.magFilter = map.minFilter = THREE.LinearFilter;
  return map;
}

// Preview class A: one weighted heel mark and a short forward dirt kick.
export function createSetFoot(scene: THREE.Scene, opponent: OpponentId, exposure: number) {
  const root = new THREE.Group(); root.name = 'set foot'; root.visible = false; scene.add(root);
  const geometry = new THREE.PlaneGeometry(1, 1); geometry.rotateX(-Math.PI / 2);
  const marks = [3, 11, 23].map(seed => {
    const map = blot(seed), pixels = map.image.data as Uint8Array;
    for (let a = 3; a < pixels.length; a += 4) pixels[a] = Math.min(255, Math.max(0, (pixels[a] - 6) * 6));
    const material = new THREE.MeshBasicMaterial({ map, color: exposure > 1.5 ? new THREE.Color(0.002, 0.001, 0.0004) : new THREE.Color(0.004, 0.002, 0.001), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: true });
    const mesh = new THREE.Mesh(geometry, material); mesh.visible = false; root.add(mesh); return mesh;
  });
  let cast: Cast | null = null;
  const hide = () => { root.visible = false; for (const mark of marks) { mark.visible = false; mark.material.opacity = 0; } };
  return {
    render(_dt: number, events: readonly CombatEvent[], fighters: readonly [Fighter, Fighter], tick: number, feet: readonly [THREE.Vector3 | null, THREE.Vector3 | null], yielding: boolean) {
      if (yielding) { cast = null; hide(); return; }
      cast = advanceCast(cast, events, fighters, tick, opponent, false, isBloodTithe);
      const caster = feet[1], target = feet[0]; if (!cast || !caster || !target) { hide(); return; }
      const phase = shadowPhase(cast, tick), build = smooth(((cast.fizzled ?? tick) - cast.start) / 65);
      const kick = cast.landed === null ? 0 : smooth((tick - cast.landed) / 12), fade = phase.phase === 'recover' || phase.phase === 'dissolve' ? 1 - smooth(phase.k) : 1;
      root.position.copy(caster); root.rotation.y = Math.atan2(target.x - caster.x, target.z - caster.z); root.visible = true;
      const sideX = -Math.cos(root.rotation.y), sideZ = -Math.sin(root.rotation.y);   // clear ground beside the body shadow, continuous while turning
      marks.forEach((mark, i) => {
        const side = i === 0 ? 0.58 : 0.54 + (i - 1) * 0.12;
        mark.position.set(sideX * side, 0.025 + i * 0.003, sideZ * side + (i === 0 ? -0.06 : 0.22 + kick * (0.32 + i * 0.09)));
        mark.scale.set(i === 0 ? 1.0 * build : 0.22 + kick * 0.12, 1, i === 0 ? 1.1 * build : 0.3 + kick * 0.36);
        mark.material.opacity = (i === 0 ? build : kick) * fade * 0.95; mark.visible = mark.material.opacity > 0.001;
      });
    },
    clear() { cast = null; hide(); },
  };
}

const RING = 26;
export function createLegionSpecial(scene: THREE.Scene, opponent: OpponentId) {
  const root = new THREE.Group(); root.name = 'legion fx'; root.visible = false; scene.add(root);
  const bg = scene.background instanceof THREE.Color ? scene.background : null, night = !!bg && bg.r + bg.g + bg.b < 0.45;
  const ink = night ? ['#43221a', '#4d2a1d'] : ['#1f160b', '#281c0f'];   // the Pit: a dim warm-dark, not black (black is lost on its shadowed clay) and nothing pale   // dark earth, never grey and never lit: the Pit's is clay like its floor
  const tex = [0, 1, 2, 3].map(blot);
  const mark = (i: number) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex[i % 4], color: ink[i % 2], transparent: true, opacity: 0, depthWrite: false, fog: true, rotation: hash(i, 7) * Math.PI * 2 }));
    s.visible = false; s.frustumCulled = false; root.add(s); return s;
  };
  const ring = Array.from({ length: RING }, (_, i) => mark(i + 80));
  const show = (s: THREE.Sprite, x: number, y: number, z: number, size: number, opacity: number) => {
    s.visible = opacity > 0.004; if (!s.visible) return;
    s.position.set(x, y, z); s.scale.set(size, size * 0.7, 1); (s.material as THREE.SpriteMaterial).opacity = opacity;
  };
  const from = new THREE.Vector3(), to = new THREE.Vector3(), dir = new THREE.Vector3(), side = new THREE.Vector3();
  let cast: Cast | null = null, clock = 0, lastTick = -1, have = false;
  const hide = () => { for (const s of ring) s.visible = false; };
  const cap = night ? 0.75 : 0.88;   // semi-transparent: ink over sand, both fighters still read

  return {
    // `feet`: each side's feet on the ground (null while a rig loads). `yielding`: true while a finisher plays.
    render(dt: number, events: readonly CombatEvent[], fighters: readonly [Fighter, Fighter], tick: number, feet: readonly [THREE.Vector3 | null, THREE.Vector3 | null], yielding: boolean) {
      clock = tick !== lastTick ? tick : Math.min(tick + 1, clock + dt * 60); lastTick = tick;
      cast = advanceCast(cast, events, fighters, tick, opponent, yielding, isBloodTithe);   // his Scutum Shove is the cast; the shared test is Blood Tithe's
      const a = cast ? feet[cast.actor] : null, b = cast ? feet[1 - cast.actor] : null;
      if (a && b) { from.copy(a); to.copy(b); have = true; }
      root.visible = !!cast && have;
      if (!cast || !have) { hide(); return; }
      const p = castPhase(cast, clock), frozen = p.phase === 'dissolve' ? castPhase({ ...cast, fizzled: null }, cast.fizzled!) : p, fade = 1 - (p.phase === 'dissolve' ? smooth(p.k) : 0);
      const rel = p.phase === 'recover' ? p.age : -1, age = rel >= 0 ? LAND_AT + rel : frozen.age, after = rel >= 0 ? 1 - smooth((rel - 10) / 40) : 1;   // after: the marks thin through the aftermath
      dir.copy(to).sub(from).setY(0); const gap = Math.max(dir.length(), 0.9); dir.normalize(); side.set(-dir.z, 0, dir.x);
      // Stand Fast: for ~1 s a ring of dark dust is drawn IN round his own feet (the braced weight) and held tight; on the strike it is flung out toward the foe in a short fan.
      hide();
      const gather = smooth((age - (LAND_AT - 60)) / 52), fling = rel >= 0 ? clamp01(rel / 24) : 0;
      for (let i = 0; i < RING; i++) {
        const th = (i / RING) * Math.PI * 2 + (hash(i, 21) - 0.5) * 0.5, r = (1.15 - 0.7 * gather) * (0.8 + 0.4 * hash(i, 22)), size = 0.85 + 0.4 * hash(i, 23);
        if (rel < 0) { show(ring[i], from.x + Math.cos(th) * r, 0.04 + 0.05 * gather, from.z + Math.sin(th) * r, size * (0.6 + 0.4 * gather), gather * cap * fade); continue; }
        const reach = (0.3 + 0.7 * hash(i, 24)) * gap * (1 - (1 - fling) ** 2), lat = (hash(i, 25) - 0.5) * 1.1 * fling;   // flung along the line, the fan widening a little
        show(ring[i], from.x + Math.cos(th) * 0.45 * (1 - fling) + dir.x * reach + side.x * lat, 0.05 + 0.18 * Math.sin(fling * Math.PI) * hash(i, 26), from.z + Math.sin(th) * 0.45 * (1 - fling) + dir.z * reach + side.z * lat, size, (1 - fling) ** 0.8 * after * cap * fade);
      }
    },
    clear() { cast = null; have = false; root.visible = false; hide(); },
  };
}
