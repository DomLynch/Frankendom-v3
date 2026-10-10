import * as THREE from 'three';
import type { CombatEvent, Fighter } from './duel.ts';
import type { OpponentId } from '../roster.ts';
import { advanceCast, type Cast } from './special-timing.ts';
import { nightfall } from './nightfall-timing.ts';

// Nyx's Nightfall, the in-game effect (World, 2026-09-30; Lead's brief, Dom GO). Presentation only, like special-fx.ts beside it: it reads the
// sim's special events and the fighters' Head bones, never the sim, a rig or Math.random. The wow is the whole arena going dark, so the drain
// is one number on the renderer's exposure (which dims the lit sand and stone, the unlit sky dome and the additive flames alike, at no
// per-frame cost); the scene multiplies its draw exposure by `exposure`. Two things keep the fight readable in the dark: a cold moon rim
// light (one DirectionalLight, no shadow, built here at load so no shader recompiles mid-cast) that brightens as the arena dims, and a
// floor on the exposure. At release a veil of darkness (a ragged cloak curtain plus its shadow on the sand, both unlit and not tone-mapped so
// they read against the returning light) sweeps from the caster through the target. The target's stagger is scene.ts's specialStruck.
// Loaded lazily by the scene only on `?special=nyx`; no GLB, no shadow casting.
export const FLOOR = 0.07;   // exposure at full drain: near-black, never black
const RIM_NET = 0.65;   // the rim's visible strength at full drain, in the theme's own exposure units (its light is scaled up to beat the dimmed exposure)
const smooth = (k: number) => k * k * (3 - 2 * k);   // UNCLAMPED on purpose: not fx-math's smooth (that one clamps to 0..1); kept so this effect renders exactly as before

// The cloak: near-black cloth, ragged along its lower edge, with a cold glint on the edges so it shows in the dark.
function veilTexture() {
  const w = 64, h = 32, pixels = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / (w - 1), v = y / (h - 1), edge = 0.16 + 0.1 * Math.sin(u * 24) + 0.07 * Math.sin(u * 61 + 1.3), i = (y * w + x) * 4;
    const below = (v - edge) / 0.08, above = (1 - v) / 0.1, alpha = Math.min(1, Math.max(0, below)) * Math.min(1, Math.max(0, above)) * (0.9 + 0.1 * Math.sin(u * 9 + v * 5));
    const glint = Math.min(1, Math.max(0, 1 - Math.abs(below - 0.35) * 1.6, 1 - above)) ** 2;   // clamped: an 8-bit channel wraps
    pixels.set([8 + 60 * glint, 8 + 78 * glint, 14 + 130 * glint, 255 * alpha], i);
  }
  const map = new THREE.DataTexture(pixels, w, h); map.colorSpace = THREE.SRGBColorSpace; map.needsUpdate = true; map.magFilter = map.minFilter = THREE.LinearFilter;
  return map;
}
function shadowTexture() {
  const s = 32, pixels = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) pixels.set([0, 0, 0, 255 * Math.max(0, 1 - Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5)) ** 1.4], (y * s + x) * 4);
  const map = new THREE.DataTexture(pixels, s, s); map.needsUpdate = true; map.magFilter = map.minFilter = THREE.LinearFilter;
  return map;
}

