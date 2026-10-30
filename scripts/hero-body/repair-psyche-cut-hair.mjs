// Parts-wear step 1: OpenTrident's derived Psyche cut (psyche-106.cut.derived.glb) has its hair garbled: the cut tool split the hair draw
// ('Ch22_hair', the old file's Ch22_Eyelashes mesh, 9,348 verts, all on the Head joint) into every piece, re-bound each copy to that piece's own
// root bone (Hips, Neck, LeftArm ...) and read it in the body's skin space, but the old file's hair has its OWN skin whose inverse bind
// matrices carry the hair's int16 dequantisation (skin 0 and skin 1 differ). Result in the game: a huge brown mass of strands that follows the hips
// and arms. Nothing drives hair in V3 (no fk_hair weights anywhere); the fix is the geometry.
// This script puts the old hair back, once, as the hair draw of piece_head only (it rides the head, comes off with a decapitation): the old mesh
// is carried to bind-pose world space through its own skin (sum of weight * jointWorld * ibm), which IS the cut file's mesh space (its skin is
// identity at rest: asserted), joints are remapped by name, and the other six pieces lose their hair draw.
//   node scripts/hero-body/repair-psyche-cut-hair.mjs <old psyche-106.glb> <derived cut glb> <out glb>
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { readAccessor, unpackMeshopt } from '../cut-glb-pack.mjs';

const [oldFile, cutFile, outFile] = process.argv.slice(2);
assert.ok(oldFile && cutFile && outFile, 'usage: repair-psyche-cut-hair.mjs <old.glb> <cut.glb> <out.glb>');
const load = async (file) => { const b = readFileSync(file), n = b.readUInt32LE(12); return unpackMeshopt(JSON.parse(b.subarray(20, 20 + n)), b.subarray(28 + n)); };
const HAIR_MATERIAL = 'Ch22_hair', HAIR_HOME = 'piece_head', OLD_HAIR_NODE = 'Ch22_Eyelashes';

const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const compose = (n) => {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], t = n.translation ?? [0, 0, 0], s = n.scale ?? [1, 1, 1];
  const m = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0, 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0, 2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0, t[0], t[1], t[2], 1];
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) m[c * 4 + r] *= s[c];
  return m;
};
/** Per joint of skin `si`: world(rest) * inverseBindMatrix, a 4x4 column-major array. */
function skinMatrices(g, si) {
  const { d, bin } = g, skin = d.skins[si], a = d.accessors[skin.inverseBindMatrices], v = d.bufferViews[a.bufferView], at = (v.byteOffset || 0) + (a.byteOffset || 0);
  const ibm = new Float32Array(bin.buffer.slice(bin.byteOffset + at, bin.byteOffset + at + a.count * 64));
  const parent = new Map(); d.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const world = (i) => { let m = compose(d.nodes[i]); for (let p = parent.get(i); p !== undefined; p = parent.get(p)) m = mul(compose(d.nodes[p]), m); return m; };
  return skin.joints.map((j, k) => mul(world(j), Array.from(ibm.subarray(k * 16, k * 16 + 16))));
}
const apply = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
const applyDir = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];

const OLD = await load(oldFile), CUT = await load(cutFile), d = CUT.d;
// the cut file's skin is identity at rest: its mesh space is the bind-pose world
const cutSkin = skinMatrices(CUT, 0);
cutSkin.forEach((m, k) => { if (d.nodes[d.skins[0].joints[k]].name.startsWith('mixamorig:')) m.forEach((x, i) => assert.ok(Math.abs(x - (i % 5 === 0 ? 1 : 0)) < 1e-3, `cut skin joint ${k} is not identity at rest`)); });   // the Mixamo joints; the fk_* helper joints carry no skin weight
const oldNode = OLD.d.nodes.find((n) => n.name === OLD_HAIR_NODE), oldPrim = OLD.d.meshes[oldNode.mesh].primitives[0], oldSkin = OLD.d.skins[oldNode.skin];
const oldM = skinMatrices(OLD, oldNode.skin);
const cutJoint = new Map(d.skins[0].joints.map((j, k) => [d.nodes[j].name, k]));
const remap = oldSkin.joints.map((j) => { const k = cutJoint.get(OLD.d.nodes[j].name); assert.ok(k !== undefined, `joint ${OLD.d.nodes[j].name} missing from the cut file`); return k; });

