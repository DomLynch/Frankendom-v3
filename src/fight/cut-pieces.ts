// The Minotaur's cut pieces (data/physics.json `cut`, src/fight/ragdoll.ts): a piece of his skinned body leaves it and flies on its own.
// PRESENTATION ONLY. The body is one skinned mesh per draw; a cut moves the triangles the cut bone's subtree dominates (the same rule characters.ts sever()
// bakes the finisher's head with: a triangle belongs to the bones that hold most of its weight) into a second SkinnedMesh on the SAME skeleton, so the piece
// follows its bones (the ragdoll's capsules, ragdoll.ts applyPose) with the clip's skin and its articulation, and takes them off the body's draw. Nothing
// is baked and no bone is scaled. A triangle the cut cuts across (some weight on each side) belongs to neither: a small seam the cap meshes cover.
// The body's geometry is swapped for a filtered twin that shares every attribute (its index is rewritten in place, so a second cut costs no new buffer);
// restore() puts the original geometry back and removes the pieces (the rematch).
import { BufferAttribute, BufferGeometry, type Object3D, type Raycaster, SkinnedMesh, Vector3 } from 'three';

export type Seam = { piece: number; bodyKeepBelow: number };

type Body = { original: BufferGeometry; filtered: BufferGeometry; tris: Uint32Array; count: number };
const isSkinned = (o: Object3D): o is SkinnedMesh => (o as SkinnedMesh).isSkinnedMesh === true;
const shown = (o: Object3D): boolean => { for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false; return true; };
/** Whether `b` is `root` or hangs under it. */
export const isUnder = (b: Object3D, root: Object3D): boolean => { for (let p: Object3D | null = b; p; p = p.parent) if (p === root) return true; return false; };
// A geometry that shares its attributes with another is let go without freeing theirs: only its own index goes.
const release = (g: BufferGeometry) => { for (const name of Object.keys(g.attributes)) g.deleteAttribute(name); g.dispose(); };

