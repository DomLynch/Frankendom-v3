// The Minotaur's kit (2026-10-26): his body is the Centurion's in everything but the drawn mesh, so he keeps the Centurion's gladius and scutum,
// but the Centurion's armour (helmet, crest, body, arms, greaves, boots, gloves) is cut for the Centurion's body and would float on or sink into
// the Minotaur's. This keeps only the pieces of the given slots from a carriers file (src/assets/loot/carriers-veteran.glb) and drops every
// other draw, with the meshes, skins, accessors, materials and images only they used. The node tree (the 65 joints and the `pieces` map on
// the scene root, which names `veteran.Shield` -> `~kit.Shield`) is kept as it is, so loadLoot / lootPiecesOf read the cut exactly as the whole.
//   node scripts/foe-body/cut-kit.mjs <carriers.glb> <out.glb> <slot>[,<slot>...]
import fs from 'node:fs';
import assert from 'node:assert/strict';

const [src, outFile, slotList] = process.argv.slice(2);
assert.ok(src && outFile && slotList, 'usage: cut-kit.mjs <carriers.glb> <out.glb> <slot>[,<slot>...]');
const slots = new Set(slotList.split(','));
const b = fs.readFileSync(src), n = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + n)), bin = b.subarray(28 + n);
assert.equal(j.buffers.length, 1, 'one embedded buffer');

const kept = [];
j.nodes.forEach((node, i) => {
  if (node.mesh === undefined) return;
  if (slots.has(node.extras?.slot)) kept.push(i); else { delete node.mesh; delete node.skin; }
});
assert.ok(kept.length, `no piece in slots ${slotList}`);

// compact: every array rebuilt from what the kept nodes reach
const out = { ...j, meshes: [], skins: [], accessors: [], bufferViews: [], materials: [], textures: [], images: [], samplers: [] };
const parts = []; let at = 0;
const memo = (fn) => { const m = new Map(); return (i) => { if (!m.has(i)) m.set(i, fn(i)); return m.get(i); }; };
const view = memo((i) => {
  const v = j.bufferViews[i], bytes = bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength), pad = Buffer.alloc((4 - (bytes.length % 4)) % 4);
  out.bufferViews.push({ ...v, buffer: 0, byteOffset: at }); parts.push(bytes, pad); at += bytes.length + pad.length; return out.bufferViews.length - 1;
});
const accessor = memo((i) => { const a = { ...j.accessors[i] }; assert.ok(!a.sparse, 'sparse accessors are not handled'); if (a.bufferView !== undefined) a.bufferView = view(a.bufferView); out.accessors.push(a); return out.accessors.length - 1; });
const sampler = memo((i) => { out.samplers.push(j.samplers[i]); return out.samplers.length - 1; });
const image = memo((i) => { const im = { ...j.images[i] }; if (im.bufferView !== undefined) im.bufferView = view(im.bufferView); out.images.push(im); return out.images.length - 1; });
const texture = memo((i) => { const t = { ...j.textures[i] }; if (t.source !== undefined) t.source = image(t.source); if (t.sampler !== undefined) t.sampler = sampler(t.sampler); out.textures.push(t); return out.textures.length - 1; });
const retex = (o) => { if (!o || typeof o !== 'object') return o; for (const [k, v] of Object.entries(o)) { if (k.endsWith('Texture') && v?.index !== undefined) o[k] = { ...v, index: texture(v.index) }; else retex(v); } return o; };
const material = memo((i) => { out.materials.push(retex(JSON.parse(JSON.stringify(j.materials[i])))); return out.materials.length - 1; });
const mesh = memo((i) => {
  const m = JSON.parse(JSON.stringify(j.meshes[i]));
  for (const p of m.primitives) {
    for (const k of Object.keys(p.attributes)) p.attributes[k] = accessor(p.attributes[k]);
    if (p.indices !== undefined) p.indices = accessor(p.indices);
    if (p.material !== undefined) p.material = material(p.material);
    assert.ok(!p.targets, 'morph targets are not handled');
  }
  out.meshes.push(m); return out.meshes.length - 1;
});
const skin = memo((i) => { const s = { ...j.skins[i] }; if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = accessor(s.inverseBindMatrices); out.skins.push(s); return out.skins.length - 1; });
for (const i of kept) { const node = out.nodes[i]; node.mesh = mesh(node.mesh); if (node.skin !== undefined) node.skin = skin(node.skin); }
for (const k of ['textures', 'images', 'samplers']) if (!out[k].length) delete out[k];
out.buffers = [{ byteLength: at }];

const binOut = Buffer.concat(parts), js = Buffer.from(JSON.stringify(out)), jp = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jp.length + 8 + binOut.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jp.length, 0); jh.write('JSON', 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(binOut.length, 0); bh.write('BIN\0', 4);
fs.writeFileSync(outFile, Buffer.concat([head, jh, jp, bh, binOut]));
console.log(`${outFile}: ${kept.map((i) => j.nodes[i].name).join(', ')}; ${fs.statSync(outFile).size} bytes (from ${b.length})`);
