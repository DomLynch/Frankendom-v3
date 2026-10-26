// Preview-only (Dom 2026-10-23 "get it done"): the hero body swapped for the Mixamo character Exo Gray, with the HERO'S OWN skeleton and clips unchanged.
// The Exo rig has 99 `mixamorig:*` bones (face and finger rigs); the hero has 65 (`pelvis`, `spine_01`, `upperarm_l` ...). So the clips cannot bind by name to Exo as it is.
// What this does instead, at the glTF level (no Blender round trip, so the hero's bone frames and clips stay byte-identical):
//   1. every hero joint that has an Exo counterpart gets its rest TRANSLATION moved to the Exo joint's world position (rotations stay the hero's), so the skeleton fits the Exo mesh;
//   2. the skin's inverse bind matrices are recomputed from those rest poses, so Exo's mesh at rest is drawn exactly as Exo made it;
//   3. Exo's skin weights are remapped onto the hero joints (face, jaw, eyes, tongue ... fold into Head; fingers 1-3 map to 01-03), duplicates merged;
//   4. the hero's skinned body meshes are dropped and Exo's meshes ride the hero skin; the hero's carried weapon nodes (SwordDrawn, SwordSheathed) and all 27 clips are kept.
//   node scripts/character/hero-exo.mjs <hero warrior.glb> <exo.glb> <out.glb>
// V3 (2026-10-26, Psyche as the hero): copied from V1 scripts/character/hero-exo.mjs as it is, plus an optional 4th argument naming the body mesh
// that becomes `Steel` (default Exo_Suit, V1's). V3 runs it on V1's warrior.glb (the Exo hero; same 65 joints and rest rotations) and a Mixamo body
// prepared by scripts/hero-body/prep-mixamo-body.py; scripts/hero-body/build-psyche.sh runs the whole chain.
//   node scripts/hero-body/hero-exo.mjs <hero warrior.glb> <mixamo body.glb> <out.glb> [steel mesh node name]
import fs from 'node:fs';
import assert from 'node:assert/strict';

const [heroFile, exoFile, outFile, steelName = 'Exo_Suit'] = process.argv.slice(2);
assert.ok(heroFile && exoFile && outFile, 'usage: hero-exo.mjs <hero.glb> <exo.glb> <out.glb>');
const read = (f) => { const b = fs.readFileSync(f), n = b.readUInt32LE(12); return { j: JSON.parse(b.subarray(20, 20 + n)), bin: Buffer.from(b.subarray(28 + n)) }; };
const H = read(heroFile), E = read(exoFile);

// ---- 4x4 column-major affine helpers --------------------------------------------------------------------------------------------------------------------------------
const ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const compose = (n) => {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
};
const invert = (m) => {   // general 4x4
  const inv = new Array(16), a = m;
  inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
  inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
  inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
  inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
  inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
  inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
  inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
  inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
  inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
  inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
  inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
  inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
  inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
  inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
  inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
  inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
  const det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12];
  assert.ok(Math.abs(det) > 1e-12, 'singular matrix');
  return inv.map((x) => x / det);
};
const worlds = (j) => {   // world matrix of every node from the hierarchy
  const parent = new Array(j.nodes.length).fill(-1);
  j.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => { parent[c] = i; }));
  const w = new Array(j.nodes.length);
  const get = (i) => w[i] ??= (parent[i] < 0 ? compose(j.nodes[i]) : mul(get(parent[i]), compose(j.nodes[i])));
  j.nodes.forEach((_, i) => get(i));
  return { w, parent };
};

