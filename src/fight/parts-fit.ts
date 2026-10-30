// Frankendom parts, stage 2 ("you become what you kill"): put a donor body's cut part (arm, leg, head, ...) on the hero's 106-joint skeleton. Ported from OpenTrident's parts-fit.js (MIT,
// site/parts-fit.js on its psyche-seam-fix branch): the same maths, typed, the factory taken away (three is imported like the rest of src/fight), and every tuning number read from
// data/parts.json `fit` (clamps, epsilons, collar proportions) and data/parts-fit-rows.json (the per-body measure and collar rows). Dropped on purpose: OpenTrident's bakeLoadout (merge the worn
// pieces into 1-2 draws on a 2048 canvas atlas): it needs a canvas, carries its own atlas and material tuning, and is a draw-count optimisation the wear runtime can add later.
// Usage (the wear runtime):
//   const nodes = new Map<string, Object3D>(); heroRoot.traverse((o) => nodes.set(o.name, o));         // the hero's bones by name (three strips the colon: "mixamorigHead")
//   const piece = bindPiece(donorSkinnedMesh, donorSkinnedMesh.geometry, nodes);                         // GPU skinning on the hero's bones, bone lengths fitted
//   heroRoot.add(piece);
//   const lift = liftRow(unit, fitBodyOf(profile)?.measure, heroFitBody()?.measure);                      // metres to raise the hero root so the feet stay down
//   for (const row of collarRows(fitBodyOf(profile)?.measure)) { const c = buildCollar(row, nodes, piece.material, skinUvNear(donorMesh, jointWorldPos)); if (c) heroRoot.add(c); }
import { BufferAttribute, CylinderGeometry, DoubleSide, Matrix4, Quaternion, Skeleton, SkinnedMesh, Vector3 } from 'three';
import type { Bone, BufferGeometry, Material, Mesh, Object3D } from 'three';
import { PARTS, type FitRules } from '../parts.ts';
import type { CollarRow, Measure } from '../parts-fit-rows.ts';

/** The target's bones by name (a Map built by traversing the hero's root). */
export type BoneNodes = Map<string, Object3D>;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * For each donor joint, a scale in the donor bone's own frame: stretch along the bone axis (direction to its longest child) by targetBoneLength / donorBoneLength, thickness by the hips-to-head
 * height ratio. Multiplied into the donor's inverse binds, a vertex then sits at the same place relative to the TARGET's joint as it did to the donor's, so wrists, ankles and the neck land
 * on the target's own joints. `nodes`: the target's bones by name; call after updateMatrixWorld.
 */
export function fitMatrices(sk: Skeleton, nodes: BoneNodes, rules: FitRules = PARTS.fit, thick = 1): Matrix4[] {
  const { limits, eps, bones } = rules;
  const bone = (name: string) => sk.bones.find((b) => b.name === name), wp = (o: Object3D) => new Vector3().setFromMatrixPosition(o.matrixWorld);
  const dH = bone(bones.hips), dHead = bone(bones.head), tH = nodes.get(bones.hips), tHead = nodes.get(bones.head);
  let g = 1;
  if (dH && dHead && tH && tHead) {
    const a = wp(dHead).distanceTo(wp(dH)), b = wp(tHead).distanceTo(wp(tH));
    if (a > eps.heightM && b > eps.heightM) g = clamp(b / a, limits.heightLo, limits.heightHi);
  }
  g *= thick;   // the donor row's own nudge (data/parts-fit-rows.json tune.<unit>.thick): a bulky unit is slimmed on its own, the clamp above is shared
  return sk.bones.map((b) => {
    let kid: Object3D | null = null, kl = 0;
    for (const c of b.children) if ((c as Bone).isBone && c.position.length() > kl) { kid = c; kl = c.position.length(); }
    let r = g;
    const ax = new Vector3(0, 1, 0);
    if (kid && kl > eps.boneM) {
      const tk = nodes.get(kid.name);
      ax.copy(kid.position).normalize();
      if (tk) r = clamp(tk.position.length() / kl, limits.boneLo, limits.boneHi);
    }
    // M = g I + (r - g) a aT, written by its columns: column c = g e_c + (r - g) a_c a
    const column = (e: Vector3, a: number) => e.multiplyScalar(g).addScaledVector(ax, (r - g) * a);
    return new Matrix4().makeBasis(column(new Vector3(1, 0, 0), ax.x), column(new Vector3(0, 1, 0), ax.y), column(new Vector3(0, 0, 1), ax.z));
  });
}

