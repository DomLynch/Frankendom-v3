import * as THREE from 'three';
import type { MechanicView } from './types.ts';

// The ground line a straight-line boss move draws (Nan's Impale; any later lunge): one flat strip from the boss along its frozen direction, the same flat MeshBasicMaterial kit as the cast tell
// (boss-telegraph.ts), nothing loaded. Thin and faint while the aim still follows, wide and solid the moment it freezes (the roll window), bright through the lunge, gone after. Presentation only,
// read off the mechanic's view; one mesh made once, nothing allocated per frame.
const FOLLOW_WIDTH = 0.4, FOLLOW_ALPHA = 0.28, LOCK_ALPHA = 0.62, LUNGE_ALPHA = 0.8, LIFT = 0.04;

export function createLineFx(parent: THREE.Object3D) {
  const material = new THREE.MeshBasicMaterial({ color: 0xc9402a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material);
  mesh.renderOrder = 5; mesh.visible = false; mesh.name = 'mechanic line'; parent.add(mesh);
  let colour = '';
  return {
    update(view: MechanicView | null, y: number, tick: number) {
      if (!view || (view.stage !== 'tell' && view.stage !== 'lunge')) { mesh.visible = false; return; }
      if (view.colour !== colour) { colour = view.colour; material.color.set(colour); }
      const lunging = view.stage === 'lunge', locked = view.lock, width = locked ? view.width : view.width * (FOLLOW_WIDTH + 0.6 * (view.of > 0 ? Math.min(1, view.t / view.of) : 0));
      const pulse = locked && !lunging ? 0.8 + 0.2 * Math.sin(tick * 0.9) : 1;   // the frozen line breathes: it is now where the blow goes
      material.opacity = (lunging ? LUNGE_ALPHA * Math.max(0, 1 - view.t / Math.max(1, view.of)) : locked ? LOCK_ALPHA : FOLLOW_ALPHA) * pulse;
      mesh.visible = material.opacity > 0.01;
      mesh.position.set(view.x + view.dx * view.length * 0.5, y + LIFT, view.z + view.dz * view.length * 0.5);
      mesh.rotation.y = Math.atan2(view.dx, view.dz);
      mesh.scale.set(width, 1, view.length);
    },
    dispose() { mesh.removeFromParent(); mesh.geometry.dispose(); material.dispose(); },
  };
}
