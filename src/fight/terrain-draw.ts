// Draws the zone's terrain (data/terrain.json, src/zone/terrain.ts): a square mesh of the height function around the hero, the old flat floor lowered a hair beneath it and carrying on past its edge,
// the stage's grid draped on it. Presentation only. The mesh re-centres in whole lattice steps (so the hills stand still in the world), and the heights are written only then.
import * as THREE from 'three';
import STAGE from '../../data/stage.json' with { type: 'json' };
import type { Terrain, TerrainRows } from '../zone/terrain.ts';

export type TerrainDraw = {
  /** The terrain's height at (x, z) in the pit's frame (0 on every pad). */
  height(x: number, z: number): number;
  /** The hills' own material (a clone of the floor's): the biome ring's tint (scene.ringLook) multiplies it too. */
  material: THREE.Material;
  /** Re-centre on the hero; true when the mesh was rebuilt this call. */
  update(x: number, z: number): boolean;
  /** The draped grid and the mesh, for the sand-melt fade to adopt. */
  group: THREE.Group;
};
export type FadeHook = { adopt(root: THREE.Object3D): void } | null;

/** The sand-melt measures how far a surface is below the eye (skyview.ts): on a hill that would melt the hill's top away. This measures it against level ground (y 0) instead. */
function levelFade(material: THREE.Material): void {
  const prev = material.onBeforeCompile, key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('vFadeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;', 'vFadeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; vFadeWorld.y = 0.0;');
  };
  material.customProgramCacheKey = () => `${key()}-level`;
  material.needsUpdate = true;
}

export function drawTerrain(o: { parent: THREE.Object3D; floor: THREE.Mesh; scale: number; gridRadiusMetres: number; terrain: Terrain; rows: TerrainRows; fade: FadeHook }): TerrainDraw {
  const { terrain, rows, floor } = o, M = rows.mesh;
  const gridCell = (STAGE.grid.size / STAGE.grid.divisions) * o.scale, cell = gridCell * M.gridCellsPerVertex, snap = cell * M.anchorCells;
  const half = Math.floor(M.radiusMetres / cell), side = half + half + 1, reach = half * cell;
  const smooth = (t: number) => t * t * (rows.smooth.a - rows.smooth.b * t);

  const group = new THREE.Group();
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(side * side * 3), hs = new Float32Array(side * side);
  for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) { const k = (j * side + i) * 3; pos[k] = (i - half) * cell; pos[k + 2] = (j - half) * cell; }
  const index = new Uint32Array((side - 1) * (side - 1) * 6);
  let n = 0;
  for (let j = 0; j < side - 1; j++) for (let i = 0; i < side - 1; i++) { const a = j * side + i, b = a + 1, c = a + side, d = c + 1; index.set([a, c, b, b, c, d], n); n += 6; }   // faces up (+y)
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(index, 1));
  const floorMaterial = (floor.material as THREE.Material).clone();
  const mesh = new THREE.Mesh(geo, floorMaterial);
  mesh.receiveShadow = floor.receiveShadow; mesh.castShadow = false; mesh.frustumCulled = false; mesh.name = 'terrain';
  group.add(mesh);

  // The grid, draped: lines on the stage's own cell, cut every mesh cell, the heights read off the mesh's own samples (bilinear), so each line lies on the surface.
  const lines = Math.floor(o.gridRadiusMetres / gridCell), cuts = Math.min(half, Math.floor(o.gridRadiusMetres / cell)), per = cuts + cuts + 1;
  const total = (lines + lines + 1) * per * 2, gpos = new Float32Array(total * 3), cellAt = new Uint32Array(total), fx = new Float32Array(total), fz = new Float32Array(total);
  const gidx = new Uint32Array((lines + lines + 1) * (per - 1) * 2 * 2);
  let p = 0, q = 0;
  for (let axis = 0; axis < 2; axis++) for (let l = -lines; l <= lines; l++) {
    const base = p;
    for (let s = -cuts; s <= cuts; s++) {
      const lx = axis === 0 ? s * cell : l * gridCell, lz = axis === 0 ? l * gridCell : s * cell;
      gpos[p * 3] = lx; gpos[p * 3 + 2] = lz;
      const u = lx / cell + half, v = lz / cell + half, i0 = Math.min(side - 2, Math.floor(u)), j0 = Math.min(side - 2, Math.floor(v));
      cellAt[p] = j0 * side + i0; fx[p] = u - i0; fz[p] = v - j0; p++;
    }
    for (let s = 0; s < per - 1; s++) { gidx[q++] = base + s; gidx[q++] = base + s + 1; }
  }
  const ggeo = new THREE.BufferGeometry();
  ggeo.setAttribute('position', new THREE.BufferAttribute(gpos.subarray(0, p * 3), 3)); ggeo.setIndex(new THREE.BufferAttribute(gidx.subarray(0, q), 1));
  const gmat = new THREE.LineBasicMaterial({ color: STAGE.grid.lines, toneMapped: false });
  const grid = new THREE.LineSegments(ggeo, gmat); grid.frustumCulled = false; grid.name = 'terrain-grid';
  group.add(grid);

  o.parent.add(group);
  o.fade?.adopt(group);
  if (o.fade && M.fadeFlat) { levelFade(floorMaterial); levelFade(gmat); }

  let ax = Number.NaN, az = Number.NaN;
  const normals = () => geo.computeVertexNormals();
  return {
    height: (x, z) => terrain.height(x, z),
    material: floorMaterial,
    group,
    update(x, z) {
      const nx = Math.round(x / snap) * snap, nz = Math.round(z / snap) * snap;
      if (nx === ax && nz === az) return false;
      ax = nx; az = nz;
      for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) {
        const k = j * side + i, lx = pos[k * 3]!, lz = pos[k * 3 + 2]!;
        const edge = (reach - Math.max(Math.abs(lx), Math.abs(lz))) / M.edgeTaperMetres, w = edge >= 1 ? 1 : edge <= 0 ? 0 : smooth(edge);
        const h = w === 0 ? 0 : terrain.height(nx + lx, nz + lz) * w;
        hs[k] = h; pos[k * 3 + 1] = h;
      }
      for (let g = 0; g < p; g++) { const c = cellAt[g]!, a = hs[c]!, b = hs[c + 1]!, cc = hs[c + side]!, d = hs[c + side + 1]!, u = fx[g]!, v = fz[g]!; gpos[g * 3 + 1] = (a + (b - a) * u) * (1 - v) + (cc + (d - cc) * u) * v + M.gridLiftMetres; }
      geo.attributes.position!.needsUpdate = true; ggeo.attributes.position!.needsUpdate = true;
      normals();
      mesh.position.set(nx, 0, nz); grid.position.set(nx, 0, nz);
      return true;
    },
  };
}
