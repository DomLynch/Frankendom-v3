import * as THREE from 'three';
import type { CombatEvent, Fighter } from './duel.ts';

// Presentation only: the shared SKILL-IMPACT kit (Strategy via Lead, 2026-09-26, SCOPE 8). Every skill move ships on it: a landed `Hit`
// whose move is `skill_<id>` throws a short tinted flash at the contact and a fan of dust and sparks, in that move's colour. Driven by the
// event alone, never the sim's state, so it adds nothing to SIM_FILES. Witch-fire is skipped: it has its own fire (witchfire.ts).
// Bespoke looks (Miasma's cloud, Anvil Stomp's ring, Reaping Blow's arc) sit on top of this, in their own files.
// One pool, one draw call, no per-frame allocation (the clash-sparks.ts pattern); no light, so no shader recompile when it fires.

// Each move's tint, keyed by SkillId (move id = skill_<id>; Lead fixed the ids 2026-09-26). Pommel is neutral steel, and nothing here is
// green: green is Witch-fire's, and the warden's cue. A skill move not in the table yet flashes the neutral default the day it lands.
export const IMPACT_TINT: Readonly<Record<string, string>> = {
  pommel: '#d4dae2',     // day one, every player: cold steel, no hue
  lunge: '#9a86ff',      // Nightborn: night violet
  reaping: '#c0202a',    // Executioner: the headsman's red
  shove: '#d9a441',      // Centurion: scutum bronze
  jab: '#e0c040',        // Goblin: dirty yellow
  cleave: '#e0561c',     // Pitborn: forge orange
  stomp: '#b89468',      // Dwarf: stone dust
  miasma: '#b07ad0',     // Plague Doctor: bruised mauve (the cloud is bespoke)
  ironrush: '#9fb6cc',   // Knight: blued iron
  hewer: '#4aa3df',      // Shieldmaiden: fjord blue
};
export const IMPACT_DEFAULT = '#e6e0d4';
export const IMPACT = { flash: 0.12, flashSize: 0.9, sparks: 10, life: 0.4, reach: 0.28 } as const;   // seconds, metres
const HEIGHT = { head: 1.62, torso: 1.2, legs: 0.62 } as const;   // the contact's height on a scale-1 body, by the sim's hit location

// What a landed skill blow throws, or null: a Hit on a `skill_*` move other than Witch-fire. A blow taken through a raised guard is half.
export function impactOf(event: CombatEvent): { id: string; tint: string; strength: number } | null {
  if (event.type !== 'Hit' || event.target === undefined || !event.move?.startsWith('skill_') || event.move === 'skill_witchfire') return null;
  const id = event.move.slice('skill_'.length);
  return { id, tint: IMPACT_TINT[id] ?? IMPACT_DEFAULT, strength: event.guarded ? 0.5 : 1 };
}

// Where it lands: on the struck body at the location's height (scaled with the man), IMPACT.reach toward the attacker, so it sits on the
// near surface and not inside him.
export function impactPoint(event: CombatEvent, fighters: readonly Pick<Fighter, 'body'>[], scale: readonly number[], out = new THREE.Vector3()): THREE.Vector3 {
  const victim = fighters[event.target!]!.body, attacker = fighters[event.actor]!.body;
  const dx = attacker.x - victim.x, dz = attacker.z - victim.z, d = Math.hypot(dx, dz) || 1;
  return out.set(victim.x + dx / d * IMPACT.reach, HEIGHT[event.location ?? 'torso'] * (scale[event.target!] ?? 1), victim.z + dz / d * IMPACT.reach);
}

