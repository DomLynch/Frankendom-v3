import * as THREE from 'three';
import type { CombatEvent, Fighter } from './duel.ts';
import type { OpponentId } from '../roster.ts';
import { advanceCast, shadowPhase, type Cast } from './special-timing.ts';
import { hash } from './fx-math.ts';

// Hades' Shadow, the in-game effect (Finishers, 2026-09-29; brief docs/briefs/special-moves-hades-pilot.md; timing agreed with Combat in
// special-timing.ts; 2026-09-30, Dom: "the black cloud is enough", the cloud is the whole move). Presentation only: it reads the sim's special events and the
// target's Head bone, never the sim, the rig root or Math.random (gore's seeded sequence stays untouched: every "random" here is an index hash).
// Loaded lazily by the scene only in a fight that has Special Moves. A black cloud of soft sprites gathers ABOVE the target's head through the
// windup, drops onto it so it arrives on the landing tick with a dark burst, closes over the head, then thins and clears (a fizzle just dissolves
// it where it hangs). A violet-grey halo bank under the black keeps it readable on the Night Pit's dark floor.
const CLOUD = 14, HALO = 8, BURST = 20, BURST_LIFE = 0.55;
// Metres above the target's Head bone: the cloud's centre while it gathers, and when it covers the head.
export const CLOUD_HIGH = 0.7, CLOUD_LOW = 0.12;
const smooth = (k: number) => k * k * (3 - 2 * k);   // UNCLAMPED on purpose: not fx-math's smooth (that one clamps to 0..1); kept so this effect renders exactly as before

function puffTexture() {
  const size = 64, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x - 31.5) / 31.5, v = (y - 31.5) / 31.5, r = Math.hypot(u, v), i = (y * size + x) * 4;
    const churn = 0.7 + 0.3 * Math.sin(x * 0.37 + Math.sin(y * 0.23) * 3) * Math.cos(y * 0.29 - x * 0.11);
    pixels.set([255, 255, 255, 255 * Math.max(0, 1 - r) ** 1.6 * churn], i);
  }
  const map = new THREE.DataTexture(pixels, size, size); map.needsUpdate = true; map.magFilter = map.minFilter = THREE.LinearFilter;
  return map;
}