// ---- hero joint <-> Exo joint ------------------------------------------------------------------------------------------------------------------------------------
const heroNames = new Map(H.j.nodes.map((n, i) => [n.name, i]));
const exoNames = new Map(E.j.nodes.map((n, i) => [n.name, i]));
const SPINE = { pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', Head: 'Head' };
const SIDE = { l: 'Left', r: 'Right' };
const exoOf = {};   // hero joint name -> Exo joint name (position source)
for (const [h, e] of Object.entries(SPINE)) exoOf[h] = `mixamorig:${e}`;
for (const [s, S] of Object.entries(SIDE)) {
  Object.assign(exoOf, {
    [`clavicle_${s}`]: `mixamorig:${S}Shoulder`, [`upperarm_${s}`]: `mixamorig:${S}Arm`, [`lowerarm_${s}`]: `mixamorig:${S}ForeArm`, [`hand_${s}`]: `mixamorig:${S}Hand`,
    [`thigh_${s}`]: `mixamorig:${S}UpLeg`, [`calf_${s}`]: `mixamorig:${S}Leg`, [`foot_${s}`]: `mixamorig:${S}Foot`, [`ball_${s}`]: `mixamorig:${S}ToeBase`,
  });
  for (const [f, F] of Object.entries({ index: 'Index', middle: 'Middle', pinky: 'Pinky', ring: 'Ring', thumb: 'Thumb' })) {
    for (let k = 1; k <= 3; k++) exoOf[`${f}_0${k}_${s}`] = `mixamorig:${S}Hand${F}${k}`;
  }
}
// weight remap: every Exo joint -> a hero joint (the mapped one; unmapped face / eye / jaw / tongue / cheek / scalp bones fold into Head; finger tips into their finger)
const heroOfExo = {};
for (const [h, e] of Object.entries(exoOf)) heroOfExo[e] = h;
const exoJointName = (i) => E.j.nodes[E.j.skins[0].joints[i]].name;
const targetOf = (name) => {
  if (heroOfExo[name]) return heroOfExo[name];
  const m = name.match(/^mixamorig:(Left|Right)Hand(Index|Middle|Pinky|Ring|Thumb)(\d)$/); if (m) return `${m[2].toLowerCase()}_0${m[3]}_${m[1] === 'Left' ? 'l' : 'r'}`;
  if (name === 'mixamorig:LeftToe_End' || name === 'mixamorig:RightToe_End') return `ball_${name.includes('Left') ? 'l' : 'r'}`;
  return 'Head';   // face rig bones, HeadTop_End, Jaw, Scalp, Throat ...
};

// ---- 1. move the hero rest joints to Exo's ----------------------------------------------------------------------------------------------------------------------------
const hw = worlds(H.j), ew = worlds(E.j);
const exoSkin0 = () => E.j.skins[0];
const heroJoints = H.j.skins[0].joints;
const order = [];   // top-down
const seen = new Set();
const visit = (i) => { if (seen.has(i)) return; seen.add(i); order.push(i); (H.j.nodes[i].children ?? []).forEach(visit); };
visit(0);
const newW = hw.w.map((m) => m.slice());
let moved = 0, unmoved = [];
for (const i of order) {
  const n = H.j.nodes[i], p = hw.parent[i], pw = p < 0 ? ident() : newW[p];
  const src = exoOf[n.name];
  if (src && exoNames.has(src) && heroJoints.includes(i)) {
    const ex = ew.w[exoNames.get(src)], target = [ex[12], ex[13], ex[14]];
    const inv = invert(pw), lt = [inv[0] * target[0] + inv[4] * target[1] + inv[8] * target[2] + inv[12], inv[1] * target[0] + inv[5] * target[1] + inv[9] * target[2] + inv[13], inv[2] * target[0] + inv[6] * target[1] + inv[10] * target[2] + inv[14]];
    n.translation = lt; delete n.matrix; moved++;
  } else if (heroJoints.includes(i)) unmoved.push(n.name);
  newW[i] = mul(pw, compose(n));
}
console.log(`moved ${moved} hero joints to Exo's; kept: ${unmoved.join(', ')}`);

// ---- output document: hero skeleton + clips + carried weapon, Exo meshes -----------------------------------------------------------------------------------------------
const out = { asset: { version: '2.0', generator: 'hero-exo.mjs' }, scene: 0, scenes: [{ name: 'Scene', nodes: [0] }], nodes: [], meshes: [], materials: [], textures: [], images: [], samplers: [], skins: [], animations: [], accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }], extensionsUsed: [] };
const parts = []; let at = 0;
const pad4 = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
const addBytes = (bytes, extra = {}) => { out.bufferViews.push({ buffer: 0, byteOffset: at, byteLength: bytes.length, ...extra }); const p = pad4(bytes); parts.push(p); at += p.length; return out.bufferViews.length - 1; };
const viewCache = new Map();   // "H:bv" -> out view
const copyView = (S, tag, bvIdx) => {
  const key = `${tag}:${bvIdx}`; if (viewCache.has(key)) return viewCache.get(key);
  const v = S.j.bufferViews[bvIdx], bytes = Buffer.from(S.bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength));
  const idx = addBytes(bytes, { ...(v.byteStride ? { byteStride: v.byteStride } : {}), ...(v.target ? { target: v.target } : {}) });
  viewCache.set(key, idx); return idx;
};
const accCache = new Map();
const copyAcc = (S, tag, ai) => {
  const key = `${tag}:${ai}`; if (accCache.has(key)) return accCache.get(key);
  const a = { ...S.j.accessors[ai] }; assert.ok(a.bufferView !== undefined && !a.sparse, 'sparse/empty accessors are not handled');
  a.bufferView = copyView(S, tag, a.bufferView); out.accessors.push(a); accCache.set(key, out.accessors.length - 1); return out.accessors.length - 1;
};
const imgCache = new Map(), texCache = new Map(), matCache = new Map();
const copyMaterial = (S, tag, mi) => {
  const key = `${tag}:${mi}`; if (matCache.has(key)) return matCache.get(key);
  const m = JSON.parse(JSON.stringify(S.j.materials[mi]));
  const tex = (t) => {
    if (!t) return t;
    const k2 = `${tag}:${t.index}`; if (!texCache.has(k2)) {
      const src = S.j.textures[t.index], im = S.j.images[src.source], k3 = `${tag}:${src.source}`;
      if (!imgCache.has(k3)) { out.images.push({ name: im.name, mimeType: im.mimeType, bufferView: copyView(S, tag, im.bufferView) }); imgCache.set(k3, out.images.length - 1); }
      let smp; if (src.sampler !== undefined) { out.samplers.push({ ...S.j.samplers[src.sampler] }); smp = out.samplers.length - 1; }
      out.textures.push({ ...(smp !== undefined ? { sampler: smp } : {}), source: imgCache.get(k3) }); texCache.set(k2, out.textures.length - 1);
    }
    return { ...t, index: texCache.get(k2) };
  };
  const pbr = m.pbrMetallicRoughness; if (pbr) { pbr.baseColorTexture = tex(pbr.baseColorTexture); pbr.metallicRoughnessTexture = tex(pbr.metallicRoughnessTexture); }
  for (const k of ['normalTexture', 'occlusionTexture', 'emissiveTexture']) if (m[k]) m[k] = tex(m[k]);
  for (const ext of Object.values(m.extensions ?? {})) for (const [k, v] of Object.entries(ext)) if (v && typeof v === 'object' && v.index !== undefined) ext[k] = tex(v);
  for (const k of Object.keys(m.extensions ?? {})) if (!out.extensionsUsed.includes(k)) out.extensionsUsed.push(k);
  out.materials.push(m); matCache.set(key, out.materials.length - 1); return out.materials.length - 1;
};
const copyMesh = (S, tag, mi) => {
  const mesh = JSON.parse(JSON.stringify(S.j.meshes[mi]));
  for (const p of mesh.primitives) {
    for (const [k, v] of Object.entries(p.attributes)) p.attributes[k] = copyAcc(S, tag, v);
    if (p.indices !== undefined) p.indices = copyAcc(S, tag, p.indices);
    if (p.material !== undefined) p.material = copyMaterial(S, tag, p.material);
  }
  out.meshes.push(mesh); return out.meshes.length - 1;
};