export function createSkillImpact(scene: THREE.Scene) {
  const pool = 48, positions = new Float32Array(pool * 3), colors = new Float32Array(pool * 3), sizes = new Float32Array(pool);
  const life = new Float32Array(pool), span = new Float32Array(pool), velocity = new Float32Array(pool * 3), flash = new Uint8Array(pool), power = new Float32Array(pool), tint = new Float32Array(pool * 3);
  const n = 32, pixels = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const u = (x - (n - 1) / 2) / ((n - 1) / 2), v = (y - (n - 1) / 2) / ((n - 1) / 2); pixels.set([255, 255, 255, 255 * Math.max(0, 1 - Math.hypot(u, v)) ** 1.5], (y * n + x) * 4); }
  const map = new THREE.DataTexture(pixels, n, n); map.needsUpdate = true; map.magFilter = map.minFilter = THREE.LinearFilter;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometry.setAttribute('impactSize', new THREE.BufferAttribute(sizes, 1));
  // Additive, so the flash reads as light on a dark robe as well as on pale sand; the sparks are small enough that it never blooms.
  const material = new THREE.PointsMaterial({ map, size: 0.1, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float impactSize;').replace('gl_PointSize = size;', 'gl_PointSize = size * impactSize;');
  };
  material.customProgramCacheKey = () => 'skill-impact-v1';
  const points = new THREE.Points(geometry, material); points.name = 'skill impact'; points.frustumCulled = false; points.visible = false; scene.add(points);
  let cursor = 0, seed = 7; const last = new THREE.Vector3(NaN, NaN, NaN), at = new THREE.Vector3(), colour = new THREE.Color();
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };   // seeded: a capture is a capture
  const born = (p: number, seconds: number, isFlash: boolean) => { life[p] = span[p] = seconds; flash[p] = isFlash ? 1 : 0; tint.set([colour.r, colour.g, colour.b], p * 3); positions.set([at.x, at.y, at.z], p * 3); };
  return {
    // This frame's landed skill blows. `scale` per side, as the signature frame carries it.
    fire(events: readonly CombatEvent[], fighters: readonly Pick<Fighter, 'body'>[], scale: readonly number[]): number {
      let fired = 0;
      for (const event of events) {
        const hit = impactOf(event);
        if (!hit || !fighters[event.target!] || !fighters[event.actor]) continue;
        impactPoint(event, fighters, scale, at); last.copy(at); colour.set(hit.tint); fired++;
        const f = cursor++ % pool; born(f, IMPACT.flash, true); velocity.fill(0, f * 3, f * 3 + 3); power[f] = hit.strength;
        const attacker = fighters[event.actor]!.body, victim = fighters[event.target!]!.body, away = Math.atan2(victim.x - attacker.x, victim.z - attacker.z);
        const count = Math.round(IMPACT.sparks * (0.5 + hit.strength * 0.5));
        for (let k = 0; k < count; k++) {
          // A fan off the struck side, back toward the attacker and up (the chase camera sits behind him): a jet straight through the
          // victim would hide behind his own body, as the clash sparks found.
          const p = cursor++ % pool, a = away + Math.PI + (random() - 0.5) * 2.2, speed = (1.2 + random() * 2.6) * (0.7 + hit.strength * 0.3);
          born(p, IMPACT.life * (0.5 + random() * 0.5), false);
          velocity.set([Math.sin(a) * speed, 0.6 + random() * 2.2, Math.cos(a) * speed], p * 3);
        }
      }
      return fired;
    },
    update(dt: number) {
      if (dt <= 0 && !points.visible) return;
      const step = Math.min(Math.max(dt, 0), 0.1); let active = false;
      for (let p = 0; p < pool; p++) {
        if (life[p] <= 0) { sizes[p] = 0; continue; }
        life[p] = Math.max(0, life[p] - step);
        const heat = life[p] / span[p];   // 1 = just struck, 0 = out
        if (heat <= 0) { sizes[p] = 0; continue; }
        active = true;
        if (flash[p]) {
          // The flash: a bright disc that swells a little and goes in IMPACT.flash seconds, white at the heart of the move's colour.
          const w = 0.35 * heat; colors.set([Math.min(1, tint[p * 3] + w), Math.min(1, tint[p * 3 + 1] + w), Math.min(1, tint[p * 3 + 2] + w)], p * 3);
          sizes[p] = IMPACT.flashSize / 0.1 * (0.6 + 0.4 * power[p]) * (0.7 + 0.3 * (1 - heat)) * heat ** 0.5;   // the material's size is 0.1 m
        } else {
          velocity[p * 3 + 1] -= 9.8 * step;
          for (let axis = 0; axis < 3; axis++) positions[p * 3 + axis] += velocity[p * 3 + axis] * step;
          if (positions[p * 3 + 1] < 0.01) { positions[p * 3 + 1] = 0.01; velocity[p * 3 + 1] = 0; velocity[p * 3] *= 0.5; velocity[p * 3 + 2] *= 0.5; }   // dust settles on the sand
          // A spark cools from the tint toward sand-grey dust as it falls.
          for (let c = 0; c < 3; c++) colors[p * 3 + c] = (tint[p * 3 + c] * heat + 0.45 * (1 - heat)) * heat;
          sizes[p] = 0.6 + heat * 0.9;
        }
      }
      if (active || points.visible) for (const attribute of Object.values(geometry.attributes)) attribute.needsUpdate = true;
      points.visible = active;
    },
    alive(): number { let k = 0; for (let p = 0; p < pool; p++) if (life[p] > 0) k++; return k; },
    last(): [number, number, number] { return [last.x, last.y, last.z]; },   // debug probe: where the latest impact landed
    dispose() { scene.remove(points); geometry.dispose(); material.dispose(); map.dispose(); },
  };
}