/** Bind a donor's SkinnedMesh to the target's bones by name (a bone the target lacks falls back to its nearest named ancestor). `fitted` false keeps the donor's own inverse binds. */
export function bindPiece(src: SkinnedMesh, geo: BufferGeometry, nodes: BoneNodes, fitted = true, rules: FitRules = PARTS.fit, thick = 1): SkinnedMesh {
  const sk = src.skeleton, bones: Bone[] = [], inv: Matrix4[] = [], fm = fitted ? fitMatrices(sk, nodes, rules, thick) : null, first = nodes.values().next().value as Object3D;
  for (let i = 0; i < sk.bones.length; i++) {
    let a: Object3D | null = sk.bones[i]!;
    while (a && !nodes.has(a.name)) a = a.parent;
    bones.push((a ? nodes.get(a.name)! : first) as Bone);
    inv.push(fm ? fm[i]!.clone().multiply(sk.boneInverses[i]!) : sk.boneInverses[i]!);
  }
  const mesh = new SkinnedMesh(geo, src.material);
  mesh.name = src.name; mesh.frustumCulled = false; mesh.castShadow = true;
  mesh.bind(new Skeleton(bones, inv), src.bindMatrix);
  return mesh;
}

/**
 * Height lift for a part, from two measure rows (data/parts-fit-rows.json, metres). Legs (data/parts.json fit.lift.unit) are the only unit that moves the feet: fitMatrices stretches the
 * donor's thigh+shin to the target's, so the leftover is nonzero only when a clamp bites (the donor leg far longer or shorter than the target's).
 *   scale  = the bone stretch fitMatrices applies along the leg (clamped)
 *   lift_y = metres to raise the whole character root so the feet stay on the ground (negative = the feet float, lower the root); 0 for every other unit, and for a body with no measure row.
 */
export function liftRow(unit: string, donor: Measure | null | undefined, target: Measure | null | undefined, rules: FitRules = PARTS.fit): { scale: number; lift_y: number } {
  const leg = (m: Measure | null | undefined) => rules.lift.keys.reduce((sum, k) => sum + (m?.[k] ?? 0), 0);
  if (unit !== rules.lift.unit || !leg(donor) || !leg(target)) return { scale: 1, lift_y: 0 };
  const scale = clamp(leg(target) / leg(donor), rules.limits.boneLo, rules.limits.boneHi);
  return { scale, lift_y: leg(donor) * scale - leg(target) };
}

// ---- collars: a short open tube over each cut seam (neck, shoulders, hips), owned by the equipped DONOR part --------------------------------------------------------------------------
// The cut leaves a step (two different radii) and a few open edges where a donor part meets the hero. A collar is a rigid ring on the joint's bone, radius from the donor's measure row,
// drawn double sided in the donor's own skin colour. row = { id, bone, at, r, h }: ring centre at `at` x (length of the bone to its first child) along the bone, radius r, height h (metres).

/** The collar rows of a body from its measure row (the rules are data/parts.json fit.collar; the stored rows of data/parts-fit-rows.json equal this). No measure row: no collars. */
export function collarRows(m: Measure | null | undefined, rules: FitRules = PARTS.fit): CollarRow[] {
  const c = rules.collar;
  if (!m || !m[c.heightKey]) return [];
  const read = (key: string): number => {
    const fb = c.fallback[key];
    return m[key] || (fb ? fb.k * (fb.of ? (m[fb.of] ?? 0) : 1) : 0);
  };
  const round = (v: number) => Math.round(v * c.roundScale) / c.roundScale;
  return c.joints.map((j) => {
    const rule = c.rules[j.rule]!;
    return { id: j.id, bone: j.bone, at: j.at, r: round(rule.rK * read(rule.rOf)), h: round(Math.max(rule.hMin, rule.hK * read(rule.hOf))) };
  });
}

/** A collar row with the donor row's own nudge applied (tune.<unit>.collarR / collarH; absent = unchanged), rounded like collarRows. */
export function tuneCollar(row: CollarRow, tune: { collarR?: number; collarH?: number }, rules: FitRules = PARTS.fit): CollarRow {
  const round = (v: number) => Math.round(v * rules.collar.roundScale) / rules.collar.roundScale;
  return { ...row, r: round(row.r * (tune.collarR ?? 1)), h: round(row.h * (tune.collarH ?? 1)) };
}

/** The uv of the donor vertex nearest `worldPos` (the joint, in the donor's bind pose): one texel of the donor's skin, used for the whole collar so it matches the part it covers. */
export function skinUvNear(mesh: Mesh, worldPos: Vector3): [number, number] {
  const P = mesh.geometry.attributes.position!, U = mesh.geometry.attributes.uv, v = new Vector3(), local = worldPos.clone().applyMatrix4(mesh.matrixWorld.clone().invert());
  let best = 0, bd = Infinity;
  for (let i = 0; i < P.count; i++) { const d = v.fromBufferAttribute(P, i).distanceToSquared(local); if (d < bd) { bd = d; best = i; } }
  return U ? [U.getX(best), U.getY(best)] : [0, 0];
}

/** A measured cut ring: radius (metres), the median uv of its vertices, and how many vertices made it. */
export type SeamRing = { r: number; uv: [number, number]; n: number };

