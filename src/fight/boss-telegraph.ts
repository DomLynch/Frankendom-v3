import * as THREE from 'three';
import { RULES } from './moves.ts';
import type { Fighter } from './duel.ts';

// Ground telegraph for a rank 8-10 boss special (brief #1507 item 2; a ?telegraph=1 look-test, renderer only). While the boss winds up, a ring fills on the floor
// under the hero: where the blow will land, so a roll is the answer without any text. Read off the sim's own windup ticks (specialStage's source), never written back.
export const telegraphFlag = (search: string): boolean => /[?&]telegraph=(1|on|ring)\b/i.test(search);
const ROLL_TICKS = 24;   // the last stretch of the windup, when the ring flashes: the roll window
export const telegraphLook = (caster: Pick<Fighter, 'specialShare' | 'special' | 'health'>): { fill: number; flash: boolean } | null => {
  if (caster.specialShare !== RULES.special.bossDamage || !caster.special || !caster.health) return null;
  return { fill: 1 - caster.special / RULES.special.windup, flash: caster.special <= ROLL_TICKS };
};

export function createBossTelegraph(scene: THREE.Scene) {
  const group = new THREE.Group(); group.visible = false; group.renderOrder = 5;
  const make = (geometry: THREE.BufferGeometry, color: number) => {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry.rotateX(-Math.PI / 2), material); mesh.renderOrder = 5; group.add(mesh); return mesh;
  };
  const ring = make(new THREE.RingGeometry(0.92, 1, 48), 0xff5a1f), fill = make(new THREE.CircleGeometry(1, 48), 0xd83a10);
  scene.add(group);
  return {
    update(boss: Fighter, at: THREE.Vector3 | null, tick: number) {
      const look = telegraphLook(boss);
      group.visible = !!look && !!at;
      if (!look || !at) return;
      const radius = RULES.special.reach * 0.4;   // 1.2 m: about a body and a half, readable at 375 wide on the fight camera
      group.position.set(at.x, at.y + 0.03, at.z); group.scale.setScalar(radius);
      const pulse = look.flash ? 0.65 + 0.35 * Math.sin(tick * 0.9) : 1;
      ring.material.opacity = (0.3 + 0.5 * look.fill) * pulse;
      fill.scale.setScalar(Math.max(0.02, look.fill)); fill.material.opacity = (0.12 + 0.3 * look.fill * look.fill) * pulse;
    },
    dispose() { group.removeFromParent(); for (const m of group.children as THREE.Mesh[]) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } },
  };
}
