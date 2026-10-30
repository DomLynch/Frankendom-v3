// The Minotaur's cut pieces (data/physics.json `cut`, src/fight/ragdoll.ts): a piece of his skinned body leaves it and flies on its own.
// PRESENTATION ONLY. The body is one skinned mesh per draw; a cut moves the triangles the cut bone's subtree dominates (the same rule characters.ts sever()
// bakes the finisher's head with: a triangle belongs to the bones that hold most of its weight) into a second SkinnedMesh on the SAME skeleton, so the piece
// follows its bones (the ragdoll's capsules, ragdoll.ts applyPose) with the clip's skin and its articulation, and takes them off the body's draw. Nothing
// is baked and no bone is scaled. A triangle the cut cuts across (some weight on each side) belongs to neither: a small seam the cap meshes cover.
// The body's geometry is swapped for a filtered twin that shares every attribute (its index is rewritten in place, so a second cut costs no new buffer);
// restore() puts the original geometry back and removes the pieces (the rematch).
// The cut frame's cost (M5 follow-up, measured: 9 ms for a head, most of it here): the twin and its skin copies are built by prepare(), at load, off the
// frame; carve() itself is typed-array passes only (no per-vertex closures, no growing arrays), and the twin outlives the rematch (restore() resets it).
import { BufferAttribute, BufferGeometry, type Object3D, type Raycaster, SkinnedMesh, Vector3 } from 'three';

type Seam = { piece: number; bodyKeepBelow: number };

/** What a cut bone's subtree can touch on one draw, from the body's own skin (found at load): the bones it carries, the vertices with any carried influence, and the offsets of the triangles that use one. */
type Reach = { carried: Uint8Array; verts: Uint32Array; tris: Uint32Array };
// `tris` keeps its length for good: a triangle that leaves the body is zeroed (a degenerate triangle draws nothing), so every offset in a Reach stays true after an earlier cut.
type Body = { original: BufferGeometry; filtered: BufferGeometry; tris: Uint32Array; first: Uint32Array; share: Float32Array; take: Uint32Array; reach: Map<Object3D, Reach> };
const isSkinned = (o: Object3D): o is SkinnedMesh => (o as SkinnedMesh).isSkinnedMesh === true;
const shown = (o: Object3D): boolean => { for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false; return true; };
/** Whether `b` is `root` or hangs under it. */
export const isUnder = (b: Object3D, root: Object3D): boolean => { for (let p: Object3D | null = b; p; p = p.parent) if (p === root) return true; return false; };
// A geometry that shares its attributes with another is let go without freeing theirs: only its own index goes.
const release = (g: BufferGeometry) => { for (const name of Object.keys(g.attributes)) g.deleteAttribute(name); g.dispose(); };
/** `out` filled from `attribute` (its components, de-normalised as getComponent does): a straight copy when the array is the same type. */
function fill<T extends Uint16Array | Float32Array>(out: T, attribute: { array: ArrayLike<number>; normalized: boolean; getComponent(i: number, c: number): number }): T {
  if (!attribute.normalized && (attribute.array as object).constructor === out.constructor) out.set(attribute.array);
  else for (let i = 0; i < out.length; i++) out[i] = attribute.getComponent((i / 4) | 0, i % 4);
  return out;
}

