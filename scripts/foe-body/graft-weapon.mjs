// The Minotaur's cleaver (Dom 2026-10-26, his pick: V1's Cleaver; Lead: a VISUAL weapon only). The sim keeps him on the gladius, so his rig
// is still armed from the gladius's equip file (characters.ts equipWeapon: its WeaponDrawn goes under hand_r, its clips play over the rig's).
// This writes that file again with only the drawn weapon changed: the gladius equip's armature, its WeaponDrawn socket (same hand, same place)
// and its clips (Death_QuietOne) byte for byte, with V1's Cleaver part in the socket in place of the gladius's ten draws. V1 hung the part
// the same way (V1 src/assets/weapons/player/cleaver.glb: the part's own geometry, grip at the origin, under this socket); its own Heavy clip
// is NOT taken, so every move plays as the gladius's. WeaponDrawn's extras are the part's (contact 0.14-0.86 m: the trail runs along the
// cleaver's edge).
//   node scripts/foe-body/graft-weapon.mjs <equip.glb> <part.glb> <out.glb>
//   node scripts/foe-body/graft-weapon.mjs src/assets/weapons/player/gladius.glb cleaver.part.glb src/assets/weapons/foe/cleaver.glb
// The part is V1's src/assets/source/weapons/cleaver.part.glb (235 240 bytes, sha256 4d8e5f35...; on the VPS under
// /srv/dev-jobs/auditor-3648-rows/src/, and OpenTrident's "Frankendom: Cleaver", models/assets/weapon-535.glb, is the same mesh).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const [equipFile, partFile, outFile] = process.argv.slice(2);
assert.ok(equipFile && partFile && outFile, 'usage: graft-weapon.mjs <equip.glb> <part.glb> <out.glb>');
const read = (f) => { const b = fs.readFileSync(f), n = b.readUInt32LE(12); return { j: JSON.parse(b.subarray(20, 20 + n)), bin: b.subarray(28 + n) }; };
const equip = read(equipFile), part = read(partFile);
for (const g of [equip, part]) assert.equal(g.j.buffers.length, 1, 'one embedded buffer');

const socket = equip.j.nodes.findIndex((n) => n.name === 'WeaponDrawn');
assert.ok(socket >= 0, 'the equip file has a WeaponDrawn');
const partNode = part.j.nodes.find((n) => n.mesh !== undefined);
assert.ok(partNode && part.j.nodes.filter((n) => n.mesh !== undefined).length === 1, 'the part is one mesh node');
assert.ok(!partNode.translation && !partNode.rotation && !partNode.scale && !partNode.matrix, "the part's node has no transform: its geometry is in the hand frame");

// The socket's own draws go (every node under WeaponDrawn); the node list is re-indexed without them.
const dropped = new Set(), drop = (i) => { dropped.add(i); (equip.j.nodes[i].children ?? []).forEach(drop); };
(equip.j.nodes[socket].children ?? []).forEach(drop);
const remap = new Map(); let next = 0;
equip.j.nodes.forEach((_, i) => { if (!dropped.has(i)) remap.set(i, next++); });
assert.ok(!(equip.j.animations ?? []).some((a) => a.channels.some((c) => dropped.has(c.target.node))), 'no clip keys a dropped draw');
assert.ok(!(equip.j.nodes.some((n, i) => !dropped.has(i) && n.mesh !== undefined)), 'the socket holds every draw of the equip file');

const out = { asset: { ...equip.j.asset, extras: { ...equip.j.asset.extras, weapon: 'cleaver', variant: partNode.extras?.variant, drawnFor: equip.j.asset.extras?.weapon, by: 'scripts/foe-body/graft-weapon.mjs' } },
  scene: equip.j.scene, scenes: equip.j.scenes.map((s) => ({ ...s, nodes: s.nodes.map((i) => remap.get(i)) })),
  nodes: [], meshes: [], accessors: [], bufferViews: [], materials: [], textures: [], images: [], samplers: [], animations: [] };
