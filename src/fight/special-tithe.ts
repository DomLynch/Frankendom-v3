import * as THREE from 'three';
import type { CombatEvent, Fighter } from './duel.ts';
import type { OpponentId } from '../roster.ts';
import { lightRig, type TitheLight } from './special-lighting.ts';
import { advanceCast, isBloodTithe, shadowPhase, LAND_AT, type Cast } from './special-timing.ts';
import { clamp01, hash } from './fx-math.ts';

// Blood Tithe, the Centurion's rank-10 boss special (Mars; Finishers, 2026-10-01; brief docs/briefs/specials/centurion-l8-l10-2026-10-01.md). Presentation
// only, preview-only behind ?special=tithe: it reads the sim's special events (special-timing.ts, the same seam as Hades' Shadow) and the casters' bones,
// never the sim, the rig root or Math.random (every "random" here is an index hash). Loaded lazily, only for the Centurion in a fight with Special Moves.
// The arena light turns red (the scene's own lights, fog and sky, slow at first, fast over the last 0.6 s) and red dust lifts from the sand all over the arena and
// pours into the caster's blade, arriving on the landing tick; one strike, a dark burst off the blade, and the dust that was left settles back while the light
// returns. Dark blood-red, painted and irregular (churned puff sprites of different tints, sizes and turns): no glow, no fire, no hard shapes.
const DUST = 12, MOTE_MAX = 0.4, CHARGE = 8, BURST = 36, BURST_LIFE = 0.5, BURST_ALPHA = 0.3, BURST_SPREAD = 0.1, CONE = 0.4, SETTLE_FADE = 24, LIGHT_PEAK = 0.38, LIGHT_FADE = 24, RADIUS = 1.5, RISE = 0.8, KEEP_OFF = 0.6;   // v2: fewer, bigger, softer clumps; a bigger, longer burst
export const ARM_OUT = 0.5, ARM_EASE = 16, AIM_HOLD = 14;   // v2.2: the sword arm is swung ~29° out to the caster's right through the gather (the blade reads as a line pointing at the foe), straight again over the last ARM_EASE ticks so the thrust goes at him
const DUST_FROM = LAND_AT - 36;   // the visible build is the last 0.6 s: dust starts to lift here and has to be in the blade on the landing tick
export const TINTS = ['#5a1410', '#6e1c16', '#7a2018', '#481010'] as const;
const UP = new THREE.Vector3(0, 1, 0), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
const smooth = (k: number) => k * k * (3 - 2 * k);   // UNCLAMPED on purpose: not fx-math's smooth (that one clamps to 0..1); kept so this effect renders exactly as before

function dustTexture() {   // a soft clump with torn, uneven edges (domain-warped noise eats the rim), not a round ball
  const size = 128, pixels = new Uint8Array(size * size * 4), n = (x: number, y: number) => Math.sin(x * 0.19 + Math.sin(y * 0.13) * 2.1) * Math.cos(y * 0.23 - Math.sin(x * 0.11) * 1.7);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x - 63.5) / 63.5, v = (y - 63.5) / 63.5, ang = Math.atan2(v, u), i = (y * size + x) * 4;
    const r = Math.hypot(u, v) * (1 + 0.22 * Math.sin(ang * 3 + 1.3) + 0.12 * Math.sin(ang * 7 + 0.4));
    const torn = 0.5 * n(x, y) + 0.3 * n(x * 2.3 + 17, y * 2.1) + 0.2 * n(x * 4.7, y * 4.3 + 9);   // -1..1
    const rim = Math.min(1, Math.max(0, (0.96 - Math.hypot(u, v)) / 0.3));   // the quad's own edge always fades to nothing, whatever the tearing does
    pixels.set([255, 255, 255, 255 * rim * Math.min(1, Math.max(0, (1 - r) * 1.5 + 0.28 * torn - 0.05)) ** 1.2], i);
  }
  const map = new THREE.DataTexture(pixels, size, size); map.needsUpdate = true; map.magFilter = map.minFilter = THREE.LinearFilter;
  return map;
}

// The red light, on the arena's OWN light (v2: no page overlay, the HUD is untouched): the sun and hemisphere colours, the fog and the sky, the gate's light shaft
// fades out, the environment fill dims. Every touched value is remembered and put back exactly when the cast ends. Nothing else writes these colours (the sun's
// flicker writes intensity only), so a remembered base never goes stale.

