// The Minotaur as the opponent (Dom 2026-10-26): src/assets/minotaur.glb is Mixamo's Minotaur on the Centurion's veteran.glb rig
// (scripts/foe-body/build-minotaur.sh). What the game asks of his body is veteran.glb's: the 65 joints, all 39 clips byte for byte, the weapon
// sockets where veteran.glb has them, a Body draw for his kit, the pelvis where the clips key it. These 65 files stay in src/assets for the
// tests and bakes; the page draws minotaur-106.glb only (106 only, Dom 2026-10-26; ?foe=v1 and ?shield=v1 are gone; test/rig-bones.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chooseFoeBody, foeBakedWeapon, foeBodyFile as foeBody, foeBodySwapped, foeKitFile } from '../src/fight/foe-body.ts';
import { fightOpponent } from '../src/fight/foe-pick.ts';
import { OPPONENTS, opponentAt } from '../src/fight/moves.ts';

// The body rows below name the 65 stems (foeBodyFile's `stem`: minotaur, the name the rows key by); the 106 file drawn (minotaur-106) is test/rig-bones.test.mjs's.
const foeBodyFile = (id, body) => foeBody(id, body, true);

const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));

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

// 106 only (Dom 2026-10-26): one body per opponent, no query picks another. ?foe=v1 (veteran.glb + carriers-veteran.glb) and ?shield=v1
// (carriers-minotaur.glb, a 65-rigged kit) are gone; the 106 file drawn is foeBodyFile without `stem`.
test('the Centurion and the Pitborn both draw the 106 Minotaur with no kit, whatever the query', () => {
  for (const q of ['', '?foe=v1', '?shield=v1', '?foe=v1&hero=v1']) {
    assert.equal(chooseFoeBody(q), false, `${q}: reads no query`);
    for (const id of ['veteran', 'pitborn']) {
      assert.deepEqual([foeBodyFile(id, id), foeBody(id, id), foeKitFile(id), foeBodySwapped(id)], ['minotaur', 'minotaur-106', null, true], `${id} ${q}`);
    }
  }
  assert.equal(foeBodyFile('goblin', 'goblin'), 'goblin', 'other opponents keep their own');
});

// Dom 2026-10-26 (later): the opponent fights as V1's Pitborn in the Minotaur's body (data/fight.json opponent, src/fight/foe-pick.ts): no kit,
// no shield, his cleaver grafted at the 106 body's socket (minotaur-106.glb bakes no weapon). ?pitborn=v1 = the Centurion's fight, same body.
test('the Pitborn\'s cleaver is grafted (the 106 body bakes none); ?pitborn=v1 = the Centurion, ?foe=v1 = nothing', () => {
  assert.equal(fightOpponent(FIGHT, ''), 'executioner', 'the first opponent is the Gargantua (boss reorder); the Minotaur stands third');
  assert.equal(fightOpponent(FIGHT, '?order=v1'), 'pitborn');
  assert.equal(foeBakedWeapon('pitborn', 'cleaver'), '', 'minotaur-106.glb bakes no weapon, so the cleaver is grafted');
  assert.equal(foeBakedWeapon('veteran', 'gladius'), '');
  assert.notEqual(foeBakedWeapon('pitborn', 'cleaver'), opponentAt(OPPONENTS.pitborn, FIGHT.level).weapon);
  assert.equal(foeBakedWeapon('goblin', 'axe'), 'axe', 'a body with no row bakes its roster weapon');
  for (const q of ['?pitborn=v1', '?pitborn=v1&shield=v1', '?pitborn=v1&foe=v1']) assert.equal(fightOpponent(FIGHT, q), 'veteran', q);
  for (const q of ['?foe=v1', '?shield=v1']) assert.equal(fightOpponent(FIGHT, q), 'executioner', q);
});

test("the cleaver plays the sword clip family, and minotaur.glb carries every clip of it (no fallback)", () => {
  const names = new Set(minotaur.j.animations.map((a) => a.name));
  for (const clip of ['Idle', 'Walk', 'Jog', 'Run', 'Armed', 'Attack', 'Return', 'Heavy', 'Riposte', 'Guard', 'BlockImpact', 'Parry', 'Deflected', 'Hit', 'Death', 'Kick', 'Roll', 'ArmedWalk', 'StrafeLeft', 'StrafeRight', 'Death_SplitCrown', 'Death_RunThrough', 'Fin_RunThrough', 'Death_QuietOne'])
    assert.ok(names.has(clip), clip);
});