// hero nodes: keep everything except the skinned body meshes (their nodes carry `skin`); mesh references re-pointed after the copy
const keepNode = (i) => H.j.nodes[i].skin === undefined;
const nodeMap = new Map(); H.j.nodes.forEach((n, i) => { if (keepNode(i)) { nodeMap.set(i, out.nodes.length); out.nodes.push(JSON.parse(JSON.stringify(n))); } });
out.nodes.forEach((n) => { if (n.children) n.children = n.children.filter((c) => nodeMap.has(c)).map((c) => nodeMap.get(c)); if (n.mesh !== undefined) n.mesh = copyMesh(H, 'H', n.mesh); });
out.scenes[0].nodes = H.j.scenes[0].nodes.filter((i) => nodeMap.has(i)).map((i) => nodeMap.get(i));
const skinJoints = heroJoints.map((i) => nodeMap.get(i));
// inverse bind matrices from the NEW rest worlds, hero joint order
// Exo's positions are quantised (int16 normalised, KHR_mesh_quantization) and its mesh nodes carry no transform, so the dequantisation (D) is baked into ITS inverse bind
// matrices: IBM_exo(j) = inverse(jointWorld(j)) * D. Recover D from Exo's own matrices (same for every joint, asserted) and fold it into the new ones.
const exoIbmAcc = E.j.accessors[exoSkin0().inverseBindMatrices], exoIbmView = E.j.bufferViews[exoIbmAcc.bufferView];
const exoIbm = (k) => Array.from(new Float32Array(E.bin.buffer.slice(E.bin.byteOffset + (exoIbmView.byteOffset ?? 0) + (exoIbmAcc.byteOffset ?? 0) + k * 64, E.bin.byteOffset + (exoIbmView.byteOffset ?? 0) + (exoIbmAcc.byteOffset ?? 0) + k * 64 + 64)));
const dequant = (k) => mul(ew.w[E.j.skins[0].joints[k]], exoIbm(k));
const D = dequant(0);
for (const k of [5, 20, 40]) assert.ok(dequant(k).every((x, q) => Math.abs(x - D[q]) < 1e-3), `Exo's dequantisation differs between joints (${k})`);
console.log('Exo dequantisation scale', D[0].toFixed(4), D[5].toFixed(4), D[10].toFixed(4), 'translation', D[12].toFixed(4), D[13].toFixed(4), D[14].toFixed(4));
const ibm = new Float32Array(heroJoints.length * 16);
heroJoints.forEach((i, k) => ibm.set(mul(invert(newW[i]), D), k * 16));
const ibmAcc = out.accessors.push({ bufferView: addBytes(Buffer.from(ibm.buffer)), componentType: 5126, count: heroJoints.length, type: 'MAT4' }) - 1;
out.skins.push({ name: H.j.skins[0].name ?? 'Armature', joints: skinJoints, inverseBindMatrices: ibmAcc, ...(H.j.skins[0].skeleton !== undefined && nodeMap.has(H.j.skins[0].skeleton) ? { skeleton: nodeMap.get(H.j.skins[0].skeleton) } : {}) });
const heroIndexOf = new Map(heroJoints.map((i, k) => [H.j.nodes[i].name, k]));
// animations: hero's, accessors copied as they are, targets re-pointed
for (const an of H.j.animations) {
  out.animations.push({ name: an.name, samplers: an.samplers.map((s) => ({ input: copyAcc(H, 'H', s.input), output: copyAcc(H, 'H', s.output), ...(s.interpolation ? { interpolation: s.interpolation } : {}) })), channels: an.channels.map((c) => ({ sampler: c.sampler, target: { node: nodeMap.get(c.target.node), path: c.target.path } })) });
}
assert.ok(out.animations.every((a) => a.channels.every((c) => c.target.node !== undefined)), 'a clip targets a dropped node');

