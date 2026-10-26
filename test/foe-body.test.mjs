// The Minotaur as the opponent (Dom 2026-10-26): src/assets/minotaur.glb is Mixamo's Minotaur on the Centurion's veteran.glb rig
// (scripts/foe-body/build-minotaur.sh). What the game asks of his body is veteran.glb's: the 65 joints, all 39 clips byte for byte, the weapon
// sockets where veteran.glb has them, a Body draw for his kit, the pelvis where the clips key it. His kit is the scutum alone. ?foe=v1 = veteran.glb.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chooseFoeBody, foeBodyFile, foeBodySwapped, foeKitFile } from '../src/fight/foe-body.ts';

const glb = (path) => { const bytes = readFileSync(new URL(path, import.meta.url)), n = bytes.readUInt32LE(12); return { j: JSON.parse(bytes.subarray(20, 20 + n)), bin: bytes.subarray(28 + n) }; };
const minotaur = glb('../src/assets/minotaur.glb'), veteran = glb('../src/assets/veteran.glb');
const clipData = ({ j, bin }, an) => an.channels.map((c) => {
  const s = an.samplers[c.sampler], bytes = (ai) => { const a = j.accessors[ai], v = j.bufferViews[a.bufferView], o = (v.byteOffset ?? 0) + (a.byteOffset ?? 0); return bin.subarray(o, o + v.byteLength).toString('base64'); };
  return `${j.nodes[c.target.node].name}.${c.target.path}:${bytes(s.input)}:${bytes(s.output)}`;
});
const parentName = (j, i) => { const p = j.nodes.findIndex((n) => (n.children ?? []).includes(i)); return p < 0 ? null : j.nodes[p].name; };
const node = (j, name) => j.nodes.findIndex((n) => n.name === name);

test("minotaur.glb has veteran.glb's 65 joints and all its clips byte for byte", () => {
  const names = (g) => g.j.skins[0].joints.map((i) => g.j.nodes[i].name);
  assert.deepEqual(names(minotaur), names(veteran));
  assert.deepEqual(minotaur.j.animations.map((a) => a.name), veteran.j.animations.map((a) => a.name));
  for (const an of veteran.j.animations) assert.deepEqual(clipData(minotaur, minotaur.j.animations.find((a) => a.name === an.name)), clipData(veteran, an), `${an.name} unchanged`);
});

test('the weapon sockets are where veteran.glb has them; the body is one Steel draw with slot Body and its maps', () => {
  for (const name of ['SwordDrawn', 'WeaponDrawn', 'SwordSheathed']) {
    const a = minotaur.j.nodes[node(minotaur.j, name)], b = veteran.j.nodes[node(veteran.j, name)];
    assert.ok(a, `${name} kept`);
    assert.deepEqual([a.translation, a.rotation, a.scale, (a.children ?? []).length], [b.translation, b.rotation, b.scale, (b.children ?? []).length], `${name}: same place`);
    assert.equal(parentName(minotaur.j, node(minotaur.j, name)), parentName(veteran.j, node(veteran.j, name)), `${name}: same joint`);
  }
  const reach = new Set(), walk = (i) => { reach.add(i); (minotaur.j.nodes[i].children ?? []).forEach(walk); };
  minotaur.j.scenes[0].nodes.forEach(walk);
  const steel = [...reach].map((i) => minotaur.j.nodes[i]).filter((n) => n.name === 'Steel');
  assert.equal(steel.length, 1, 'one node named Steel in the scene (characters.ts missingMap reads the first)');
  assert.ok(steel[0].skin === 0 && steel[0].extras?.slot === 'Body', 'a skinned Steel draw tagged Body (wear() hangs the scutum on it)');
  assert.equal(minotaur.j.meshes[steel[0].mesh].primitives.length, 1, 'one primitive: three.js makes it a SkinnedMesh, not a Group');
  const mat = minotaur.j.materials[minotaur.j.meshes[steel[0].mesh].primitives[0].material];
  assert.ok(mat.pbrMetallicRoughness.baseColorTexture && mat.normalTexture, 'Steel has a base map and a normal map');
  assert.equal(mat.pbrMetallicRoughness.metallicFactor, 0, 'matte, not metal');
  assert.ok(!minotaur.j.nodes.some((n) => n.name === 'CreatureBody'), "the Centurion's own body is gone");
});

test("the Minotaur's kit is the Centurion's scutum alone, read as veteran.Shield", () => {
  const kit = glb('../src/assets/loot/carriers-minotaur.glb');
  const pieces = kit.j.nodes.filter((n) => n.mesh !== undefined);
  assert.deepEqual([...new Set(pieces.map((n) => n.extras.slot))], ['Shield']);
  assert.equal(kit.j.nodes[0].extras.pieces['veteran.Shield'], '~kit.Shield');
});

test('?foe=v1 draws the Centurion and his whole kit; anything else the Minotaur', () => {
  assert.equal(chooseFoeBody(''), false);
  assert.deepEqual([foeBodyFile('veteran', 'veteran'), foeKitFile('veteran'), foeBodySwapped('veteran')], ['minotaur', null, true], 'no shield on the Minotaur');
  assert.equal(foeBodyFile('goblin', 'goblin'), 'goblin', 'other opponents keep their own');
  chooseFoeBody('?shield=v1');
  assert.deepEqual([foeBodyFile('veteran', 'veteran'), foeKitFile('veteran')], ['minotaur', 'carriers-minotaur'], '?shield=v1 = his scutum back');
  assert.equal(chooseFoeBody('?foe=v1&hero=v1'), true);
  assert.deepEqual([foeBodyFile('veteran', 'veteran'), foeKitFile('veteran'), foeBodySwapped('veteran')], ['veteran', 'carriers-veteran', false]);
  chooseFoeBody('');
});
