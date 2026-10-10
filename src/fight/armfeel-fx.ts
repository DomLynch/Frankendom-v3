// ?look=armfeel's visible effect (armfeel.ts has the numbers): the pooled impact burst (the white body flash was removed: Dom 2026-10-06, it read as a glitch). Presentation only,
// built once when the flag is on and not at all otherwise; nothing here allocates per hit (the pool, the colour and the transform helpers are made up front).
import * as THREE from 'three';
import { newParticle, tickParticle, type Feel, type Particle } from './armfeel.ts';
import { BLOOD, bloodCount, makeRng, spawnBlood } from './blood-style.ts';

// One shared 112-slot InstancedMesh, no shadows, one draw call. `burst` fills the next slots of the ring; `update` moves, shrinks and dims them.
export function createBurstPool(scene: THREE.Scene) {
  const rnd = makeRng(0x5eed1234);
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), BLOOD.slots);   // unit-diameter droplets, unlit: the colour is the blood's own (a lit material came out bright red under the arena's sun), no glow
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.visible = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.name = 'armfeel burst';
  mesh.setColorAt(0, new THREE.Color(BLOOD.start));   // allocates the instance colour buffer once, up front
  scene.add(mesh);
  const slots: Particle[] = Array.from({ length: BLOOD.slots }, newParticle), pose = new THREE.Object3D(), color = new THREE.Color(), start = new THREE.Color(BLOOD.start), end = new THREE.Color(BLOOD.end), up = new THREE.Vector3(0, 1, 0), heading = new THREE.Vector3();
  let next = 0, live = 0;
  return {
    mesh,
    get alive() { return live; },
    get capacity() { return slots.length; },
    burst(feel: Feel, x: number, y: number, z: number, dx: number, dz: number, kill: boolean, grow = 1): void {
      const count = bloodCount(feel, kill);
      for (let i = 0; i < count; i++) spawnBlood(slots[next++ % slots.length], i, x, y, z, dx, dz, kill, feel, rnd, grow);
    },
    update(dt: number): void {
      live = 0;
      for (let i = 0; i < slots.length; i++) {
        const p = slots[i];
        if (tickParticle(p, dt)) {
          live++; const k = p.life / p.total, s = p.size * k;
          pose.position.set(p.x, p.y, p.z);
          if (heading.set(p.vx, p.vy, p.vz).lengthSq() > 1e-6) pose.quaternion.setFromUnitVectors(up, heading.normalize());   // the droplet's long axis follows its flight
          pose.scale.set(s, s * p.stretch, s);
          color.copy(end).lerp(start, k); mesh.setColorAt(i, color);
        } else pose.scale.setScalar(0);
        pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix);
      }
      mesh.visible = live > 0; mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    clear(): void { for (const p of slots) p.life = 0; live = 0; mesh.visible = false; },
    dispose(): void { scene.remove(mesh); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.dispose(); },
  };
}