const acc = (a, normalize = true) => readAccessor(OLD.d, OLD.bin, OLD.d.accessors[a], normalize);
const P = acc(oldPrim.attributes.POSITION), N = acc(oldPrim.attributes.NORMAL), UV = acc(oldPrim.attributes.TEXCOORD_0), J = acc(oldPrim.attributes.JOINTS_0, false), W = acc(oldPrim.attributes.WEIGHTS_0), IDX = acc(oldPrim.indices, false);
assert.deepEqual(Object.keys(oldPrim.attributes).sort(), ['JOINTS_0', 'NORMAL', 'POSITION', 'TEXCOORD_0', 'WEIGHTS_0'], 'old hair draw attributes');
const count = P.length / 3, pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), joints = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
for (let i = 0; i < count; i++) {
  const p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], n = [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]], sp = [0, 0, 0], sn = [0, 0, 0];
  let sum = 0;
  for (let c = 0; c < 4; c++) {
    const w = W[i * 4 + c]; if (!w) continue; sum += w;
    const m = oldM[J[i * 4 + c]], q = apply(m, p), r = applyDir(m, n);
    for (let k = 0; k < 3; k++) { sp[k] += w * q[k]; sn[k] += w * r[k]; }
  }
  const l = Math.hypot(...sn) || 1;
  for (let k = 0; k < 3; k++) { pos[i * 3 + k] = sp[k] / (sum || 1); nor[i * 3 + k] = sn[k] / l; }
  for (let c = 0; c < 4; c++) { joints[i * 4 + c] = W[i * 4 + c] ? remap[J[i * 4 + c]] : 0; weights[i * 4 + c] = W[i * 4 + c] / (sum || 1); }
}
assert.ok(count < 65536, 'the packed cut path takes uint16 triangle indices');
const idx = Uint16Array.from(IDX);
// the new hair draw: piece_head's own hair primitive takes the old mesh; every other piece drops its hair primitive
const hairOf = (m) => m.primitives.findIndex((p) => d.materials[p.material].name === HAIR_MATERIAL);
const extra = [];   // appended bufferViews: { bytes, target }
const addAccessor = (array, type, componentType, target, extraFields = {}) => {
  extra.push({ bytes: Buffer.from(array.buffer, array.byteOffset, array.byteLength), target });
  d.accessors.push({ bufferView: -1 - (extra.length - 1), componentType, count: array.length / ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 })[type], type, ...extraFields });
  return d.accessors.length - 1;
};
const bounds = (a) => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a[i + k]); hi[k] = Math.max(hi[k], a[i + k]); } return { min: lo, max: hi }; };
const uv = new Float32Array(UV);
for (const m of d.meshes) {
  const h = hairOf(m); if (h < 0) continue;
  if (m.name !== HAIR_HOME) { m.primitives.splice(h, 1); continue; }
  const p = m.primitives[h];
  p.attributes = { POSITION: addAccessor(pos, 'VEC3', 5126, 34962, bounds(pos)), NORMAL: addAccessor(nor, 'VEC3', 5126, 34962), TEXCOORD_0: addAccessor(uv, 'VEC2', 5126, 34962), JOINTS_0: addAccessor(joints, 'VEC4', 5123, 34962), WEIGHTS_0: addAccessor(weights, 'VEC4', 5126, 34962) };
  p.indices = addAccessor(idx, 'SCALAR', 5123, 34963);
}
assert.ok(d.meshes.find((m) => m.name === HAIR_HOME)?.primitives.some((p) => d.materials[p.material].name === HAIR_MATERIAL), 'the head piece has the hair draw');

// compact: keep only what the file still references, in a fresh single buffer
const usedAcc = new Set();
for (const m of d.meshes) for (const p of m.primitives) { Object.values(p.attributes).forEach((a) => usedAcc.add(a)); usedAcc.add(p.indices); }
for (const a of d.animations) for (const s of a.samplers) { usedAcc.add(s.input); usedAcc.add(s.output); }
for (const s of d.skins) usedAcc.add(s.inverseBindMatrices);
const accMap = new Map(), accessors = []; [...usedAcc].sort((a, b) => a - b).forEach((a) => { accMap.set(a, accessors.length); accessors.push(d.accessors[a]); });
const chunks = [], viewMap = new Map(), views = []; let offset = 0;
const putView = (key, bytes, src) => {
  if (viewMap.has(key)) return viewMap.get(key);
  const pad = (4 - offset % 4) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  views.push({ ...src, buffer: 0, byteOffset: offset, byteLength: bytes.length }); chunks.push(bytes); offset += bytes.length;
  viewMap.set(key, views.length - 1); return views.length - 1;
};
for (const a of accessors) {
  if (a.bufferView < 0) { const e = extra[-1 - a.bufferView]; a.bufferView = putView(`x${a.bufferView}`, e.bytes, { target: e.target }); continue; }
  const v = d.bufferViews[a.bufferView];
  a.bufferView = putView(`v${a.bufferView}`, CUT.bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength), { ...(v.byteStride ? { byteStride: v.byteStride } : {}), ...(v.target ? { target: v.target } : {}) });
}
for (const img of d.images ?? []) { const v = d.bufferViews[img.bufferView]; img.bufferView = putView(`v${img.bufferView}`, CUT.bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength), {}); }
for (const m of d.meshes) for (const p of m.primitives) { for (const k of Object.keys(p.attributes)) p.attributes[k] = accMap.get(p.attributes[k]); p.indices = accMap.get(p.indices); }
for (const a of d.animations) for (const s of a.samplers) { s.input = accMap.get(s.input); s.output = accMap.get(s.output); }
for (const s of d.skins) s.inverseBindMatrices = accMap.get(s.inverseBindMatrices);
d.accessors = accessors; d.bufferViews = views;
const bin = Buffer.concat(chunks), pad4 = (b, fill) => Buffer.concat([b, Buffer.alloc((4 - b.length % 4) % 4, fill)]);
d.buffers = [{ byteLength: bin.length }];
const json = pad4(Buffer.from(JSON.stringify(d)), 0x20), body = pad4(bin, 0), head = Buffer.alloc(12), c1 = Buffer.alloc(8), c2 = Buffer.alloc(8);
head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + json.length + 8 + body.length, 8);
c1.writeUInt32LE(json.length, 0); c1.writeUInt32LE(0x4e4f534a, 4); c2.writeUInt32LE(body.length, 0); c2.writeUInt32LE(0x004e4942, 4);
writeFileSync(outFile, Buffer.concat([head, c1, json, c2, body]));
const hb = bounds(pos);
console.log(`hair: ${count} verts into ${HAIR_HOME}, bounds min ${hb.min.map((x) => x.toFixed(3))} max ${hb.max.map((x) => x.toFixed(3))}; wrote ${outFile} ${Buffer.concat([head, c1, json, c2, body]).length} bytes`);
