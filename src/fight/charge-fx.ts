import * as THREE from 'three';
import type { CombatEvent, Fighter } from './duel.ts';
import type { OpponentId } from '../roster.ts';
import { advanceCast, type Cast } from './special-timing.ts';
import { charge, CUE_AT, isCharge, RACE, RACE_FROM, slideAt } from './charge-timing.ts';
import { hash, smooth } from './fx-math.ts';

// The Centurion's Charge (Alexander, his rank-9 boss special), the in-game effect (World, 2026-10-01; Strategy's brief
// docs/briefs/specials/centurion-l8-l10-2026-10-01.md, Dom's pick). Presentation only, like nightfall-fx.ts beside it: it reads the sim's special
// events and the fighters' Head bones, never the sim, a rig or Math.random (every "random" is an index hash, so a frame is a pure function of the
// clock). No horse and no prop: a LOW line of sand-coloured dust races along the ground (knee height at most) with a hoof-strike puff kicked up
// every stride behind the front, reaches the target on the landing tick (the blow) and breaks once over his feet, gone ~0.5 s later. The
// caster stands where the sim keeps him; the line comes up out of the far side of him, so he reads as arriving out of it.
// Painted and irregular: every puff is its own churned blot at its own turn and size, none a perfect disc, a lit top over a darker shadowed
// underside. Semi-transparent and low, so it never hides both fighters; no glow, nothing additive. Hoof sound is Audio's (CUE_AT).
// Loaded lazily by the scene only on `?special=centurion`.
const HOOF = 18, BURST = 20, GRAIN = 20, STREAK = 24;   // STREAK: sprites in the continuous dark trail behind his feet
const LEAD = 2.0;   // metres the line begins behind the caster, and how far back his body is drawn at the start of the race: near enough that it is on the phone's screen (3.2 ran off the top)
const WORLD = new THREE.Vector3();   // scratch for the caster's slid anchor, set and consumed within the frame
const STRIDE = 0.36, LIFE = 2.0, BURST_RUN = 1.6;   // metres between hoof strikes; metres of front a strike's puff lives; how far the burst rolls out

// A churned blot: a soft disc eaten into by two sine "swirls" and an uneven rim, so each puff is a smear of dust, not a gradient.
function dustTexture(seed: number, grain: boolean) {
  const size = 64, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x - 31.5) / 31.5, v = (y - 31.5) / 31.5, r = Math.hypot(u, v), a = Math.atan2(v, u), i = (y * size + x) * 4;
    const rim = 0.72 + 0.2 * Math.sin(a * 3 + seed * 2.1) + 0.12 * Math.sin(a * 7 + seed * 5.3);
    const churn = 0.62 + 0.38 * Math.sin(x * 0.31 + Math.sin(y * 0.21 + seed) * 3.1) * Math.cos(y * 0.27 - x * 0.13 + seed * 1.7);
    const body = grain ? Math.max(0, 1 - r / (rim * 0.8)) ** 0.5 : Math.max(0, 1 - r / rim) ** 1.5 * churn;
    pixels.set([255, 255, 255, 255 * Math.min(1, body)], i);
  }
  const map = new THREE.DataTexture(pixels, size, size); map.needsUpdate = true; map.magFilter = map.minFilter = THREE.LinearFilter;
  return map;
}

