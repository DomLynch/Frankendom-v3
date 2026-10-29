// The Envoy's tell: a flat green glow line on the floor from him to the hero (a basic-material quad, the boss telegraph's way), brightening through the crouch and thin while latched. Presentation only.
// One mesh in the runtime's group; the runtime hands it the mechanic's view each frame. Colour, alpha and width are the row's (data/mechanics.json envoy-latch.tell). The registry's runtime (type "envoy-latch")
// is below: the page applies `pre` (the latch's drain and slow, and the lunge) and `layer` (the held Envoy) around the sim tick while he is engaged (src/client/main.ts); `tick` wipes the move when he is not.
import * as THREE from 'three';
import type { Practice } from '../combat.ts';
import type { Duel, Intent } from '../duel.ts';
import type { MechanicRuntime } from './runtime.ts';
import { createEnvoyLatch, heldBoss, type EnvoyLatchRow, type LatchView } from './envoy-latch.ts';

const FLAT = -Math.PI / 2;

export function createEnvoyLineFx(parent: THREE.Object3D, tell: EnvoyLatchRow['tell']) {
  const material = new THREE.MeshBasicMaterial({ color: tell.colour, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(FLAT), material);
  mesh.renderOrder = tell.renderOrder; mesh.visible = false; mesh.frustumCulled = false; parent.add(mesh);
  return {
    update(view: LatchView | null, tick: number): void {
      if (!view) { mesh.visible = false; return; }
      const gap = Math.hypot(view.toX - view.fromX, view.toZ - view.fromZ), reach = gap + tell.beyondM, k = gap > 0 ? reach / gap : 0;   // the line runs on past the hero: at melee range a line only to his feet reads as a patch of floor
      const dx = (view.toX - view.fromX) * k, dz = (view.toZ - view.fromZ) * k, length = Math.hypot(dx, dz);
      mesh.visible = length > 0;
      mesh.position.set(view.fromX + dx / 2, tell.liftM, view.fromZ + dz / 2);
      mesh.rotation.set(0, Math.atan2(dx, dz), 0);
      mesh.scale.set(tell.widthM, 1, length);
      material.opacity = view.phase === 'latched' ? tell.latchedAlpha : tell.alpha * (tell.alphaFloor + tell.alphaRise * view.t) * (view.phase === 'tell' ? tell.pulseBase + tell.pulseDepth * Math.sin(tick) : 1);
    },
    dispose(): void { mesh.removeFromParent(); mesh.geometry.dispose(); material.dispose(); },
  };
}

export function createEnvoyLatchRuntime(row: EnvoyLatchRow): MechanicRuntime {
  const core = createEnvoyLatch(row), group = new THREE.Group(), line = createEnvoyLineFx(group, row.tell);
  let tick = 0, holding = false;
  return {
    boss: row.boss, group, core, ctx: null,
    reset: () => { core.reset(); holding = false; },
    pre(duel: Duel, hero: Intent) { tick = duel.tick; const s = core.step(duel, hero); holding = s.hold; return s; },
    layer: (duel: Duel, warden: Intent): Intent => (holding ? heldBoss(duel, warden) : warden),
    tick(practice: Practice, on: boolean): Practice { if (!on) { core.reset(); holding = false; } return practice; },
    frame: () => line.update(core.view(), tick),
  };
}
