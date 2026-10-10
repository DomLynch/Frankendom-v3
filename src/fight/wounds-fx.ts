// The blood a creature's wounds row draws in a zone fight (Release K5, src/fight/wounds.ts is the data side): the Pit's own pooled blood burst (src/fight/armfeel-fx.ts, one draw call per colour)
// at the part a hit landed on, then marks and drips on the ground as its hp falls through the row's tiers. Presentation only. A new creature is a catalogue row, never code here.
// Body decals (marks ON the skin) stay the Pit's two-slot pool for now (src/fight/gore.ts createBodyWounds): the tiers' `decals` land as ground marks beside the creature.
import * as THREE from 'three';
import { createBurstPool } from './armfeel-fx.ts';
import type { Feel } from './armfeel.ts';
import { BLOOD, bloodGrow, foeBurstPull } from './blood-style.ts';
import { createBleeders, pickPart, sprayOf, unit, type WoundSpec } from './wounds.ts';

const SPOTS = 40, SPOT_LIFE = 25, DRIP_SIZE = 0.12, MARK_SPREAD = 0.45;   // marks in the ring; seconds a mark stays; m across a drip; m a body mark lands from the creature
type Spot = { mesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>; age: number; live: boolean };

export function createWoundFx(scene: THREE.Scene, anchorOf: (id: string) => THREE.Object3D | null, opts: { feel?: Feel; groundAt?: (x: number, z: number) => number; camera?: () => THREE.Camera | null; hero?: () => { x: number; z: number } } = {}) {
  const feel = opts.feel ?? 'high', pools = new Map<string, ReturnType<typeof createBurstPool>>(), bleeders = createBleeders(), ground = new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2);
  const spots: Spot[] = Array.from({ length: SPOTS }, () => {
    const mesh = new THREE.Mesh(ground, new THREE.MeshBasicMaterial({ color: '#3a0807', transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false }));
    mesh.visible = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.userData.warmHidden = true; scene.add(mesh);   // warmOwn compiles it shown (compile skips hidden objects): a wound's ground mark must not link its program at the first hit
    return { mesh, age: 0, live: false };
  });
  let next = 0;
  const pool = (start: string, end: string) => { const k = start + end; let p = pools.get(k); if (!p) { p = createBurstPool(scene, { start, end }); pools.set(k, p); } return p; };
  pool(BLOOD.start, BLOOD.end);   // made now, not at the first hit: the burst pool is an instanced MeshBasicMaterial whose program does not depend on the colour (an instance attribute), so one pool up front warms every species' (T4 2026-10-10: its link was the 'basic' program at engage)
  const mark = (x: number, z: number, size: number, colour: string) => {
    const s = spots[next++ % SPOTS]!;
    s.mesh.position.set(x, (opts.groundAt?.(x, z) ?? 0) + 0.02, z); s.mesh.scale.set(size, 1, size); s.mesh.material.color.set(colour);
    s.mesh.material.opacity = 0.85; s.mesh.visible = true; s.age = 0; s.live = true;
  };
  const v = new THREE.Vector3(), toCam = new THREE.Vector3(); let bursts = 0;
  return {
    /** A creature was hit: the Pit's burst at the part its row says (weighted by the part's share), flung away from the attacker. `seed` is the fight's (tick and id), so a replay bleeds the same. */
    hit(id: string, spec: WoundSpec, hit: { seed: number; kill: boolean; fromX: number; fromZ: number }): void {
      const spray = sprayOf(spec), anchor = anchorOf(id); if (!spray || !anchor) return;
      const part = pickPart(spec, unit(hit.seed)), bone = part.bones.map((b) => anchor.getObjectByName(b)).find(Boolean);
      (bone ?? anchor).getWorldPosition(v); if (!bone) v.y += 0.5;
      let dx = v.x - hit.fromX, dz = v.z - hit.fromZ; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      // The hero often stands between the camera and the creature: pull the burst toward the lens the way the Pit does for its foe (blood-style.ts), so it is seen on the creature, not behind him.
      let grow = 1; const cam = opts.camera?.(), hero = opts.hero?.();
      if (cam && hero) {
        const far = cam.position.distanceTo(v), near = Math.hypot(cam.position.x - hero.x, cam.position.y - 1.1, cam.position.z - hero.z), pull = foeBurstPull(far, near);
        v.addScaledVector(toCam.copy(cam.position).sub(v).normalize(), pull); grow = bloodGrow(far, near);
      }
      pool(spray.start, spray.end).burst(feel, v.x, v.y, v.z, dx, dz, hit.kill, grow, spray.amount);
      bursts++;
    },
    /** A cut (a head taken off): the species' blood at `at`, kill-sized and doubled, flung away from the killer. */
    cut(spec: WoundSpec, at: THREE.Vector3, from: { x: number; z: number }): void {
      const spray = sprayOf(spec); if (!spray) return;
      let dx = at.x - from.x, dz = at.z - from.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      pool(spray.start, spray.end).burst(feel, at.x, at.y, at.z, dx, dz, true, 1, spray.amount * 2); bursts++;
    },
    /** Every frame a creature is up: the row's tiers turn into drips and marks on the ground under it. */
    tick(id: string, spec: WoundSpec, hpFrac: number, dt: number, x: number, z: number, seed: number): void {
      const b = bleeders.tick(id, spec, hpFrac, dt), colour = spec.species.blood?.end; if (!colour) return;
      for (let i = 0; i < b.drips; i++) mark(x + (unit(seed + i) - 0.5) * 0.3, z + (unit(seed + 97 + i) - 0.5) * 0.3, DRIP_SIZE, colour);
      for (let i = 0; i < b.marks; i++) mark(x + (unit(seed + 211 + i) - 0.5) * 2 * MARK_SPREAD, z + (unit(seed + 307 + i) - 0.5) * 2 * MARK_SPREAD, spec.species.decal?.sizeM ?? 0.4, colour);
    },
    forget(id: string): void { bleeders.forget(id); },
    /** For the browser checks: bursts made, particles alive now, ground marks live. */
    debug: () => ({ bursts, alive: [...pools.values()].reduce((n, p) => n + p.alive, 0), marks: spots.filter((x) => x.live).length }),
    update(dt: number): void {
      for (const p of pools.values()) p.update(dt);
      for (const s of spots) if (s.live) { s.age += dt; const k = 1 - s.age / SPOT_LIFE; if (k <= 0) { s.live = false; s.mesh.visible = false; } else s.mesh.material.opacity = 0.85 * Math.min(1, k * 4); }
    },
    clear(): void { for (const p of pools.values()) p.clear(); for (const s of spots) { s.live = false; s.mesh.visible = false; } },
    dispose(): void { for (const p of pools.values()) p.dispose(); for (const s of spots) { scene.remove(s.mesh); s.mesh.material.dispose(); } ground.dispose(); },
  };
}