export type SpecialFx = ReturnType<typeof createBloodTithe>;
export function createBloodTithe(scene: THREE.Scene, opponent: OpponentId, lighting?: TitheLight) {
  const map = dustTexture(), root = new THREE.Group(); root.name = 'blood tithe'; root.visible = false; scene.add(root);
  const puff = (i: number, name: string, n = i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: TINTS[i % TINTS.length], transparent: true, opacity: 0, depthWrite: false, fog: true, rotation: hash(i, 21) * 6.283 }));
    s.name = `${name} ${n}`; s.visible = false; s.renderOrder = 7; root.add(s); return s;
  };
  const dust = Array.from({ length: DUST }, (_, i) => puff(i, 'dust')), charge = Array.from({ length: CHARGE }, (_, i) => puff(i + 3, 'charge', i));
  const burst = Array.from({ length: BURST }, (_, i) => puff(i + 1, 'burst', i)), burstLife = new Float32Array(BURST), burstDelay = new Float32Array(BURST), burstOrigin = new THREE.Vector3(), burstAim = new THREE.Vector3();
  let rig: ReturnType<typeof lightRig> | undefined;   // built at the first cast, once the arena's lights exist
  const head = new THREE.Vector3(), foe = new THREE.Vector3(), blade = new THREE.Vector3(), hilt = new THREE.Vector3(), base = new THREE.Vector3(), centre = new THREE.Vector3(), spot = new THREE.Vector3(), start = new THREE.Vector3(), top = new THREE.Vector3();
  let cast: Cast | null = null, clock = 0, lastTick = -1;
  // The sword-arm yaw is written ABSOLUTELY each frame (Lead's rule for caster-moving effects): the rig's mixer rewrites upperarm_r only when its pose changes, and in a hit-stop (dt 0)
  // it does not, so a yaw added to the bone's current value would stack frame on frame. `armBase` is the mixer's own value, `armWritten` what we left; if the bone still holds our value
  // the mixer did not run: start again from `armBase`; otherwise the mixer has written a new pose: that is the new base.
  const armBase = new THREE.Quaternion(), armWritten = new THREE.Quaternion(); let armRef: THREE.Object3D | null = null;
  const armRestore = (arm: THREE.Object3D) => { if (armRef === arm && arm.quaternion.equals(armWritten)) arm.quaternion.copy(armBase); else armBase.copy(arm.quaternion); };
  const armRelease = () => { if (armRef && armRef.quaternion.equals(armWritten)) armRef.quaternion.copy(armBase); armRef = null; };

  // Where each dust mote lifts from: a hash disc over the whole arena, kept off both fighters' faces.
  const ground = (i: number, out: THREE.Vector3) => {
    const a = hash(i, 1) * 6.283, r = Math.sqrt(hash(i, 2)) * RADIUS;
    out.set(foe.x + Math.cos(a) * r, 0, foe.z + Math.sin(a) * r);   // v2.5 (Strategy): the motes lift round the caster, not all over the arena
    for (const f of [head, foe]) { const dx = out.x - f.x, dz = out.z - f.z, d = Math.hypot(dx, dz); if (d < KEEP_OFF) { const k = KEEP_OFF / (d || 1); out.x = f.x + dx * k; out.z = f.z + dz * k; } }
    return out;
  };
  function fireBurst(at: THREE.Vector3) {   // v2.5 (Strategy): a narrow cone from the blade's tip to the hero's chest, nothing behind or beside the caster
    burstOrigin.copy(at); burstAim.set(head.x, head.y - 0.35, head.z);
    burst.forEach((s, i) => { s.position.copy(at); burstLife[i] = BURST_LIFE * (0.8 + 0.2 * hash(i, 34)); burstDelay[i] = BURST_SPREAD * hash(i, 36); s.visible = true; });
  }
  const hide = () => { for (const s of [...dust, ...charge]) s.visible = false; };

  return {
    wantsHands: true as const,   // the scene passes the casters' hand_r bones only to an effect that asks
    // `heads` / `hands`: each side's Head and hand_r bone in world space (null while a rig loads). The caster is the opponent (side 1); the target side 0.
    render(dt: number, events: readonly CombatEvent[], fighters: readonly [Fighter, Fighter], tick: number, heads: readonly [THREE.Vector3 | null, THREE.Vector3 | null], yielding: boolean, hands: readonly [THREE.Vector3 | null, THREE.Vector3 | null] = [null, null], anchors: readonly [THREE.Object3D | null, THREE.Object3D | null] = [null, null]) {
      clock = tick !== lastTick ? tick : Math.min(tick + 1, clock + dt * 60); lastTick = tick;
      const before = cast;
      cast = advanceCast(cast, events, fighters, tick, opponent, yielding, isBloodTithe);
      const caster = cast ? cast.actor : 1, target = 1 - caster;
      if (heads[target] && heads[caster]) { head.copy(heads[target]!); foe.copy(heads[caster]!); centre.copy(head).add(foe).multiplyScalar(0.5); }
      const cp = cast && heads[target] && heads[caster] ? shadowPhase(cast, clock) : null;
      const anchor = anchors[caster], sword = anchor?.getObjectByName('SwordDrawn') ?? anchor?.getObjectByName('WeaponDrawn'), len = (sword?.userData.contact as { to?: number } | undefined)?.to ?? 0.65;
      const tipOf = (out: THREE.Vector3) => { sword!.updateWorldMatrix(true, false); return out.copy(spot.set(0, len, 0)).applyMatrix4(sword!.matrixWorld); };
      const arm = anchor?.getObjectByName('upperarm_r');
      if (cp && arm?.parent) {   // after the poses are final, the sword arm, in its parent's frame, about world-up:
        armRestore(arm);
        const age0 = cp.age, landed0 = cast!.landed !== null, g = landed0 || cp.phase === 'recover' || cp.phase === 'dissolve' ? 0 : clamp01((LAND_AT - age0) / ARM_EASE);
        // (a) the gather: swung outward (his right) so the blade reads as a line out in front, easing straight over the last ARM_EASE ticks;
        // (b) the strike: aimed at the hero, i.e. the signed angle from where the blade points now to the target's chest, held a moment past the landing.
        let aim = 0; const s = landed0 ? 1 - clamp01(age0 / AIM_HOLD) : 1 - g;
        if (s > 0 && hands[caster] && sword) {
          anchor!.updateWorldMatrix(true, true); tipOf(blade); base.setFromMatrixPosition(sword.matrixWorld);
          const bx = blade.x - base.x, bz = blade.z - base.z, tx = head.x - base.x, tz = head.z - base.z;
          aim = Math.max(-1.6, Math.min(1.6, Math.atan2(bx * tz - bz * tx, bx * tx + bz * tz))) * smooth(s) * -1;   // atan2(cross, dot) is the CCW angle blade -> target about +y; the yaw below is about +y with the sign flipped
        }
        arm.parent.getWorldQuaternion(qa); qb.setFromAxisAngle(UP, -ARM_OUT * smooth(g) + aim); arm.quaternion.premultiply(qa.clone().invert().multiply(qb).multiply(qa));
        armWritten.copy(arm.quaternion); armRef = arm;
        anchor!.updateWorldMatrix(true, true);
      } else armRelease();   // the cast is over (or the rig is gone): hand the bone back as the mixer left it
      const trail = anchor?.getObjectByName('WeaponTrail'); if (trail && cp) trail.visible = false;   // v2 (d): the game's pale weapon trail streaks above the sword in the wind-up; hidden for the cast
      if (sword && cp) { tipOf(blade); hilt.copy(hands[caster] ?? blade); }   // the blade's real tip, and where it is held
      else if (hands[caster]) {   // the blade's tip: out from the caster's hand toward the target, at hand height (a gladius, ~0.6 m)
        blade.copy(hands[caster]!); hilt.copy(blade); const dx = head.x - blade.x, dz = head.z - blade.z, d = Math.hypot(dx, dz) || 1; blade.x += (dx / d) * 0.5; blade.z += (dz / d) * 0.5;
      } else if (heads[caster]) { blade.copy(foe).add(spot.set(0, -0.6, 0)); hilt.copy(blade); }
      if (cast && cast.landed !== null && before?.landed === null) fireBurst(blade);
      for (let i = 0; i < BURST; i++) {
        const s = burst[i]; if (!s.visible) continue;
        if (burstDelay[i] > 0) { burstDelay[i] -= dt; (s.material as THREE.SpriteMaterial).opacity = 0; continue; }
        burstLife[i] -= dt; if (burstLife[i] <= 0) { s.visible = false; continue; }
        const k = 1 - burstLife[i] / BURST_LIFE, t = k ** 0.8, ax = burstAim.x - burstOrigin.x, az = burstAim.z - burstOrigin.z, len = Math.hypot(ax, az) || 1;
        const lateral = (hash(i, 31) - 0.5) * 2 * CONE * t;   // half-width CONE (0.4 m) at the hero: with a puff's own radius, about 1.5 m across
        s.position.lerpVectors(burstOrigin, burstAim, t); s.position.x += (-az / len) * lateral; s.position.z += (ax / len) * lateral; s.position.y += (hash(i, 33) - 0.5) * 0.3 * t;
        s.scale.setScalar(0.2 + 0.2 * k);   // a small hit splash at the hero: <= 0.4 m
        const near = smooth(clamp01((Math.hypot(s.position.x - foe.x, s.position.z - foe.z) - 0.4) / 0.9));
        (s.material as THREE.SpriteMaterial).opacity = BURST_ALPHA * (0.3 + 0.7 * near) * smooth(clamp01(k / 0.3)) * (1 - smooth(clamp01((k - 0.8) / 0.2)));   // in from nothing at the tip, travels the whole way, fades as it reaches the hero (v2.8 punch: Strategy)
      }
      const bursting = burst.some((s) => s.visible);
      root.visible = (!!cast && !!heads[target] && !!heads[caster]) || bursting;
      if (!cast || !heads[target] || !heads[caster]) { hide(); rig?.restore(); return; }
      const p = shadowPhase(cast, clock), age = p.age, landed = cast.landed !== null;
      // The light: creeps in over the gather, surges over the last 0.6 s, peaks on the strike, and is back to normal 0.4 s after it.
      const creep = p.phase === 'gather' ? 0.2 * smooth(p.k) : 0.2, surge = clamp01((age - DUST_FROM) / (LAND_AT - DUST_FROM));
      const light = p.phase === 'gather' || p.phase === 'fall' ? creep + (LIGHT_PEAK - 0.2) * smooth(surge) : LIGHT_PEAK * (1 - smooth(clamp01(age / LIGHT_FADE)));   // v2.4 (Strategy): the red is a flash on the strike, gone within LIGHT_FADE ticks (0.4 s), not a grade that holds
      (rig ??= lighting ?? lightRig(scene)).set(Math.max(0, light));
      // The dust: each mote lifts at its own moment inside the last 0.6 s, rises, then bends into the blade and is gone on arrival.
      const rising = !landed && p.phase !== 'recover' && p.phase !== 'dissolve', arrived = clamp01((age - DUST_FROM - 14) / (LAND_AT - DUST_FROM - 14));
      dust.forEach((s, i) => {
        const m = s.material as THREE.SpriteMaterial;
        if (rising) {
          const t0 = DUST_FROM + 18 * hash(i, 3), u = clamp01((age - t0) / (LAND_AT - t0));
          if (u <= 0) { s.visible = false; return; }
          ground(i, start); top.copy(start); top.y = RISE * (0.5 + 0.5 * hash(i, 4)); top.x += (hash(i, 5) - 0.5) * 0.5; top.z += (hash(i, 6) - 0.5) * 0.5;
          const lift = smooth(clamp01(u / 0.45)), pour = smooth(clamp01((u - 0.4) / 0.6)) ** 1.4;
          s.position.lerpVectors(start, top, lift).lerp(blade, pour);
          s.scale.setScalar(Math.min(MOTE_MAX, (0.15 + 0.18 * hash(i, 7)) * (1 + 0.1 * lift)) * (1 - 0.4 * pour));   // v2.6 (Strategy): a stream of small motes into the blade, not a cloud over the caster
          m.opacity = 0.22 * clamp01(u / 0.12) * (1 - clamp01((u - 0.9) / 0.1)) * (1 - 0.6 * pour);   /* thinning as it nears the blade, so it never sits on his arm */ m.rotation = hash(i, 21) * 6.283 + u * (hash(i, 8) - 0.5) * 3; s.visible = true;
        } else if (landed && (p.phase === 'recover' || p.phase === 'dissolve')) {   // what the blade did not take settles back to the sand, thinning
          if (i % 4) { s.visible = false; return; }
          ground(i, start); const k = p.k, y = 0.6 * (1 - smooth(k)) * (0.4 + 0.6 * hash(i, 9));
          s.position.set(start.x * 0.8 + centre.x * 0.2, y, start.z * 0.8 + centre.z * 0.2); s.scale.setScalar(Math.min(MOTE_MAX, 0.2 + 0.2 * hash(i, 7))); m.opacity = 0.17 * (1 - smooth(clamp01(age / SETTLE_FADE))); s.visible = m.opacity > 0.01;
        } else s.visible = false;
      });
      charge.forEach((s, i) => {   // the blade fills with it: dark red-black clots strung along it from the hilt to the point, growing as the dust arrives
        const m = s.material as THREE.SpriteMaterial;
        const on = rising ? arrived : landed && p.phase === 'recover' ? 1 - clamp01(p.k / 0.25) : 0;
        if (on <= 0.01) { s.visible = false; return; }
        const along = (i + 0.5) / CHARGE;
        s.position.lerpVectors(hilt, blade, along); s.position.y += (hash(i, 10) - 0.5) * 0.08;
        s.scale.setScalar((0.2 + 0.2 * on) * (0.7 + 0.3 * hash(i, 11))); m.opacity = 0.6 * on; s.visible = true;
      });
    },
    clear() { armRelease(); cast = null; root.visible = false; hide(); burst.forEach((s) => (s.visible = false)); rig?.restore(); },
  };
}