export function createPieceCutter(anchor: Object3D) {
  const bodies = new Map<SkinnedMesh, Body>(), pieces: SkinnedMesh[] = [];
  const draws = () => { const out: SkinnedMesh[] = []; anchor.traverse((o) => { if (isSkinned(o) && o.userData.cutPiece === undefined && shown(o)) out.push(o); }); return out; };
  /** The body's twin (shares every attribute but the skin, which it copies, and its own index), built once per draw. The draw keeps its own geometry until a cut swaps the twin in. */
  function twin(m: SkinnedMesh): Body | null {
    let body = bodies.get(m);
    if (body) return body;
    const g = m.geometry, skinIndex = g.getAttribute('skinIndex'), skinWeight = g.getAttribute('skinWeight'), position = g.getAttribute('position');
    if (!skinIndex || !skinWeight || !position || g.groups.length) return null;   // a draw with several materials keeps its place (the Minotaur's draws have one each)
    const index = g.index, first = index ? Uint32Array.from(index.array as ArrayLike<number>) : Uint32Array.from({ length: position.count }, (_, i) => i);
    const filtered = new BufferGeometry();
    for (const [name, attribute] of Object.entries(g.attributes)) filtered.setAttribute(name, attribute);
    // the body's own skin copies: a cut takes the cut bones' influence off every vertex that stays (no skin stretching to a piece that has left)
    filtered.setAttribute('skinIndex', new BufferAttribute(fill(new Uint16Array(position.count * 4), skinIndex), 4));
    filtered.setAttribute('skinWeight', new BufferAttribute(fill(new Float32Array(position.count * 4), skinWeight), 4));
    const tris = first.slice();
    filtered.setIndex(new BufferAttribute(tris, 1));
    body = { original: g, filtered, tris, first, share: new Float32Array(position.count), take: new Uint32Array(tris.length), reach: new Map() };
    bodies.set(m, body);
    return body;
  }
  /** What `root`'s subtree can touch on this draw (cached; built from the body's skin as it is: a cut only ever takes influence off a vertex, so a later cut finds a subset). */
  function reachOf(m: SkinnedMesh, body: Body, root: Object3D): Reach {
    let reach = body.reach.get(root);
    if (reach) return reach;
    const carried = Uint8Array.from(m.skeleton.bones, (b) => (isUnder(b, root) ? 1 : 0)), nV = body.share.length, ia = (body.filtered.getAttribute('skinIndex') as BufferAttribute).array as Uint16Array;
    const near = new Uint8Array(nV), verts: number[] = [], tris: number[] = [], t3 = body.first;
    for (let v = 0, k = 0; v < nV; v++, k += 4) if (carried[ia[k]!]! || carried[ia[k + 1]!]! || carried[ia[k + 2]!]! || carried[ia[k + 3]!]!) { near[v] = 1; verts.push(v); }
    for (let t = 0; t < t3.length; t += 3) if (near[t3[t]!]! || near[t3[t + 1]!]! || near[t3[t + 2]!]!) tris.push(t);
    body.reach.set(root, reach = { carried, verts: Uint32Array.from(verts), tris: Uint32Array.from(tris) });
    return reach;
  }

  return {
    pieces: pieces as readonly SkinnedMesh[],
    /** Whether the cutter has taken anything from this body yet. */
    get cut() { return pieces.length > 0; },
    /** Build every visible skinned draw's twin, and what each of `roots` (the cut bones) can touch on it, now (at load, off the cut frame). */
    prepare(roots: readonly Object3D[]): void { for (const m of draws()) { const body = twin(m); if (body) for (const root of roots) reachOf(m, body, root); } },
    /** Take the triangles `root`'s subtree holds from every visible skinned draw into pieces; the new meshes (none when `root` holds no skin). */
    carve(root: Object3D, seam: Seam): SkinnedMesh[] {
      const made: SkinnedMesh[] = [];
      for (const m of draws()) {
        const body = twin(m);
        if (!body) continue;
        const g = body.original, reach = reachOf(m, body, root), carried = reach.carried;
        if (!carried.includes(1)) continue;
        const si = body.filtered.getAttribute('skinIndex') as BufferAttribute, sw = body.filtered.getAttribute('skinWeight') as BufferAttribute, ia = si.array as Uint16Array, wa4 = sw.array as Float32Array;
        const share = body.share, near = reach.verts;   // the weight the carried bones hold on each vertex (zero, as it stays, on every vertex outside `near`)
        for (let i = 0; i < near.length; i++) { const v = near[i]!, k = v * 4; share[v] = (carried[ia[k]!]! ? wa4[k]! : 0) + (carried[ia[k + 1]!]! ? wa4[k + 1]! : 0) + (carried[ia[k + 2]!]! ? wa4[k + 2]! : 0) + (carried[ia[k + 3]!]! ? wa4[k + 3]! : 0); }
        const take = body.take, tris = body.tris, reached = reach.tris, pieceMin = seam.piece, keepBelow = seam.bodyKeepBelow;
        let taken = 0;
        for (let i = 0; i < reached.length; i++) {   // only the triangles that touch a carried vertex can change
          const t = reached[i]!, a = tris[t]!, b = tris[t + 1]!, c = tris[t + 2]!;
          if (a === b && b === c) continue;   // gone with an earlier cut
          const wa = share[a]!, wb = share[b]!, wc = share[c]!;
          if ((wa + wb + wc) / 3 >= pieceMin) { take[taken++] = a; take[taken++] = b; take[taken++] = c; tris[t] = tris[t + 1] = tris[t + 2] = 0; }
          else if (!(Math.max(wa, wb, wc) < keepBelow)) tris[t] = tris[t + 1] = tris[t + 2] = 0;   // across the cut: on neither side
        }
        if (!taken) { for (let i = 0; i < near.length; i++) share[near[i]!] = 0; continue; }
        m.geometry = body.filtered;
        body.filtered.index!.needsUpdate = true;
        const own = new BufferGeometry();
        for (const [name, attribute] of Object.entries(g.attributes)) own.setAttribute(name, attribute);
        own.setIndex(new BufferAttribute(take.slice(0, taken), 1));
        // The skin of each side follows its own bones only: the piece keeps the carried influences (renormalised; a vertex with none rides the cut bone), the body
        // loses them (renormalised; a vertex with nothing else rides the bone the cut bone hangs from). Without this a vertex shared across the cut stretches
        // between the body and the piece as it flies.
        const rootAt = Math.max(0, m.skeleton.bones.indexOf(root as never)), parentAt = Math.max(0, m.skeleton.bones.indexOf(root.parent as never));
        const pi = ia.slice(), pw = new Float32Array(wa4.length);
        for (let i = 0; i < taken; i++) { const v = take[i]!; if (share[v] === 0) { pi[v * 4] = rootAt; pw[v * 4] = 1; } }   // a vertex of the piece with nothing carried (beyond `near`) rides the cut bone
        for (let i = 0; i < near.length; i++) {
          const v = near[i]!;
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
        for (let i = 0; i < near.length; i++) share[near[i]!] = 0;
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
    /** The rematch: the bodies' own geometry back, the pieces gone. The twins stay (reset to the whole body) so the next fight's first cut builds nothing. */
    restore() {
      for (const [m, body] of bodies) {
        m.geometry = body.original;
        body.tris.set(body.first);
        const g = body.original, si = body.filtered.getAttribute('skinIndex') as BufferAttribute, sw = body.filtered.getAttribute('skinWeight') as BufferAttribute;
        fill(si.array as Uint16Array, g.getAttribute('skinIndex')); fill(sw.array as Float32Array, g.getAttribute('skinWeight'));
        si.needsUpdate = sw.needsUpdate = true; body.filtered.index!.needsUpdate = true;
      }
      for (const p of pieces) { p.removeFromParent(); release(p.geometry); }
      pieces.length = 0;
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