// ---- 3. Exo meshes, weights remapped onto the hero joints -------------------------------------------------------------------------------------------------------------
const exoSkin = E.j.skins[0], map = exoSkin.joints.map((_, i) => heroIndexOf.get(targetOf(exoJointName(i))));
assert.ok(map.every((x) => x !== undefined), 'an Exo joint has no hero target');
const newMeshNodes = [];
let remapped = 0, merged = 0;
E.j.nodes.forEach((n, ni) => {
  if (n.mesh === undefined || n.skin === undefined) return;
  const mi = copyMesh(E, 'E', n.mesh);
  for (const p of out.meshes[mi].primitives) {
    const ja = out.accessors[p.attributes.JOINTS_0], wa = out.accessors[p.attributes.WEIGHTS_0];
    assert.ok(ja && wa, `${n.name}: no joints/weights`);
    // the copied accessors are views into our own output parts: find the bytes (the views were copied by value, so patch the part buffer)
    const patch = (acc) => { const v = out.bufferViews[acc.bufferView]; let off = 0, k = 0; for (const part of parts) { if (off + part.length > v.byteOffset) return { buf: parts[k], base: v.byteOffset - off }; off += part.length; k++; } throw new Error('view not found'); };
    const J = patch(ja), Wt = patch(wa);
    const jsz = ja.componentType === 5121 ? 1 : 2, jstride = out.bufferViews[ja.bufferView].byteStride ?? jsz * 4;
    const wsz = { 5126: 4, 5121: 1, 5123: 2 }[wa.componentType], wstride = out.bufferViews[wa.bufferView].byteStride ?? wsz * 4;
    const rj = (i, c) => (jsz === 1 ? J.buf.readUInt8(J.base + (ja.byteOffset ?? 0) + i * jstride + c) : J.buf.readUInt16LE(J.base + (ja.byteOffset ?? 0) + i * jstride + c * 2));
    const wj = (i, c, v) => (jsz === 1 ? J.buf.writeUInt8(v, J.base + (ja.byteOffset ?? 0) + i * jstride + c) : J.buf.writeUInt16LE(v, J.base + (ja.byteOffset ?? 0) + i * jstride + c * 2));
    const rw = (i, c) => (wa.componentType === 5126 ? Wt.buf.readFloatLE(Wt.base + (wa.byteOffset ?? 0) + i * wstride + c * 4) : wa.componentType === 5121 ? Wt.buf.readUInt8(Wt.base + (wa.byteOffset ?? 0) + i * wstride + c) / 255 : Wt.buf.readUInt16LE(Wt.base + (wa.byteOffset ?? 0) + i * wstride + c * 2) / 65535);
    const ww = (i, c, v) => { if (wa.componentType === 5126) Wt.buf.writeFloatLE(v, Wt.base + (wa.byteOffset ?? 0) + i * wstride + c * 4); else if (wa.componentType === 5121) Wt.buf.writeUInt8(Math.round(v * 255), Wt.base + (wa.byteOffset ?? 0) + i * wstride + c); else Wt.buf.writeUInt16LE(Math.round(v * 65535), Wt.base + (wa.byteOffset ?? 0) + i * wstride + c * 2); };
    for (let i = 0; i < ja.count; i++) {
      const acc = new Map();
      for (let c = 0; c < 4; c++) { const w = rw(i, c); if (w > 0) acc.set(map[rj(i, c)], (acc.get(map[rj(i, c)]) ?? 0) + w); }
      if (acc.size < [0, 1, 2, 3].filter((c) => rw(i, c) > 0).length) merged++;
      const list = [...acc].sort((a, b) => b[1] - a[1]); let sum = list.reduce((s, x) => s + x[1], 0) || 1;
      for (let c = 0; c < 4; c++) { const [jj, w] = list[c] ?? [0, 0]; wj(i, c, jj); ww(i, c, w / sum); }
      remapped++;
    }
  }
  // the game's loader (characters.ts missingMap) finds the warrior's skin maps on the node named `Steel` and refuses a rig without it (a capsule stands in): Exo's suit is the body draw with both maps
  out.nodes.push({ name: n.name === steelName ? 'Steel' : n.name, mesh: mi, skin: 0 }); newMeshNodes.push(out.nodes.length - 1);
});
assert.ok(out.nodes.some((n) => n.name === 'Steel' && n.skin === 0), `no body mesh named ${steelName}: the game's loader needs one node called Steel`);
out.scenes[0].nodes.push(...newMeshNodes);
console.log(`Exo meshes ${newMeshNodes.length}, ${remapped} vertices re-weighted (${merged} had joints merged)`);

// ---- write -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (!out.extensionsUsed.length) delete out.extensionsUsed;
for (const k of ['textures', 'images', 'samplers']) if (!out[k].length) delete out[k];
if (E.j.extensionsRequired) out.extensionsRequired = E.j.extensionsRequired.filter((x) => (out.extensionsUsed ?? []).includes(x));
const quant = (E.j.extensionsUsed ?? []).includes('KHR_mesh_quantization');
if (quant) { out.extensionsUsed = [...new Set([...(out.extensionsUsed ?? []), 'KHR_mesh_quantization'])]; out.extensionsRequired = [...new Set([...(out.extensionsRequired ?? []), 'KHR_mesh_quantization'])]; }
out.buffers[0].byteLength = at;
const bin = Buffer.concat(parts), js = Buffer.from(JSON.stringify(out)), jp = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jp.length, 0); jh.write('JSON', 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.write('BIN\0', 4);
head.writeUInt32LE(12 + 8 + jp.length + 8 + bin.length, 8);
fs.writeFileSync(outFile, Buffer.concat([head, jh, jp, bh, bin]));
console.log(outFile, fs.statSync(outFile).size, 'bytes,', out.animations.length, 'clips,', out.skins[0].joints.length, 'joints');
