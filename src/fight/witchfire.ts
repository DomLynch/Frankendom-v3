import * as THREE from 'three';
import { movesOf, type Fighter } from './duel.ts';
import { MOVES } from './moves.ts';

// Presentation only: the Witch-fire skill's fire (docs/briefs/skill-witch-arm.md (b); the green glow, the gout and the embers are Visuals &
// World's). Read from the sim's own clock, never from events: a fighter in `attack` with `skill_witchfire` is at tick `age` of the move, so
// the windup (0–39) kindles a green glow in the casting palm that grows to the active tick, the active ticks (40–45) throw a point-blank
// gout of green flame down the fighter's heading to the move's reach (1.2 m), and the recovery drops embers from the palm. An interrupted
// cast stops at once; what is already in the air burns out. Green, never orange: the brazier is orange, and this is the warden's cue too.
// V1 is the palm cast (the longsword reference row); the pole family's haft casts are their own PR.
// One pool, one draw call, no per-frame allocation (the clash-sparks.ts pattern); no light, so no shader recompile when it starts.
// The reference row's timing and reach (the longsword); the effect itself reads the caster's own weapon table (movesOf), so a per-weapon
// row that changes the reach or the windup moves the fire with it.
export const WITCHFIRE = { windup: MOVES.skill_witchfire.windup, active: MOVES.skill_witchfire.active, reach: MOVES.skill_witchfire.reach, cone: 0.3 } as const;   // cone: half-angle, radians
const POOL = 200;   // a full gout (6 active ticks x 16 + the 8-tick tail) with the licks and embers, none recycled while still burning
export type WitchfireStage = 'windup' | 'active' | 'recovery' | null;
export function witchfireStage(f: Pick<Fighter, 'phase' | 'move' | 'age' | 'weapon'>): WitchfireStage {
  if (f.phase !== 'attack' || f.move !== 'skill_witchfire') return null;
  const { windup, active } = movesOf(f).skill_witchfire;
  return f.age < windup ? 'windup' : f.age < windup + active ? 'active' : 'recovery';
}

// A soft round flame texture: white core to transparent edge, tinted per particle by its vertex colour.
function flameMap(): THREE.DataTexture {
  const n = 32, pixels = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x - (n - 1) / 2) / ((n - 1) / 2), v = (y - (n - 1) / 2) / ((n - 1) / 2), edge = Math.max(0, 1 - Math.hypot(u, v));
    pixels.set([255, 255, 255, 255 * edge ** 1.6], (y * n + x) * 4);
  }
  const map = new THREE.DataTexture(pixels, n, n); map.needsUpdate = true; map.magFilter = map.minFilter = THREE.LinearFilter;
  return map;
}

