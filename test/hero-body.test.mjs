// Psyche as the hero (Dom 2026-10-26): src/assets/psyche.glb is Mixamo's Psyche on V1's 65-joint hero skeleton (scripts/hero-body/build-psyche.sh).
// What the game asks of a hero body is the same as warrior.glb's: the joints, the clips (V1's byte for byte, plus every picked row), the sword
// nodes where warrior.glb has them, a `Steel` skin with its maps, the pelvis at the height the clips key. These 65 files stay in src/assets for
// the tests and bakes; the page draws psyche-106.glb only (106 only, Dom 2026-10-26; ?hero=v1 is gone; test/rig-bones.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { heroBodyFile, heroContact, heroSwing } from '../src/fight/hero-body-rows.ts';
import { heroRigFile } from '../src/fight/rig-bones.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ROWS = JSON.parse(readFileSync(new URL('../data/hero-clips.json', import.meta.url), 'utf8'));
const glb = (bytes) => { const n = bytes.readUInt32LE(12); return { j: JSON.parse(bytes.subarray(20, 20 + n)), bin: bytes.subarray(28 + n) }; };
const psyche = glb(readFileSync(new URL('../src/assets/psyche.glb', import.meta.url)));
const warrior = glb(readFileSync(new URL('../src/assets/warrior.glb', import.meta.url)));
const clipData = ({ j, bin }, an) => an.channels.map((c) => {
  const s = an.samplers[c.sampler], bytes = (ai) => { const a = j.accessors[ai], v = j.bufferViews[a.bufferView], o = (v.byteOffset ?? 0) + (a.byteOffset ?? 0); return bin.subarray(o, o + v.byteLength).toString('base64'); };
  return `${j.nodes[c.target.node].name}.${c.target.path}:${bytes(s.input)}:${bytes(s.output)}`;
});
const parentName = (j, i) => { const p = j.nodes.findIndex((n) => (n.children ?? []).includes(i)); return p < 0 ? null : j.nodes[p].name; };
const node = (j, name) => j.nodes.findIndex((n) => n.name === name);

test("psyche.glb has warrior.glb's 65 joints and every clip name", () => {
  const names = (g) => g.j.skins[0].joints.map((i) => g.j.nodes[i].name);
  assert.deepEqual(names(psyche), names(warrior));
  assert.deepEqual(psyche.j.animations.map((a) => a.name), warrior.j.animations.map((a) => a.name));
  for (const r of ROWS.clips) {
    const an = psyche.j.animations.find((a) => a.name === r.clip);
    assert.equal(an.channels.filter((c) => c.target.path === 'rotation').length, 65, `${r.clip}: a rotation track per joint`);
  }
});

test("V1's 27 clips are in psyche.glb byte for byte", () => {
  let v1;
  try { v1 = glb(execFileSync('git', ['show', 'v1-seed-82a994d15:src/assets/warrior.glb'], { cwd: ROOT, maxBuffer: 1 << 26 })); }
  catch { return assert.fail('the seed tag is not in this checkout: git fetch --no-tags --depth=1 origin refs/tags/v1-seed-82a994d15:refs/tags/v1-seed-82a994d15'); }
  for (const an of v1.j.animations) assert.deepEqual(clipData(psyche, psyche.j.animations.find((a) => a.name === an.name)), clipData(v1, an), `${an.name} unchanged`);
});

test('the sword nodes are where warrior.glb has them, and the body is Steel with its maps', () => {
  for (const name of ['SwordDrawn', 'SwordSheathed']) {
    const a = psyche.j.nodes[node(psyche.j, name)], b = warrior.j.nodes[node(warrior.j, name)];
    assert.ok(a, `${name} kept`);
    assert.deepEqual([a.translation, a.rotation, a.scale, (a.children ?? []).length], [b.translation, b.rotation, b.scale, (b.children ?? []).length], `${name}: same place and meshes`);
    assert.equal(parentName(psyche.j, node(psyche.j, name)), parentName(warrior.j, node(warrior.j, name)), `${name}: same joint`);
  }
  const steel = psyche.j.nodes.find((n) => n.name === 'Steel');
  assert.ok(steel && steel.skin === 0, 'a skinned Steel node (characters.ts missingMap)');
  const mat = psyche.j.materials[psyche.j.meshes[steel.mesh].primitives[0].material];
  assert.ok(mat.pbrMetallicRoughness.baseColorTexture && mat.normalTexture, 'Steel has a base map and a normal map');
});

test('the hero is Psyche on her 106 file, with V1\'s swing timing; the row names no other body', () => {
  assert.equal(heroBodyFile(), 'psyche'); assert.equal(heroRigFile(heroBodyFile()), 'psyche-106');
  assert.deepEqual(['Attack', 'Heavy'].map((r) => heroContact(r)), [0.4615, 0.4727]);
  assert.equal(heroSwing('Attack', 0, true), 0.1346);
  const row = JSON.parse(readFileSync(new URL('../src/fight/hero-body-rows.json', import.meta.url), 'utf8')).heroBodyRows[0].fields;
  assert.deepEqual(Object.values(row.files), ['psyche'], 'no Exo (warrior.glb) or classic row');
  assert.ok(!('v1' in row), 'no ?hero=v1 row');
});
