// Decapitation (owner 2026-09-18): the severed head's ballistic state — popped along the killing blow, gravity, a bounce or two,
// then a roll without slipping until friction stops it. Presentation only: the simulation never sees it, and the scene owns
// when a head exists (blood 'off' keeps the head on), where it is built from, and its removal.
import * as THREE from 'three';

export type SeveredHead = {
  group: THREE.Group;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  radius: number;
  resting: boolean;
};

// The pop: a short lateral fall along `axis` (killer → fallen on the ground plane, unit length) clears the victor's silhouette in the
// original front camera; the spin is about the killing blow's heading.
export function launchSeveredHead(group: THREE.Group, radius: number, axis: { x: number; z: number }, killHeading: number): SeveredHead {
  return {
    group,
    velocity: new THREE.Vector3(-axis.z * 1.1, 1.8, axis.x * 1.1),
    spin: new THREE.Vector3(Math.cos(killHeading), 0, -Math.sin(killHeading)).multiplyScalar(9),
    radius,
    resting: false,
  };
}

const spinAxis = new THREE.Vector3();
// One frame of flight: gravity, a bounce or two, then a roll without slipping until friction stops it.
export function stepSeveredHead(head: SeveredHead, dt: number): void {
  if (head.resting || dt <= 0) return;
  head.velocity.y -= 12 * dt; // a touch heavier than life: reads on a phone screen
  head.group.position.addScaledVector(head.velocity, dt);
  const rate = head.spin.length();
  if (rate > 0) {
    spinAxis.copy(head.spin).multiplyScalar(1 / rate);
    head.group.rotateOnWorldAxis(spinAxis, rate * dt);
  }
  if (head.group.position.y < head.radius) {
    head.group.position.y = head.radius;
    const speed = Math.hypot(head.velocity.x, head.velocity.z);
    if (head.velocity.y < -1) {
      head.velocity.y = -head.velocity.y * 0.28;
      head.velocity.x *= 0.68;
      head.velocity.z *= 0.68;
    } // a real bounce
    else {
      head.velocity.y = 0;
      const decay = Math.max(0, 1 - 2.1 * dt);
      head.velocity.x *= decay;
      head.velocity.z *= decay; // rolling friction
      if (speed > 0.05)
        head.spin.set(head.velocity.z / head.radius, 0, -head.velocity.x / head.radius);
      else {
        head.resting = true;
      }
    }
  }
}