export function createWitchfire(scene: THREE.Scene) {
  // Each flame draws as a TONGUE of TAIL points strung back along its own velocity, so the gout reads as fire going somewhere (Lead on
  // the v4 stills: a round puff at the hand had no direction). Slow flames (licks, embers) collapse to a short streak on their own.
  const TAIL = 3, TONGUE = 0.02;   // points per flame; seconds of travel between them
  const positions = new Float32Array(POOL * TAIL * 3), colors = new Float32Array(POOL * TAIL * 3), sizes = new Float32Array(POOL * TAIL);
  const at = new Float32Array(POOL * 3);   // each flame's head
  const life = new Float32Array(POOL), span = new Float32Array(POOL), velocity = new Float32Array(POOL * 3), grow = new Float32Array(POOL), kind = new Uint8Array(POOL);   // kind 0 gout, 1 ember, 2 lick
  const map = flameMap(), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometry.setAttribute('fireSize', new THREE.BufferAttribute(sizes, 1));
  // Additive: fire is light, not paint, and green over the sand and the skin stays green where a normal blend would muddy it. Not
  // tone-mapped, and each flame dim: ACES and a stack of bright flames washed the first gout to a white puff (375 stills, 2026-09-25).
  const material = new THREE.PointsMaterial({ map, size: 1, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float fireSize;').replace('gl_PointSize = size;', 'gl_PointSize = size * fireSize;');
  };
  material.customProgramCacheKey = () => 'witchfire-v2';
  const points = new THREE.Points(geometry, material); points.name = 'witchfire'; points.frustumCulled = false; points.visible = false; scene.add(points);
  // The palm glow: one billboard per side, grown through the windup, flared on the active tick, gone in the recovery.
  const glows = [0, 1].map(() => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: 0x2eff4a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    sprite.name = 'witchfire glow'; sprite.visible = false; scene.add(sprite); return sprite;
  });
  const palm = new THREE.Vector3(), forward = new THREE.Vector3(), side = new THREE.Vector3(), dir = new THREE.Vector3();
  const lastAge = [-1, -1], hands = new Map<THREE.Object3D, THREE.Object3D | null>(), trails = new Map<THREE.Object3D, THREE.Object3D | null>();
  let cursor = 0, seed = 7;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };   // seeded: a capture is a capture
  const handOf = (root: THREE.Object3D) => { if (!hands.has(root)) hands.set(root, root.getObjectByName('hand_l') ?? null); return hands.get(root)!; };
  const trailOf = (root: THREE.Object3D) => { if (!trails.has(root)) trails.set(root, root.getObjectByName('WeaponTrail') ?? null); return trails.get(root)!; };
  let jet = 0.15;   // how far down the jet a gout flame may be born (m): the first 15 cm, or the whole reach on the impact tick
  const emit = (k: number, speed: number, spread: number, lifeMin: number, lifeMax: number, size: number, rise: number) => {
    const p = cursor++ % POOL, a = random() * Math.PI * 2, r = spread * Math.sqrt(random());
    // A direction inside the cone around `forward`: `side` and world up span the cross-section.
    dir.copy(forward).addScaledVector(side, Math.cos(a) * r).addScaledVector(THREE.Object3D.DEFAULT_UP, Math.sin(a) * r + rise).normalize();
    const ahead = k === 0 ? random() * jet : 0, s = speed * (0.75 + random() * 0.5) * (jet > 0.5 ? 0.25 : 1);   // flames born down the jet on impact already stand there: they drift, they do not fly on past her   // a gout flame is born anywhere on the jet's first `jet` metres
    for (let axis = 0; axis < 3; axis++) { at[p * 3 + axis] = palm.getComponent(axis) + dir.getComponent(axis) * ahead; velocity[p * 3 + axis] = dir.getComponent(axis) * s; }
    life[p] = span[p] = lifeMin + random() * (lifeMax - lifeMin); grow[p] = size * (0.8 + random() * 0.4); kind[p] = k;
  };
  return {
    // `fighters` the sim's pair; `roots` each rig's anchor (the palm is its `hand_l`). Call after the poses are final for the frame.
    update(dt: number, fighters: readonly Fighter[], roots: readonly (THREE.Object3D | null)[]) {
      let active = false;
      for (let i = 0; i < 2; i++) {
        const f = fighters[i], root = roots[i], stage = f ? witchfireStage(f) : null, hand = root && stage ? handOf(root) : null, glow = glows[i];
        if (!f || !stage || !hand) { glow.visible = false; lastAge[i] = -1; continue; }
        hand.getWorldPosition(palm);
        // The cast is the palm's, not the blade's: the clip it borrows (the heavy's) would sweep its pale weapon trail across the frame.
        const trail = trailOf(root!); if (trail) trail.visible = false;   // root is set: `hand` came from it
        // Aimed down the caster→target line (the sim's facing can lag the lock by a few degrees; the fire must go AT her).
        const foe = fighters[1 - i]?.body;
        if (foe && Math.hypot(foe.x - f.body.x, foe.z - f.body.z) > 0.01) forward.set(foe.x - f.body.x, 0, foe.z - f.body.z).normalize();
        else forward.set(Math.sin(f.body.heading), 0, Math.cos(f.body.heading));
        side.set(forward.z, 0, -forward.x);
        const ticks = lastAge[i] < 0 ? 1 : Math.max(0, f.age - lastAge[i]); lastAge[i] = f.age;   // new sim ticks this frame (0 in a hit-stop)
        if (stage === 'windup') {
          // Kindling: the glow grows with the windup's progress, with a flame's flicker, and a few licks curl up off the palm.
          const move = movesOf(f).skill_witchfire, t = (f.age + 1) / move.windup;
          glow.visible = true; glow.position.copy(palm); glow.scale.setScalar(0.2 + 0.6 * t * (0.9 + random() * 0.2));   // wider than the forearm, so the body never hides it
          glow.material.opacity = 0.45 + 0.5 * t;
          for (let n = 0; n < ticks; n++) if (random() < 0.3 + 0.6 * t) emit(2, 0.7, 0.9, 0.22, 0.4, 0.12 + 0.12 * t, 1.6);
        } else if (stage === 'active') {
          // The gout: a dense cone driven down the heading, each flame slowing (drag 7/s: it travels speed / 7) so the front passes the caster's own reach (movesOf): the fire always gets as far as the sim's hit.
          glow.visible = true; glow.position.copy(palm); glow.scale.setScalar(0.9); glow.material.opacity = 1;
          // On the impact tick (the sim lands the hit on the first active tick) the gout is born along the whole reach at once, so the frame
          // that shows the hit shows the fire ON the target, through the hit-stop that holds it (Lead: consequence is judged on that frame).
          const move = movesOf(f).skill_witchfire; jet = f.age === move.windup ? move.reach * 0.9 : 0.15;
          for (let n = 0; n < ticks * 16; n++) emit(0, move.reach * 8, WITCHFIRE.cone, 0.26, 0.42, 0.34, 0.05);
          jet = 0.15;
        } else {
          // The recovery: the glow gutters out over the first third, and embers fall from the palm.
          const move = movesOf(f).skill_witchfire, since = f.age - move.windup - move.active, fade = Math.max(0, 1 - since / 12);
          // The gout's tail: the jet thins over the first 8 recovery ticks instead of cutting off on the last active tick.
          for (let n = 0; n < ticks * Math.max(0, 8 - since); n++) emit(0, move.reach * 6.5, WITCHFIRE.cone * 0.8, 0.2, 0.34, 0.26, 0.05);
          glow.visible = fade > 0; glow.position.copy(palm); glow.scale.setScalar(0.5 * fade + 0.08); glow.material.opacity = fade * 0.8;
          for (let n = 0; n < ticks; n++) if (random() < 0.45) emit(1, 0.6, 1.2, 0.6, 1.0, 0.07, 0.6);
        }
      }
      // Every frame writes the buffers; a pause or hit-stop (dt 0) moves nothing but still draws what was born in it.
      {
        dt = Math.max(0, Math.min(dt, 0.1));
        for (let p = 0; p < POOL; p++) {
          life[p] = Math.max(0, life[p] - dt);
          if (life[p] <= 0) { for (let j = 0; j < TAIL; j++) sizes[p * TAIL + j] = 0; continue; }
          active = true;
          const heat = life[p] / span[p], v = p * 3;   // 1 = born, 0 = out
          if (kind[p] === 1) velocity[v + 1] -= 3.2 * dt;                   // embers fall (slowly: they are light)
          else { const drag = Math.exp(-(kind[p] === 0 ? 7 : 3) * dt); velocity[v] *= drag; velocity[v + 2] *= drag; velocity[v + 1] = velocity[v + 1] * drag + 0.9 * dt; }   // flame slows and rises
          for (let axis = 0; axis < 3; axis++) at[v + axis] += velocity[v + axis] * dt;
          if (at[v + 1] < 0.02) { at[v + 1] = 0.02; velocity[v + 1] = 0; }
          // Colour: dim, saturated witch green, a touch paler when born, darkening to bottle green and out; a few flames stacked add up to
          // a bright green, never white. No red channel above green anywhere, so no frame reads orange. Embers burn brighter (alone).
          const hot = Math.max(0, heat - 0.6) / 0.4, gain = kind[p] === 1 ? 2.2 : 1;
          const scale = (kind[p] === 0 ? grow[p] * (0.45 + 1.1 * (1 - heat)) : grow[p] * (0.5 + 0.5 * heat)) * Math.min(1, heat * 3);   // the gout widens as it goes
          for (let j = 0; j < TAIL; j++) {   // the tongue: the head, then points back along the flight, thinner and dimmer
            const q = p * TAIL + j, back = TONGUE * j, fade = 1 - j * 0.28;
            for (let axis = 0; axis < 3; axis++) positions[q * 3 + axis] = at[v + axis] - velocity[v + axis] * back;
            colors[q * 3] = (0.03 + 0.12 * hot) * gain * fade; colors[q * 3 + 1] = (0.12 + 0.3 * heat) * gain * fade; colors[q * 3 + 2] = (0.04 + 0.08 * hot) * gain * fade;
            sizes[q] = scale * (1 - j * 0.25);
          }
        }
      }
      if (active) for (const attribute of Object.values(geometry.attributes)) attribute.needsUpdate = true;
      points.visible = active;
    },
    alive(): number { let n = 0; for (let p = 0; p < POOL; p++) if (life[p] > 0) n++; return n; },
    glowing(): [boolean, boolean] { return [glows[0].visible, glows[1].visible]; },
    clear() { life.fill(0); sizes.fill(0); points.visible = false; for (const g of glows) g.visible = false; lastAge.fill(-1); },
    dispose() { scene.remove(points); geometry.dispose(); material.dispose(); map.dispose(); for (const g of glows) { scene.remove(g); g.material.dispose(); } },
  };
}