export function createPieceCutter(anchor: Object3D) {
  const bodies = new Map<SkinnedMesh, Body>(), pieces: SkinnedMesh[] = [];
  const draws = () => { const out: SkinnedMesh[] = []; anchor.traverse((o) => { if (isSkinned(o) && o.userData.cutPiece === undefined && shown(o)) out.push(o); }); return out; };

  return {
    pieces: pieces as readonly SkinnedMesh[],
    /** Whether the cutter has taken anything from this body yet. */
    get cut() { return pieces.length > 0; },
    /** Take the triangles `root`'s subtree holds from every visible skinned draw into pieces; the new meshes (none when `root` holds no skin). */
    carve(root: Object3D, seam: Seam): SkinnedMesh[] {
      const made: SkinnedMesh[] = [];
      for (const m of draws()) {
        const g = m.geometry, skinIndex = g.getAttribute('skinIndex'), skinWeight = g.getAttribute('skinWeight'), position = g.getAttribute('position');
        if (!skinIndex || !skinWeight || !position || g.groups.length) continue;   // a draw with several materials keeps its place (the Minotaur's draws have one each)
        const carried = m.skeleton.bones.map((b) => isUnder(b, root));
        if (!carried.includes(true)) continue;
        let body = bodies.get(m);
        if (!body) {
          const index = g.index, tris = index ? Uint32Array.from(index.array as ArrayLike<number>) : Uint32Array.from({ length: position.count }, (_, i) => i);
          const filtered = new BufferGeometry();
          for (const [name, attribute] of Object.entries(g.attributes)) filtered.setAttribute(name, attribute);
          // the body's own skin copies: a cut takes the cut bones' influence off every vertex that stays (no skin stretching to a piece that has left)
          filtered.setAttribute('skinIndex', new BufferAttribute(Uint16Array.from({ length: position.count * 4 }, (_, i) => skinIndex.getComponent((i / 4) | 0, i % 4)), 4));
          filtered.setAttribute('skinWeight', new BufferAttribute(Float32Array.from({ length: position.count * 4 }, (_, i) => skinWeight.getComponent((i / 4) | 0, i % 4)), 4));
          filtered.setIndex(new BufferAttribute(tris, 1));
          body = { original: g, filtered, tris, count: tris.length };
          bodies.set(m, body);
        }
        const si = body.filtered.getAttribute('skinIndex') as BufferAttribute, sw = body.filtered.getAttribute('skinWeight') as BufferAttribute, ia = si.array as Uint16Array, wa4 = sw.array as Float32Array;
        const share = new Float32Array(position.count).fill(-1);
        const held = (v: number) => {   // the weight the carried bones hold on this vertex
          let s = share[v]!;
          if (s >= 0) return s;
          s = 0;
          for (let j = 0; j < 4; j++) if (carried[ia[v * 4 + j]!]) s += wa4[v * 4 + j]!;
          return (share[v] = s);
        };
        const take: number[] = [], tris = body.tris;
        let keep = 0;
        for (let t = 0; t < body.count; t += 3) {   // the survivors are written over the front of the same array (never ahead of the read)
          const a = tris[t]!, b = tris[t + 1]!, c = tris[t + 2]!, wa = held(a), wb = held(b), wc = held(c);
          if ((wa + wb + wc) / 3 >= seam.piece) take.push(a, b, c);
          else if (Math.max(wa, wb, wc) < seam.bodyKeepBelow) { tris[keep++] = a; tris[keep++] = b; tris[keep++] = c; }
        }
        if (!take.length) continue;
        body.count = keep;
        m.geometry = body.filtered;
        body.filtered.setDrawRange(0, keep);
        body.filtered.index!.needsUpdate = true;
        const own = new BufferGeometry();
        for (const [name, attribute] of Object.entries(g.attributes)) own.setAttribute(name, attribute);
        own.setIndex(new BufferAttribute(Uint32Array.from(take), 1));
        // The skin of each side follows its own bones only: the piece keeps the carried influences (renormalised; a vertex with none rides the cut bone), the body
        // loses them (renormalised; a vertex with nothing else rides the bone the cut bone hangs from). Without this a vertex shared across the cut stretches
        // between the body and the piece as it flies.
        const rootAt = Math.max(0, m.skeleton.bones.indexOf(root as never)), parentAt = Math.max(0, m.skeleton.bones.indexOf(root.parent as never));
        const pi = new Uint16Array(ia.length), pw = new Float32Array(wa4.length);
        for (let v = 0; v < position.count; v++) {
          let c = 0, r = 0;
          for (let j = 0; j < 4; j++) { const w = wa4[v * 4 + j]!; if (carried[ia[v * 4 + j]!]) c += w; else r += w; }
          for (let j = 0; j < 4; j++) {
            const k = v * 4 + j, mine = carried[ia[k]!];
            pi[k] = ia[k]!; pw[k] = c > 1e-4 ? (mine ? wa4[k]! / c : 0) : 0;
            wa4[k] = r > 1e-4 ? (mine ? 0 : wa4[k]! / r) : 0;
          }
          if (c <= 1e-4) { pi[v * 4] = rootAt; pw[v * 4] = 1; }
          if (r <= 1e-4) { ia[v * 4] = parentAt; wa4[v * 4] = 1; }
        }
        sw.needsUpdate = true; si.needsUpdate = true;
        own.setAttribute('skinIndex', new BufferAttribute(pi, 4)); own.setAttribute('skinWeight', new BufferAttribute(pw, 4));
        const piece = new SkinnedMesh(own, m.material);
        piece.name = `${m.name}Cut`; piece.userData.cutPiece = true;
        piece.position.copy(m.position); piece.quaternion.copy(m.quaternion); piece.scale.copy(m.scale);
        piece.castShadow = m.castShadow; piece.receiveShadow = m.receiveShadow; piece.frustumCulled = false; piece.renderOrder = m.renderOrder;
        m.parent!.add(piece);
        piece.bindMode = m.bindMode;
        piece.bind(m.skeleton, m.bindMatrix);
        pieces.push(piece); made.push(piece);
      }
      return made;
    },
    /** The rematch: the bodies' own geometry back, the pieces gone. */
    restore() {
      for (const [m, body] of bodies) { m.geometry = body.original; release(body.filtered); }
      for (const p of pieces) { p.removeFromParent(); release(p.geometry); }
      bodies.clear(); pieces.length = 0;
    },
    /** The bone the ray strikes first on the body or a piece (the nearest vertex of the face it meets, that vertex's heaviest bone), with the point. */
    pick(ray: Raycaster, remeasure = true): { bone: Object3D; point: Vector3 } | null {
      const meshes = [...draws(), ...pieces];
      if (remeasure) for (const m of meshes) { m.computeBoundingBox(); m.computeBoundingSphere(); }   // the cached bounds are of the pose the mesh was last measured in
      const hit = ray.intersectObjects(meshes, false)[0];
      if (!hit || !hit.face || !isSkinned(hit.object)) return null;
      const m = hit.object, g = m.geometry, skinIndex = g.getAttribute('skinIndex'), skinWeight = g.getAttribute('skinWeight');
      let vertex = hit.face.a, best = Infinity;
      const v = new Vector3();
      for (const i of [hit.face.a, hit.face.b, hit.face.c]) { const d = m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld).distanceToSquared(hit.point); if (d < best) { best = d; vertex = i; } }
      let heaviest = 0, weight = -1;
      for (let j = 0; j < 4; j++) { const w = skinWeight.getComponent(vertex, j); if (w > weight) { weight = w; heaviest = skinIndex.getComponent(vertex, j); } }
      const bone = m.skeleton.bones[heaviest];
      return bone ? { bone, point: hit.point } : null;
    },
  };
}
export type PieceCutter = ReturnType<typeof createPieceCutter>;
