import * as THREE from 'three';
import type { CombatEvent, Fighter } from './duel.ts';
import { impactTier } from './hit-impact.ts';
import { CONTACTS, type ContactId } from './hit-stop-rows.ts';

// sandbox-mech: impact. Dom 2026-10-13: big contact moments with NO time change (a live zone cannot pause): a flash at the contact and a
// shockwave ring on the sand, per contact row. The sizes are optional columns of hit-stop-defs.json (`flash`, `ring` in metres, `tint`);
// a row without them throws nothing, so with no columns this file draws nothing. Presentation only: reads events, never the sim.
// Pools, no light (no shader recompile), no per-frame allocation (the skill-impact.ts pattern).
type FxCols = { flash?: number; ring?: number; tint?: string };
const LIFE = { flash: 0.14, ring: 0.38 } as const;   // seconds
const HEIGHT = { head: 1.62, torso: 1.2, legs: 0.62 } as const;

// The contact row a frame's event plays (hit-impact.ts tiers, refined by the rows' own names), or null.
export function contactOf(e: CombatEvent): ContactId | null {
  if (e.type === 'GuardBroken') return 'guardBreak';
  const tier = impactTier(e);
  return tier === 'full' ? 'hitHeavy' : tier === 'half' ? 'hitLight' : tier === 'parry' ? 'parry' : tier === 'block' ? 'blockLight' : null;
}

export function createImpactFx(scene: THREE.Scene) {
  const n = 64, pixels = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const r = Math.hypot(x - (n - 1) / 2, y - (n - 1) / 2) / ((n - 1) / 2); pixels.set([255, 255, 255, 255 * Math.max(0, 1 - r) ** 2], (y * n + x) * 4); }
  const glow = new THREE.DataTexture(pixels, n, n); glow.needsUpdate = true; glow.magFilter = glow.minFilter = THREE.LinearFilter;
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } as const;
  type Slot = { o: THREE.Sprite | THREE.Mesh; age: number; life: number; size: number };
  const tinted = (s: Slot) => s.o.material as THREE.SpriteMaterial | THREE.MeshBasicMaterial;
  const make = (build: () => Slot['o']): Slot[] => Array.from({ length: 6 }, () => { const o = build(); o.visible = false; o.frustumCulled = false; scene.add(o); return { o, age: 0, life: 0, size: 0 }; });
  const flashes = make(() => new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, ...additive })));
  const ringGeometry = new THREE.RingGeometry(0.965, 1, 64); ringGeometry.rotateX(-Math.PI / 2);   // a thin line, not a band
  const rings = make(() => new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ ...additive, side: THREE.DoubleSide })));
  let cursor = 0;
  const at = new THREE.Vector3();
  const spawn = (pool: Slot[], size: number, life: number, tint: string, y: number) => {
    const s = pool[cursor % pool.length]!; s.o.visible = true; s.o.position.set(at.x, y, at.z); s.age = 0; s.life = life; s.size = size;
    tinted(s).color.set(tint);
  };
  return {
    fire(events: readonly CombatEvent[], fighters: readonly Pick<Fighter, 'body'>[]): void {
      for (const e of events) {
        const id = contactOf(e), row = id && (CONTACTS[id] as FxCols | undefined);
        if (!row || (!row.flash && !row.ring) || e.target === undefined || !fighters[e.target] || !fighters[e.actor]) continue;
        // A landed blow: on the struck body, a hand toward the attacker. A block or parry: between the two, at the guard.
        const v = fighters[e.target]!.body, a = fighters[e.actor]!.body, k = e.type === 'Hit' ? 0.28 / (Math.hypot(a.x - v.x, a.z - v.z) || 1) : 0.5;
        at.set(v.x + (a.x - v.x) * k, 0, v.z + (a.z - v.z) * k); cursor++;
        const tint = row.tint ?? '#ffd9a0';
        if (row.flash) spawn(flashes, row.flash, LIFE.flash, tint, e.type === 'Hit' ? HEIGHT[e.location ?? 'torso'] : 1.25);
        if (row.ring) spawn(rings, row.ring, LIFE.ring, tint, 0.03);
      }
    },
    update(dt: number): void {
      for (const s of flashes) if (s.o.visible) {
        const t = (s.age += dt) / s.life; if (t >= 1) { s.o.visible = false; continue; }
        s.o.scale.setScalar(s.size * (1 + 0.6 * t)); tinted(s).opacity = 1 - t;
      }
      for (const s of rings) if (s.o.visible) {
        const t = (s.age += dt) / s.life; if (t >= 1) { s.o.visible = false; continue; }
        s.o.scale.setScalar(s.size * (0.15 + 0.85 * (1 - (1 - t) ** 3))); tinted(s).opacity = 0.85 * (1 - t);
      }
    },
  };
}
