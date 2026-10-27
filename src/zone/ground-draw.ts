// Draws the zone's open ground (ground.ts sizing): the pit's own floor mesh made wider (same material and colour, no texture), the same grid laid further, the
// camera's far plane out past where the fog hides the edge. Presentation only; called once by the scene for the zone.
import * as THREE from 'three';
import STAGE from '../../data/stage.json' with { type: 'json' };
import type { Sizing } from './ground.ts';

export function drawOpenGround(group: THREE.Group, camera: THREE.PerspectiveCamera, s: Sizing): void {
  const floor = group.getObjectByName('floor') as THREE.Mesh | null;
  if (floor) { floor.geometry.dispose(); floor.geometry = new THREE.PlaneGeometry(s.floorSide, s.floorSide); }
  if (floor && s.depthPush) Object.assign(floor.material as THREE.Material, { polygonOffset: true, polygonOffsetFactor: s.depthPush.factor, polygonOffsetUnits: s.depthPush.units });
  const grid = group.children.find((c) => c instanceof THREE.GridHelper);
  if (grid) { group.remove(grid); (grid as THREE.GridHelper).geometry.dispose(); }
  const g = STAGE.grid;
  group.add(new THREE.GridHelper(s.gridSize, s.gridDivisions, g.center, g.lines));
  camera.far = s.far; camera.updateProjectionMatrix();
}