export type NightfallFx = ReturnType<typeof createNightfallFx>;
export function createNightfallFx(scene: THREE.Scene, camera: THREE.Camera, opponent: OpponentId) {
  const root = new THREE.Group(); root.name = 'nightfall'; root.visible = false; scene.add(root);
  const moon = new THREE.DirectionalLight('#8aa0e8', 0); moon.name = 'nightfall moon'; moon.castShadow = false; scene.add(moon, moon.target);
  const cloth = new THREE.PlaneGeometry(3.4, 2.4, 14, 6), rest = Float32Array.from(cloth.attributes.position.array);
  const veil = new THREE.Mesh(cloth, new THREE.MeshBasicMaterial({ map: veilTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
  veil.name = 'nightfall veil'; veil.castShadow = veil.receiveShadow = false; veil.frustumCulled = false; root.add(veil);
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.6), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }));
  skirt.name = 'nightfall shadow'; skirt.rotation.x = -Math.PI / 2; skirt.castShadow = skirt.receiveShadow = false; skirt.frustumCulled = false; root.add(skirt);
  const background = scene.background instanceof THREE.Color ? scene.background.clone() : null;   // the theme's own, put back exactly when the dark ends
  const from = new THREE.Vector3(), to = new THREE.Vector3(), dir = new THREE.Vector3(), mid = new THREE.Vector3(), forward = new THREE.Vector3();
  let cast: Cast | null = null, clock = 0, lastTick = -1, exposure = 1;
  const heads: (THREE.Vector3 | null)[] = [null, null];

  function apply(drain: number) {
    exposure = 1 - (1 - FLOOR) * drain;
    if (background && scene.background instanceof THREE.Color) scene.background.copy(background).multiplyScalar(exposure);
    moon.intensity = drain > 0 ? RIM_NET * drain / exposure : 0;
    if (drain > 0 && heads[0] && heads[1]) {   // behind the pair and to the side, low: it rims the edges the camera sees, and barely lights the sand
      mid.addVectors(heads[0], heads[1]).multiplyScalar(0.5); mid.y = 1;
      forward.subVectors(mid, camera.position).setY(0).normalize();
      moon.position.set(mid.x + forward.x * 10 - forward.z * 7, mid.y + 4, mid.z + forward.z * 10 + forward.x * 7); moon.target.position.copy(mid);
    }
  }

  return {
    // After the poses are final, as special-fx.ts: `tick` is this frame's sim tick, `heads` each side's Head bone in world space (null while a rig loads).
    render(dt: number, events: readonly CombatEvent[], fighters: readonly [Fighter, Fighter], tick: number, headBones: readonly [THREE.Vector3 | null, THREE.Vector3 | null], yielding: boolean) {
      clock = tick !== lastTick ? tick : Math.min(tick + 1, clock + dt * 60); lastTick = tick;   // smooth between sim ticks, never ahead by more than one
      cast = advanceCast(cast, events, fighters, tick, opponent, yielding);
      heads[0] = headBones[0]; heads[1] = headBones[1];
      const state = cast ? nightfall(cast, clock) : { drain: 0, veil: null };
      apply(state.drain);
      const caster = cast ? heads[cast.actor] : null, target = cast ? heads[1 - cast.actor] : null, k = state.veil;
      root.visible = k !== null && !!caster && !!target;
      if (!root.visible || k === null || !caster || !target) return;
      from.set(caster.x, 0, caster.z); to.set(target.x, 0, target.z); dir.subVectors(to, from).setY(0);
      const distance = Math.max(dir.length(), 0.5); dir.normalize();
      const travel = 1 - (1 - k) ** 2, at = travel * (distance + 3.5), fade = Math.min(1, k / 0.12, (1 - k) / 0.25);   // thrown: fast off the hand, easing out past him
      const width = 0.7 + 0.7 * k, height = 0.85 + 0.15 * k;
      veil.position.set(from.x + dir.x * at, 0.05 + 1.2 * height, from.z + dir.z * at); veil.rotation.y = Math.atan2(dir.x, dir.z); veil.scale.set(width, height, 1);
      const position = cloth.attributes.position as THREE.BufferAttribute, phase = clock * 0.35;
      for (let i = 0; i < position.count; i++) position.setZ(i, Math.sin(rest[i * 3] * 2.2 + phase) * 0.22 * (0.4 + 0.6 * (1 - (rest[i * 3 + 1] + 1.2) / 2.4)));   // the hem trails behind the head of the cloak
      position.needsUpdate = true;
      (veil.material as THREE.MeshBasicMaterial).opacity = 0.96 * smooth(Math.max(0, fade));
      skirt.position.set(veil.position.x - dir.x * 0.5, 0.03, veil.position.z - dir.z * 0.5); skirt.rotation.z = Math.atan2(dir.x, dir.z); skirt.scale.set(width, 1, 1);
      (skirt.material as THREE.MeshBasicMaterial).opacity = 0.85 * smooth(Math.max(0, fade));
    },
    // What the scene multiplies its draw exposure by this frame (1 = the theme's own light).
    get exposure() { return exposure; },
    clear() { cast = null; apply(0); root.visible = false; },
  };
}
