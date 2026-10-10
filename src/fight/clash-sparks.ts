import * as THREE from 'three';
import type { CombatEvent } from './duel.ts';
import type { Weapon } from './moves.ts';

// Presentation only: metal sparks for a blade meeting a blade. A few thin fragments struck off the attacking blade itself, each its own
// speed, angle, life, thickness and streak length (owner 2026-09-20, three times: nothing uniform, nothing yellow, nothing bright or thick
// enough to look pasted on — silver, a reflection off the steel rather than a grey fleck, 70 % opaque), falling under gravity, one bounce
// off the sand, cooling from a cool silver-white to a dull silver and out, plus one glint: a five-frame silver flash where the blades met. Normal blending (no additive glow), tone-mapped like the rest of the frame, drawn as thin streaks of up to eight points.
// Readable brutality: ≤ 8 sparks, ≤ 0.4 s, nothing that covers a pose. Steel on steel only — the caller decides.
// Steel on steel: the strength of the sparks a contact deserves, or 0 for none. Only a block or parry of a metal blade by a blade guard
// (a shaft catching a blade, a wooden weapon, a kick, a landed blow: nothing). A parry strikes hardest, then a heavy, then a perfect block.
export const HEAVY_CLASS = new Set<string>(['heavy_overhead', 'heavy_riposte', 'heavy_counter', 'critical']);
export function clashStrength(event: CombatEvent, defender: Weapon): number {
  if ((event.type !== 'Blocked' && event.type !== 'Parried') || event.target === undefined) return 0;
  if (!['iron', 'steel', 'bronze'].includes(event.material ?? '') || defender.guard !== 'blade' || defender.material === 'wood') return 0;
  return event.type === 'Parried' ? 0.9 : HEAVY_CLASS.has(event.move ?? '') ? 0.8 : event.perfect ? 0.65 : 0.4;
}
// Block feedback (SCOPE 7, pick C): the sand a contact kicks off the defender's feet, or null for none. A heavy landing on a planted man or
// caught on his guard puffs off his rear foot; any block does too, scaled by how hard it was held (perfect .25, normal .4, heavy .6); a
// broken guard is driven off both feet. A parry and a light or kick that lands move no sand. Audio's block/break cues key on the same
// events (Blocked, perfect, GuardBroken), so this is the one place that says what a block feels like.
export function blockDust(event: CombatEvent): { feet: 'rear' | 'both'; strength: number } | null {
  if (event.target === undefined) return null;
  const heavy = HEAVY_CLASS.has(event.move ?? '');
  if (event.type === 'GuardBroken') return { feet: 'both', strength: 1 };
  if (event.type === 'Hit') return heavy ? { feet: 'rear', strength: 1 } : null;
  if (event.type === 'Blocked') return { feet: 'rear', strength: heavy ? .6 : event.perfect ? .25 : .4 };
  return null;
}
export function createClashSparks(scene: THREE.Scene) {
  const pool = 24, trail = 8, count = pool * trail, positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), sizes = new Float32Array(count);
  const life = new Float32Array(pool), span = new Float32Array(pool), girth = new Float32Array(pool), streak = new Uint8Array(pool), glint = new Uint8Array(pool), velocity = new Float32Array(pool * 3), history = new Float32Array(pool * trail * 3), bounced = new Uint8Array(pool);
  const pixels = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const u = (x - 7.5) / 7.5, v = (y - 7.5) / 7.5, edge = Math.max(0, 1 - u * u - v * v); pixels.set([255, 255, 255, 255 * edge ** 1.2], (y * 16 + x) * 4); }
  const map = new THREE.DataTexture(pixels, 16, 16); map.needsUpdate = true; map.magFilter = map.minFilter = THREE.LinearFilter;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometry.setAttribute('sparkSize', new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.PointsMaterial({ map, size: 0.1, vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float sparkSize;').replace('gl_PointSize = size;', 'gl_PointSize = size * sparkSize;');
  };
  material.customProgramCacheKey = () => 'clash-sparks-v3';
  const points = new THREE.Points(geometry, material); points.name = 'clash sparks'; points.frustumCulled = false; points.visible = false; scene.add(points);
  let cursor = 0, seed = 1; const last = new THREE.Vector3(NaN, NaN, NaN), late: { a: THREE.Vector3; b: THREE.Vector3; heading: number; strength: number; n: number }[] = [];
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };   // seeded: a capture is a capture
  const spawn = (a: THREE.Vector3, b: THREE.Vector3, heading: number, strength: number, n: number) => {
    const along = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)), side = new THREE.Vector3(along.z, 0, -along.x), at = new THREE.Vector3();
    for (let j = 0; j < n; j++) {
      const p = cursor++ % pool, u = 0.35 + random() * 0.65;   // struck off the outer two thirds of the blade's contact zone, never one point
      at.lerpVectors(a, b, u); last.copy(at);
      // A random direction in the fan a blade clash really throws: across the blades (sideways) and upward, a few forward, a few back
      // toward the camera, one or two dropping. A jet straight away from the defender hides behind his own head and shoulders at the
      // over-the-shoulder framing (sparks-v3 strips, 2026-09-20), so the fan is the readable shape as well as the honest one.
      const dir = along.clone().multiplyScalar((random() - 0.35) * 1.2).addScaledVector(side, (random() - 0.5) * 3.0).setY(0.1 + random() * 1.8).normalize();
      const speed = (1.4 + random() * random() * 4.5) * (0.8 + strength * 0.4);
      life[p] = span[p] = 0.15 + random() * random() * 0.35 + strength * 0.04; bounced[p] = 0;
      girth[p] = 0.7 + random() * random() * 0.8; streak[p] = 3 + Math.round(random() * (trail - 3)); glint[p] = 0;   // some hair-thin flicks, some longer streaks
      for (let axis = 0; axis < 3; axis++) { velocity[p * 3 + axis] = dir.getComponent(axis) * speed; for (let t = 0; t < trail; t++) history[(p * trail + t) * 3 + axis] = at.getComponent(axis); }
    }
  };
  return {
    // `a`→`b`: the attacking blade's contact zone (world). `heading`: the blow's direction (the attacker's facing). `strength` 0..1.
    // Four to eight sparks, some of them a frame or two late, so no two clashes look alike.
    burst(a: THREE.Vector3, b: THREE.Vector3, heading: number, strength: number) {
      const at = new THREE.Vector3(), n = 4 + Math.round(random() * (2 + strength * 2)), now = Math.max(1, Math.round(n * (0.4 + random() * 0.4)));
      spawn(a, b, heading, strength, now);
      // The glint: the sun off the steel at the contact itself, gone in five frames, no motion, no streak, thin enough not to be a blob.
      const g = cursor++ % pool; at.lerpVectors(a, b, 0.7); life[g] = span[g] = 0.085; bounced[g] = 1; girth[g] = 1.9 + strength * 0.7; streak[g] = 1; glint[g] = 1;
      for (let axis = 0; axis < 3; axis++) { velocity[g * 3 + axis] = 0; for (let t = 0; t < trail; t++) history[(g * trail + t) * 3 + axis] = at.getComponent(axis); }
      if (n > now) late.push({ a: a.clone(), b: b.clone(), heading, strength, n: n - now });
    },
    update(dt: number) {
      if (dt <= 0) return;   // a pause (dt 0) holds the sparks; a hit-stop passes dt, and sparks fly while the fighters hold (the impact frame)
      dt = Math.min(dt, 0.1); let active = false;
      for (const l of late.splice(0)) { const k = Math.max(1, Math.round(l.n * 0.6)); spawn(l.a, l.b, l.heading, l.strength, k); if (l.n > k) late.push({ ...l, n: l.n - k }); }
      for (let p = 0; p < pool; p++) {
        life[p] = Math.max(0, life[p] - dt);
        if (life[p] <= 0) { for (let t = 0; t < trail; t++) sizes[p * trail + t] = 0; continue; }
        active = true;
        for (let t = trail - 1; t > 0; t--) for (let axis = 0; axis < 3; axis++) history[(p * trail + t) * 3 + axis] = history[(p * trail + t - 1) * 3 + axis];
        if (!glint[p]) {   // the glint is a fixed point at the contact (audit 2026-09-22: gravity used to reach it too, against its own "no motion" comment)
          velocity[p * 3 + 1] -= 9.8 * dt;
          for (let axis = 0; axis < 3; axis++) history[p * trail * 3 + axis] += velocity[p * 3 + axis] * dt;
          if (history[p * trail * 3 + 1] < 0.01 && velocity[p * 3 + 1] < 0) {   // one bounce off the sand, then it dies there
            history[p * trail * 3 + 1] = 0.01; velocity[p * 3 + 1] *= bounced[p] ? 0 : -0.35; velocity[p * 3] *= 0.6; velocity[p * 3 + 2] *= 0.6;
            if (bounced[p]) life[p] = Math.min(life[p], 0.05); bounced[p] = 1;
          }
        }
        const heat = life[p] / span[p];   // 1 = just struck, 0 = out
        for (let t = 0; t < trail; t++) {
          const i = p * trail + t, fade = heat * (1 - t * 0.14);
          positions.set([history[i * 3], history[i * 3 + 1], history[i * 3 + 2]], i * 3);
          // Silver, not grey: a cool white when struck (no yellow, a touch of blue like light off steel), a dull silver as it cools, out:
          // (1.0, 1.0, 1.0) → (0.58, 0.60, 0.66) → 0. The glint holds pure silver-white for its five frames. Owner 2026-09-20 (4th pass,
          // "can't see the sparks now"): a step up from the first silver pass — size 0.1, white when struck, five-frame glint, one more spark —
          // still 70 % opaque, still no yellow, no glow.
          const hot = glint[p] ? 1 : Math.min(1, fade * 1.8), gain = glint[p] ? 1 : Math.min(1, fade * 2.5);
          colors.set([(0.58 + 0.42 * hot) * gain, (0.60 + 0.40 * hot) * gain, (0.66 + 0.34 * hot) * gain], i * 3);
          sizes[i] = t < streak[p] ? girth[p] * (glint[p] ? heat : 0.5 + heat * 0.5) * (1 - t * 0.12) : 0;
        }
      }
      if (active) for (const attribute of Object.values(geometry.attributes)) attribute.needsUpdate = true;   // nothing to upload once the last spark is out
      points.visible = active;
    },
    alive(): number { let n = 0; for (let p = 0; p < pool; p++) if (life[p] > 0) n++; return n; },
    last(): [number, number, number] { return [last.x, last.y, last.z]; },   // debug probe: where the latest burst was born
    dispose() { scene.remove(points); geometry.dispose(); material.dispose(); map.dispose(); },
  };
}