const parts = []; let at = 0;
const memo = (fn) => { const m = new Map(); return (i) => { if (!m.has(i)) m.set(i, fn(i)); return m.get(i); }; };
// One copier per source file: each array entry is copied once, on first use, into the one output buffer.
function copier({ j, bin }) {
  const view = memo((i) => {
    const v = j.bufferViews[i], bytes = bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength), pad = Buffer.alloc((4 - (bytes.length % 4)) % 4);
    out.bufferViews.push({ ...v, buffer: 0, byteOffset: at }); parts.push(bytes, pad); at += bytes.length + pad.length; return out.bufferViews.length - 1;
  });
  const accessor = memo((i) => { const a = { ...j.accessors[i] }; assert.ok(!a.sparse, 'sparse accessors are not handled'); if (a.bufferView !== undefined) a.bufferView = view(a.bufferView); out.accessors.push(a); return out.accessors.length - 1; });
  const sampler = memo((i) => { out.samplers.push(j.samplers[i]); return out.samplers.length - 1; });
  const image = memo((i) => { const im = { ...j.images[i] }; assert.ok(im.bufferView !== undefined, 'embedded images only'); im.bufferView = view(im.bufferView); out.images.push(im); return out.images.length - 1; });
  const texture = memo((i) => { const t = { ...j.textures[i] }; if (t.source !== undefined) t.source = image(t.source); if (t.sampler !== undefined) t.sampler = sampler(t.sampler); out.textures.push(t); return out.textures.length - 1; });
  const retex = (o) => { if (!o || typeof o !== 'object') return o; for (const [k, v] of Object.entries(o)) { if (k.endsWith('Texture') && v?.index !== undefined) o[k] = { ...v, index: texture(v.index) }; else retex(v); } return o; };
  const material = memo((i) => { out.materials.push(retex(JSON.parse(JSON.stringify(j.materials[i])))); return out.materials.length - 1; });
  const primitive = (p) => {
    assert.ok(!p.targets, 'morph targets are not handled');
    const q = { ...p, attributes: Object.fromEntries(Object.entries(p.attributes).map(([k, a]) => [k, accessor(a)])) };
    if (p.indices !== undefined) q.indices = accessor(p.indices);
    if (p.material !== undefined) q.material = material(p.material);
    return q;
  };
  return { accessor, primitive };
}
const fromEquip = copier(equip), fromPart = copier(part);

// The nodes: the equip's, less the socket's draws; the socket then holds one child per primitive of the part (one draw each, as V1's equip
// file and the trident on veteran.glb hang theirs), with the part's extras.
equip.j.nodes.forEach((n, i) => {
  if (dropped.has(i)) return;
  const node = { ...n };
  if (n.children) node.children = n.children.filter((c) => !dropped.has(c)).map((c) => remap.get(c));
  if (!node.children?.length) delete node.children;
  out.nodes.push(node);
});
const drawn = out.nodes[remap.get(socket)];
drawn.extras = { ...partNode.extras };
drawn.children = part.j.meshes[partNode.mesh].primitives.map((p) => {
  out.meshes.push({ primitives: [fromPart.primitive(p)] });
  out.nodes.push({ mesh: out.meshes.length - 1 });
  return out.nodes.length - 1;
});
// The clips byte for byte: the same accessors, retargeted to the re-indexed nodes.
out.animations = (equip.j.animations ?? []).map((a) => ({ ...a, samplers: a.samplers.map((s) => ({ ...s, input: fromEquip.accessor(s.input), output: fromEquip.accessor(s.output) })),
  channels: a.channels.map((c) => ({ ...c, target: { ...c.target, node: remap.get(c.target.node) } })) }));
for (const k of ['textures', 'images', 'samplers', 'animations']) if (!out[k].length) delete out[k];
const used = [...new Set([...(equip.j.extensionsUsed ?? []), ...(part.j.extensionsUsed ?? [])])];
if (used.length) out.extensionsUsed = used;
out.buffers = [{ byteLength: at }];

const binOut = Buffer.concat(parts), js = Buffer.from(JSON.stringify(out)), jp = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jp.length + 8 + binOut.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jp.length, 0); jh.write('JSON', 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(binOut.length, 0); bh.write('BIN\0', 4);
fs.writeFileSync(outFile, Buffer.concat([head, jh, jp, bh, binOut]));
console.log(`${outFile}: ${part.j.meshes[partNode.mesh].primitives.length} draws of ${partFile} in ${equipFile}'s WeaponDrawn; ${fs.statSync(outFile).size} bytes`);