export type SpecialFx = ReturnType<typeof createSpecialFx>;
export function createSpecialFx(scene: THREE.Scene, opponent: OpponentId) {
  const map = puffTexture(), root = new THREE.Group(); root.name = 'special fx'; root.visible = false; scene.add(root);
  const puff = (color: string) => new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity: 0, depthWrite: false, fog: true }));
  const over = (s: THREE.Sprite, order: number) => { s.material.depthTest = false; s.renderOrder = order; return s; };   // over the fighter it sits on, not clipped by his head
  const halo = Array.from({ length: HALO }, (_, i) => { const s = over(puff('#3a3052'), 8); s.name = `halo ${i}`; root.add(s); return s; });
  const cloud = Array.from({ length: CLOUD }, (_, i) => { const s = over(puff(i % 3 ? '#0b0b10' : '#16141c'), 9); s.name = `cloud ${i}`; root.add(s); return s; });
  const burst = Array.from({ length: BURST }, (_, i) => { const s = puff('#070709'); s.name = `burst ${i}`; s.visible = false; root.add(s); return s; });
  const burstLife = new Float32Array(BURST), burstVelocity = burst.map(() => new THREE.Vector3());
  const head = new THREE.Vector3(), anchor = new THREE.Vector3();
  let cast: Cast | null = null, clock = 0, lastTick = -1, haveHead = false;

  function fireBurst(at: THREE.Vector3) {
    burst.forEach((s, i) => {
      const a = hash(i, 1) * Math.PI * 2, speed = 1.1 + hash(i, 2) * 1.2;
      burstVelocity[i].set(Math.cos(a) * speed, -0.25 + hash(i, 3) * 1.1, Math.sin(a) * speed);
      s.position.copy(at); burstLife[i] = BURST_LIFE * (0.7 + 0.3 * hash(i, 4)); s.visible = true;
    });
  }

  return {
    // After the poses are final: `tick` is the sim tick of this frame, `heads` each side's Head bone in world space (null while a rig loads),
    // `yielding` true while a finisher plays (no new cast starts; one in flight finishes, per Combat's double-kill rule).
    render(dt: number, events: readonly CombatEvent[], fighters: readonly [Fighter, Fighter], tick: number, heads: readonly [THREE.Vector3 | null, THREE.Vector3 | null], yielding: boolean) {
      clock = tick !== lastTick ? tick : Math.min(tick + 1, clock + dt * 60); lastTick = tick;   // smooth between sim ticks, never ahead by more than one
      const before = cast;
      cast = advanceCast(cast, events, fighters, tick, opponent, yielding);
      if (cast && cast.landed !== null && before?.landed === null) fireBurst(head);
      const target = cast ? heads[1 - cast.actor] : null;
      if (target) { head.copy(target); haveHead = true; }
      for (let i = 0; i < BURST; i++) {
        const s = burst[i]; if (!s.visible) continue;
        burstLife[i] -= dt; if (burstLife[i] <= 0) { s.visible = false; continue; }
        const k = 1 - burstLife[i] / BURST_LIFE; burstVelocity[i].y -= 2.2 * dt;
        s.position.addScaledVector(burstVelocity[i], dt); s.scale.setScalar(0.12 + 0.3 * k); (s.material as THREE.SpriteMaterial).opacity = 0.9 * (1 - k);
      }
      const bursting = burst.some((s) => s.visible);
      root.visible = (!!cast && haveHead) || bursting;
      if (!cast || !haveHead) { cloud.forEach((s) => (s.visible = false)); halo.forEach((s) => (s.visible = false)); return; }
      const p = shadowPhase(cast, clock), swirl = clock * 0.012;
      // Gathers high (spirals in, grows, darkens), drops accelerating onto the head and compacts on the way, closes over it on the landing (radius
      // opens around the head), holds there for the first third of the recover, then thins and tears outward.
      const build = p.phase === 'gather' ? smooth(p.k) : 1, recover = p.phase === 'recover', dissolve = p.phase === 'dissolve';
      const drop = p.phase === 'fall' ? p.k ** 2 : recover ? 1 : 0, cover = recover ? smooth(Math.min(1, p.k / 0.25)) : 0;
      const tear = recover ? smooth(Math.max(0, (p.k - 0.3) / 0.7)) : dissolve ? smooth(p.k) : 0, squeeze = p.phase === 'fall' ? 1 - 0.3 * drop : recover ? 0.7 + 0.5 * cover : 1;
      anchor.copy(head); anchor.y += CLOUD_HIGH + (CLOUD_LOW - CLOUD_HIGH) * drop;
      cloud.forEach((s, i) => {
        const a = i * 2.39996 + (1 - build) * 1.3 + swirl * (i % 2 ? 1 : -1), r = (0.14 + 0.42 * hash(i, 5)) * (1.8 - 0.8 * build) * squeeze + tear * (0.3 + 0.25 * hash(i, 6));
        s.position.set(anchor.x + Math.cos(a) * r, anchor.y + (hash(i, 7) - 0.5) * 0.16 + tear * 0.25 * hash(i, 8), anchor.z + Math.sin(a) * r);
        s.scale.setScalar((0.5 + 0.3 * hash(i, 9)) * (0.25 + 0.75 * build) * (1 + 0.35 * cover + 0.4 * tear));
        (s.material as THREE.SpriteMaterial).opacity = 0.9 * build * (1 - tear * tear);   // stays dense through the first half of the tear
        s.visible = true;
      });
      halo.forEach((s, i) => {   // a wider, fainter violet-grey bank under the black: the cloud's silhouette on a dark floor
        const a = i * 2.39996 + 0.7 + swirl * (i % 2 ? -0.7 : 0.7), r = (0.2 + 0.4 * hash(i, 11)) * (1.8 - 0.8 * build) * squeeze + tear * 0.4;
        s.position.set(anchor.x + Math.cos(a) * r, anchor.y + (hash(i, 12) - 0.5) * 0.2 + tear * 0.3 * hash(i, 13), anchor.z + Math.sin(a) * r);
        s.scale.setScalar((0.75 + 0.35 * hash(i, 14)) * (0.3 + 0.7 * build) * (1 + 0.3 * cover + 0.5 * tear));
        (s.material as THREE.SpriteMaterial).opacity = 0.3 * build * (1 - tear * tear);
        s.visible = true;
      });
    },
    clear() { cast = null; haveHead = false; root.visible = false; burst.forEach((s) => (s.visible = false)); },
  };
}
