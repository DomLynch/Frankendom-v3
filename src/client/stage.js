// The OpenTrident viewer scene as the fight stage: grid floor, plain blue sky,
// height ruler, one sun. Every value comes from data/stage.json.
import * as THREE from 'three';
// The floor alone (ground plane + grid), as a group: V3's duel stands V1's lit scene on it (src/arena-stage.ts).
export function createGround(def) {
  const group = new THREE.Group();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(def.ground.size, def.ground.size),
    new THREE.MeshStandardMaterial({ color: def.ground.color, roughness: 1 }),
  );
  ground.name = 'floor';
  ground.receiveShadow = true;
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);
  const g = def.grid;
  group.add(new THREE.GridHelper(g.size, g.divisions, g.center, g.lines));
  return group;
}
