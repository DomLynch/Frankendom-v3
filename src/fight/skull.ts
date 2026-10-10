import { Box3, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, DoubleSide, Vector3, DataTexture, RGBAFormat, SRGBColorSpace } from 'three';

// A sever() bake in Head-bone coordinates: x is left/right, y is up. Clip triangles at the centre plane rather than
// stretching faces across the wound. Borrow the fighter's exterior materials; own only the cut material/geometries.
export function splitSkull(source: Group) {
  const group = new Group(); group.name = 'SplitCrown';
  // Small original mottled tissue map: avoid a bright, perfectly flat red cut surface on the phone.
  const pixels = new Uint8Array(64*64*4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const grain = (Math.sin(x*127.1+y*311.7)*43758.5453)%1;
    const vein = Math.sin(x*.6+Math.sin(y*.35)*3) > .8 ? .45 : 1;
    const shade = (.75 + Math.abs(grain)*.25)*vein, i = (y*64+x)*4;
    pixels.set([200*shade, 175*shade, 165*shade, 255], i);
  }
  const texture = new DataTexture(pixels, 64, 64, RGBAFormat); texture.colorSpace = SRGBColorSpace; texture.needsUpdate = true;
  const cut = new MeshStandardMaterial({ color: '#441619', map: texture, roughness: .86, side: DoubleSide });
  const bounds = new Box3().setFromObject(source), hinge = Math.max(bounds.min.y, -.045);
  const halves = [-1, 1].map(side => {
    const half = new Group(); half.name = side < 0 ? 'SkullLeft' : 'SkullRight'; half.position.y = hinge; group.add(half);
    for (const object of source.children) {
      if (!(object instanceof Mesh)) continue;
      const geometry = object.geometry, position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv'), index = geometry.index;
      const positions: number[] = [], normals: number[] = [], uvs: number[] = [], edges: Vector3[][] = [];
      type Vertex = { p: Vector3; n: Vector3; u: number; v: number };
      const vertex = (i: number): Vertex => ({ p: new Vector3().fromBufferAttribute(position, i), n: new Vector3().fromBufferAttribute(normal, i), u: uv?.getX(i) ?? 0, v: uv?.getY(i) ?? 0 });
      for (let i = 0; i < (index?.count ?? position.count); i += 3) {
        const triangle = [0, 1, 2].map(k => vertex(index ? index.getX(i + k) : i + k));
        const polygon: Vertex[] = [], crossing: Vector3[] = [];
        for (let k = 0; k < 3; k++) {
          const a = triangle[k], b = triangle[(k + 1) % 3], inside = a.p.x * side >= 0;
          if (inside) polygon.push(a);
          if (inside === (b.p.x * side >= 0)) continue;
          const t = -a.p.x / (b.p.x - a.p.x), p = a.p.clone().lerp(b.p, t); p.x = 0;
          polygon.push({ p, n: a.n.clone().lerp(b.n, t).normalize(), u: a.u + (b.u - a.u)*t, v: a.v + (b.v - a.v)*t });
          crossing.push(p);
        }
        if (crossing.length === 2) edges.push(crossing);
        for (let k = 1; k < polygon.length - 1; k++) for (const v of [polygon[0], polygon[k], polygon[k + 1]]) {
          positions.push(v.p.x, v.p.y - hinge, v.p.z); normals.push(v.n.x, v.n.y, v.n.z); uvs.push(v.u, v.v);
        }
      }
      if (positions.length) {
        const skin = new BufferGeometry(); skin.setAttribute('position', new Float32BufferAttribute(positions, 3));
        skin.setAttribute('normal', new Float32BufferAttribute(normals, 3)); skin.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
        const mesh = new Mesh(skin, object.material); mesh.castShadow = true; mesh.frustumCulled = false; half.add(mesh);
      }
      // The head's convex centre slice is closed with a fan of the exact cut edges; no hollow shells visible from behind.
      if (edges.length) {
        const center = new Vector3(); for (const edge of edges) for (const p of edge) center.add(p); center.divideScalar(edges.length * 2);
        const cap: number[] = [], capUV: number[] = [], capNormal: number[] = [];
        for (const edge of edges) for (const p of [center, ...edge]) {
          cap.push(p.x, p.y - hinge, p.z); capNormal.push(-side, 0, 0);
          capUV.push((p.z-bounds.min.z)/(bounds.max.z-bounds.min.z), (p.y-bounds.min.y)/(bounds.max.y-bounds.min.y));
        }
        const interior = new BufferGeometry(); interior.setAttribute('position', new Float32BufferAttribute(cap, 3));
        interior.setAttribute('normal', new Float32BufferAttribute(capNormal, 3)); interior.setAttribute('uv', new Float32BufferAttribute(capUV, 2));
        const mesh = new Mesh(interior, cut); mesh.name = 'SkullCut'; mesh.frustumCulled = false; half.add(mesh);
      }
    }
    return half;
  });
  return {
    group,
    open(amount: number, dark: boolean) {
      const t = Math.max(0, Math.min(1, amount));
      halves.forEach((half, i) => { const side = i ? 1 : -1; half.rotation.z = -side * .19 * t; half.position.x = side * .008 * t; });
      cut.color.set(dark ? '#302126' : '#441619');
    },
    dispose() { group.removeFromParent(); group.traverse(o => { if (o instanceof Mesh) o.geometry.dispose(); }); cut.dispose(); texture.dispose(); }
  };
}
