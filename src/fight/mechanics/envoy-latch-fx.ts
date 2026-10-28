// The Envoy's tell: a flat green glow line on the floor from him to the hero (a basic-material quad, the boss telegraph's way), brightening through the crouch and thin while latched. Presentation only.
// One mesh for the page, made on first use; the scene hands it the mechanic's view each frame. Colour, alpha and width are the row's (data/mechanics.json envoy-latch.tell).
import * as THREE from 'three';
import type { MechanicView } from './types.ts';
import { ENVOY_LATCH_ROW } from './envoy-latch.ts';

const FLAT = -Math.PI / 2;

export function createEnvoyLineFx(scene: THREE.Scene) {
  const tell = ENVOY_LATCH_ROW.tell;
  const material = new THREE.MeshBasicMaterial({ color: tell.colour, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(FLAT), material);
  mesh.renderOrder = 5; mesh.visible = false; mesh.frustumCulled = false; scene.add(mesh);
  return {
    update(view: MechanicView | null, tick: number): void {
      if (!view) { mesh.visible = false; return; }
      const dx = view.toX - view.fromX, dz = view.toZ - view.fromZ, length = Math.hypot(dx, dz);
      mesh.visible = length > 0;
      mesh.position.set(view.fromX + dx / 2, tell.liftM, view.fromZ + dz / 2);
      mesh.rotation.set(0, Math.atan2(dx, dz), 0);
      mesh.scale.set(tell.widthM, 1, length);
      material.opacity = view.phase === 'latched' ? tell.latchedAlpha : tell.alpha * (0.35 + 0.65 * view.t) * (view.phase === 'tell' ? 0.8 + 0.2 * Math.sin(tick) : 1);
    },
    dispose(): void { mesh.removeFromParent(); mesh.geometry.dispose(); material.dispose(); },
  };
}