/**
 * The donor part's own cut ring (OpenTrident PR #12): the vertices within `rules.seam.bandM` metres of the cut plane (through `jointWorld`, normal `axisWorld`, both in world space).
 * r = the `percentile` of their distance from the axis, uv = the `uvPercentile` of their uvs. Null when fewer than `minVerts` vertices lie in the band. Measure the hero's hole the same way on the
 * hero piece being replaced, then ask collarFor.
 */
export function seamRing(mesh: Mesh, jointWorld: Vector3, axisWorld: Vector3, rules: FitRules = PARTS.fit): SeamRing | null {
  const P = mesh.geometry.attributes.position!, U = mesh.geometry.attributes.uv, inv = mesh.matrixWorld.clone().invert(), { bandM, minVerts, percentile, uvPercentile } = rules.seam;
  const j = jointWorld.clone().applyMatrix4(inv), a = axisWorld.clone().transformDirection(inv).normalize(), v = new Vector3(), rs: number[] = [], us: number[] = [], vs: number[] = [];
  const scale = mesh.matrixWorld.getMaxScaleOnAxis(), bandLocal = bandM / (scale || 1);
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).sub(j);
    const h = v.dot(a);
    if (Math.abs(h) > bandLocal) continue;
    rs.push(v.addScaledVector(a, -h).length() * scale);
    if (U) { us.push(U.getX(i)); vs.push(U.getY(i)); }
  }
  if (rs.length < minVerts) return null;
  const q = (arr: number[], f: number) => arr.slice().sort((x, y) => x - y)[Math.min(arr.length - 1, Math.floor(arr.length * f))]!;
  return { r: q(rs, percentile), uv: U ? [q(us, uvPercentile), q(vs, uvPercentile)] : [0, 0], n: rs.length };
}

/**
 * The collar rule (OpenTrident PR #12): a donor ring at least `limits.coverFrac` x the hero's ring covers the hole by itself, so no collar (null); otherwise the row with its radius set to the
 * mean of the two rings x `limits.meanK`, and `uv` the donor ring's texel. Without both rings the row stands as collarRows gave it and `uv` is null (use skinUvNear).
 */
export function collarFor(row: CollarRow, donor: SeamRing | null, hero: SeamRing | null, rules: FitRules = PARTS.fit): { row: CollarRow; uv: [number, number] | null } | null {
  if (donor && hero && donor.r >= hero.r * rules.limits.coverFrac) return null;
  if (!donor || !hero) return { row, uv: donor ? donor.uv : null };
  const round = rules.collar.roundScale, rings = [donor.r, hero.r], mean = rings.reduce((s, r) => s + r, 0) / rings.length;
  return { row: { ...row, r: Math.round(mean * rules.limits.meanK * round) / round }, uv: donor.uv };
}

/**
 * A collar as a SkinnedMesh on one bone of the target (rigid). Call while the target is in its bind pose (right after load, before any clip); `material` = the donor part's material (cloned
 * here, double sided), `uv` from skinUvNear. Add the result to the same root as the other pieces. Null when the target lacks the row's bone.
 */
export function buildCollar(row: CollarRow, nodes: BoneNodes, material: Material, uv: readonly [number, number], rules: FitRules = PARTS.fit): SkinnedMesh | null {
  const bone = nodes.get(row.bone) as Bone | undefined;
  if (!bone) return null;
  const { influences, uvStride } = rules.skin;
  let kid: Object3D | null = null;
  for (const c of bone.children) if ((c as Bone).isBone && (!kid || c.position.length() > kid.position.length())) kid = c;
  const along = kid ? kid.position.length() * row.at : 0, geo = new CylinderGeometry(row.r, row.r, row.h, rules.collar.segments, 1, true);
  const axis = kid ? kid.position.clone().normalize() : new Vector3(0, 1, 0);
  geo.applyMatrix4(new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), axis)));
  geo.translate(axis.x * along, axis.y * along, axis.z * along);
  bone.updateWorldMatrix(true, false); geo.applyMatrix4(bone.matrixWorld);                    // vertices in the bind-pose world space
  const n = geo.attributes.position!.count, si = new Uint16Array(n * influences), sw = new Float32Array(n * influences), uvs = new Float32Array(n * uvStride);
  for (let i = 0; i < n; i++) { sw[i * influences] = 1; uvs[i * uvStride] = uv[0]; uvs[i * uvStride + 1] = uv[1]; }
  geo.setAttribute('skinIndex', new BufferAttribute(si, influences)); geo.setAttribute('skinWeight', new BufferAttribute(sw, influences)); geo.setAttribute('uv', new BufferAttribute(uvs, uvStride));
  const mat = material.clone(); mat.side = DoubleSide;
  const mesh = new SkinnedMesh(geo, mat);
  mesh.name = `collar_${row.id}`; mesh.frustumCulled = false; mesh.userData.region = 'collar';
  mesh.bind(new Skeleton([bone], [bone.matrixWorld.clone().invert()]), new Matrix4());
  return mesh;
}