export type ChargeFx = ReturnType<typeof createChargeFx>;
// `cue`: Audio's hooves (src/audio/special.ts, PR #1216), called once per cast CUE_AT ticks in; the scene passes it when that lands. A cast that fizzles after it cannot recall it.
export function createChargeFx(scene: THREE.Scene, opponent: OpponentId, cue?: () => void) {
  const root = new THREE.Group(); root.name = 'charge fx'; root.visible = false; scene.add(root);
  const bg = scene.background instanceof THREE.Color ? scene.background : null, dark = !!bg && bg.r + bg.g + bg.b < 0.45;   // the Night Pit's own dark sky: a darker, cooler dust
  const body = dark ? 0.8 : 1.0;
  const top = dark ? ['#a2603c', '#8f522f', '#b06d47'] : ['#86683e', '#977a4c', '#775a34'], under = dark ? ['#5a3220', '#46261a'] : ['#4a3822', '#3d2d1a'];   // the Pit's burst is clay like its floor, never grey   // a lit top over a darker underside: sand, not smoke
  const textures = [0, 1, 2, 3].map((n) => dustTexture(n, false)), grains = dustTexture(9, true);
  const puff = (i: number, tex: THREE.Texture, color: string) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: 0, depthWrite: false, fog: true, rotation: hash(i, 7) * Math.PI * 2 }));
    s.visible = false; s.frustumCulled = false; root.add(s); return s;
  };
  const shadow = Array.from({ length: HOOF }, (_, i) => puff(i + 20, textures[(i + 2) % 4], under[i % 2]));   // each strike: the dark underside first (drawn below), then its lit top
  const hoof = Array.from({ length: HOOF }, (_, i) => puff(i, textures[i % 4], top[i % 3]));
  const burstShadow = Array.from({ length: BURST }, (_, i) => puff(i + 70, textures[(i + 3) % 4], under[i % 2]));
  const burst = Array.from({ length: BURST }, (_, i) => puff(i + 50, textures[(i + 1) % 4], top[(i + 1) % 3]));
  const sand = Array.from({ length: GRAIN }, (_, i) => puff(i + 90, grains, top[(i + 2) % 3]));
  const streakColor = dark ? '#4a2a1a' : '#4f3a22', streak = Array.from({ length: STREAK }, (_, i) => puff(i + 130, textures[i % 4], streakColor)); streak.forEach((p) => { p.userData.streak = true; });   // the whole run: a dark line on the ground, each puff gone 0.6 s after he passed
  const from = new THREE.Vector3(), to = new THREE.Vector3(), dir = new THREE.Vector3(), side = new THREE.Vector3();
  let cast: Cast | null = null, clock = 0, lastTick = -1, cued: number | null = null;   // cued: the start tick of the cast whose cue has fired
  const show = (s: THREE.Sprite, x: number, y: number, z: number, size: number, opacity: number) => {
    s.visible = opacity > 0.004; if (!s.visible) return;
    s.position.set(x, y, z); s.scale.set(size, size * 0.8, 1); (s.material as THREE.SpriteMaterial).opacity = opacity;
  };

  return {
    // After the poses are final, as nightfall-fx.ts: `tick` is this frame's sim tick, `heads` each side's Head bone in world space (null while a rig loads).
    render(dt: number, events: readonly CombatEvent[], fighters: readonly [Fighter, Fighter], tick: number, heads: readonly [THREE.Vector3 | null, THREE.Vector3 | null], yielding: boolean, anchors?: readonly [THREE.Object3D | null, THREE.Object3D | null]) {
      clock = tick !== lastTick ? tick : Math.min(tick + 1, clock + dt * 60); lastTick = tick;   // smooth between sim ticks, never ahead by more than one
      cast = advanceCast(cast, events, fighters, tick, opponent, yielding, isCharge);
      if (cast && cued !== cast.start && clock - cast.start >= CUE_AT && cast.fizzled === null) { cued = cast.start; cue?.(); }
      const caster = cast ? heads[cast.actor] : null, target = cast ? heads[1 - cast.actor] : null, state = cast && caster && target ? charge(cast, clock) : null;
      root.visible = !!state;
      if (!cast || !caster || !target) return;
      from.set(caster.x, 0, caster.z); to.set(target.x, 0, target.z); dir.subVectors(to, from).setY(0);
      const gap = Math.max(dir.length(), 0.5); dir.normalize(); side.set(-dir.z, 0, dir.x);
      const total = LEAD + gap, front = (state?.front ?? 0) * total;
      // The body: he is drawn at the head of the dust, not planted. Over the GATHER ticks before the race he eases back to the start of the line, then rides the
      // front forward to his own spot (the sim never moves him: the rig's anchor is a presentation offset that the rig resets every frame, so a frame without this
      // call is a frame without the slide) and stands there for the blow. A fizzle or the end of the cast puts him back at once.
      const anchor = anchors?.[cast.actor], slide = anchor && cast.landed === null && cast.fizzled === null ? slideAt(clock - cast.start, LEAD) : 0;
      if (anchor && slide > 0) {
        const world = anchor.getWorldPosition(WORLD).addScaledVector(dir, -slide);
        anchor.position.copy(anchor.parent ? anchor.parent.worldToLocal(world) : world);
      }
      if (!state) return;
      const settle = state.settle ?? 0, out = state.fade * (1 - smooth(settle / 0.7));   // after the blow everything is gone in ~0.5 s (settle runs 0..1 over 0.75 s)
      // The line: a hoof strikes every STRIDE metres, on two alternating lanes. A strike's puff is born as the front passes it and lives LIFE metres of front:
      // it swells, lifts a little (knee height at most) and thins. Stateless: its age is just how far the front has run past it.
      for (let i = 0; i < HOOF; i++) {
        const at = i * STRIDE, age = (front - at) / LIFE;
        if (at > total || age < 0 || age >= 1) { hoof[i].visible = shadow[i].visible = false; continue; }
        const lane = (i % 2 ? 1 : -1) * 0.28 + (hash(i, 2) - 0.5) * 0.2, swell = 0.7 + 0.9 * Math.sqrt(age) * (0.8 + 0.4 * hash(i, 3)), fade = Math.min(1, age / 0.1) * (1 - age) ** 1.3 * out;
        const x = from.x + dir.x * (at - LEAD) + side.x * lane, z = from.z + dir.z * (at - LEAD) + side.z * lane;
        show(shadow[i], x, 0.1 + 0.1 * age, z, swell * 1.15, body * 0.9 * fade);
        show(hoof[i], x, 0.2 + 0.3 * age * (0.7 + 0.3 * hash(i, 4)), z, swell, body * 0.85 * fade);
      }
      // The streak: one dark sand-brown puff per slice of the last RACE ticks, laid where the front was then, so the line is unbroken behind his feet for the whole run
      // and is gone 0.6 s after he passes (peak 0.7 by day, 0.4 in the Pit). It is the front's own easing, replayed back in time, so it can never get ahead of him.
      for (let i = 0; i < STREAK; i++) {
        const k = i / STREAK, past = Math.min(state.front, Math.min(1, Math.max(0, (clock - cast.start - k * RACE - RACE_FROM) / RACE)) ** 1.5);   // never past the front, which a fizzle freezes
        if (state.settle !== null || past <= 0 || state.front <= 0) { streak[i].visible = false; continue; }
        const at = past * total - LEAD, size = 0.5 + 0.35 * k;
        show(streak[i], from.x + dir.x * at + side.x * (hash(i, 15) - 0.5) * 0.3, 0.1 + 0.08 * k, from.z + dir.z * at + side.z * (hash(i, 15) - 0.5) * 0.3, size, (dark ? 0.4 : 0.7) * (1 - k) ** 1.2 * out);
      }
      // Trembling sand: grains thrown up just ahead of the front, each hopping on its own beat.
      for (let i = 0; i < GRAIN; i++) {
        const ahead = (hash(i, 6) - 0.2) * 0.9, hop = Math.abs(Math.sin(clock * 0.45 + hash(i, 8) * 6.28)), at = front + ahead - LEAD, lateral = (hash(i, 9) - 0.5) * 0.7;
        show(sand[i], from.x + dir.x * at + side.x * lateral, 0.03 + 0.2 * hop, from.z + dir.z * at + side.z * lateral, 0.06 + 0.07 * hash(i, 10), state.settle === null && state.front > 0 && state.front < 1 ? 0.8 * state.fade : 0);
      }
      // The blow: at the landing the front breaks once over the target's feet, a low spray that rolls out along the ground and thins.
      for (let i = 0; i < BURST; i++) {
        if (state.settle === null) { burst[i].visible = burstShadow[i].visible = false; continue; }
        const k = Math.min(1, settle / 0.7), spread = (0.3 + hash(i, 11)) * BURST_RUN * (1 - (1 - k) ** 2), angle = (hash(i, 12) - 0.5) * 2.6;
        const x = to.x + dir.x * Math.cos(angle) * spread + side.x * Math.sin(angle) * spread, z = to.z + dir.z * Math.cos(angle) * spread + side.z * Math.sin(angle) * spread;
        const size = 0.8 + 0.7 * k, fade = (1 - k) ** 1.1 * (0.6 + 0.4 * hash(i, 14));
        show(burstShadow[i], x, 0.1, z, size * 1.15, body * 0.9 * fade);
        show(burst[i], x, 0.18 + 0.3 * k * hash(i, 13), z, size, body * 0.85 * fade);
      }
    },
    clear() { cast = null; root.visible = false; },
  };
}
