// The rig swap's one bone map (src/fight/rig-bones.ts, Dom + Strategy 2026-10-26): every bone or weapon-node lookup goes through `bone(root, name)`.
// A 65 body is looked up exactly as before (root.getObjectByName(name)); a 106 body through data/rig.json. Both toggles default to 65 (today).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bone, boneAs65, boneName, chooseRigs, drawnSword, foeRigFile, gapFillFor, heldWeapon, heroRigFile, isHeldWeaponName, rigFile, rigOf, sanitizeNodeName, trackAs65, trackOn } from '../src/fight/rig-bones.ts';

const RIG = JSON.parse(readFileSync(new URL('../data/rig.json', import.meta.url), 'utf8'));
const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));
const glb = (path) => { const bytes = readFileSync(new URL(path, import.meta.url)), n = bytes.readUInt32LE(12); return JSON.parse(bytes.subarray(20, 20 + n)); };
const joints = (j) => j.skins[0].joints.map((i) => j.nodes[i].name);
// A stand-in for a loaded scene: getObjectByName over a set of names (three.js-sanitized, as GLTFLoader leaves them), counting calls.
const scene = (names) => { const calls = []; return { calls, getObjectByName: (n) => { calls.push(n); return names.includes(n) ? { name: n } : undefined; } }; };
const MIXAMO = Object.values(RIG.bones).map(sanitizeNodeName);

test('both sides default to the 65 rig: no query = today', () => {
  assert.deepEqual(RIG.default, { hero: '65', foe: '65' });
  assert.deepEqual(chooseRigs(''), { hero: '65', foe: '65' });
  assert.equal(heroRigFile('psyche'), 'psyche'); assert.equal(foeRigFile('minotaur'), 'minotaur');
});

test('?rig= picks the hero, ?foerig= the opponent; only a body with a 106 file changes', () => {
  assert.deepEqual(chooseRigs('?rig=106'), { hero: '106', foe: '65' });
  assert.equal(heroRigFile('psyche'), 'psyche-106'); assert.equal(foeRigFile('minotaur'), 'minotaur');
  assert.deepEqual(chooseRigs('?foerig=106&rig=65'), { hero: '65', foe: '106' });
  assert.equal(heroRigFile('psyche'), 'psyche'); assert.equal(foeRigFile('minotaur'), 'minotaur-106');
  assert.equal(rigFile('warrior', '106'), 'warrior', '?hero=v1 (warrior.glb) has no 106 file: stays 65');
  assert.equal(rigFile('veteran', '106'), 'veteran', '?foe=v1 (veteran.glb) has no 106 file: stays 65');
  assert.deepEqual(chooseRigs('?rig=nonsense&foerig=1'), { hero: '65', foe: '65' });
  chooseRigs('');
});

test("the map covers psyche.glb's and minotaur.glb's 65 joints, one to one, onto mixamorig names", () => {
  for (const file of ['../src/assets/psyche.glb', '../src/assets/minotaur.glb']) assert.deepEqual(Object.keys(RIG.bones).sort(), joints(glb(file)).sort(), file);
  assert.equal(new Set(MIXAMO).size, MIXAMO.length, 'no two 65 joints share a 106 joint');
  for (const [from, to] of Object.entries(RIG.bones)) assert.ok(from === 'root' ? to === 'root' : /^mixamorig:[A-Z]\w+$/.test(to), `${from} -> ${to}`);
  assert.equal(sanitizeNodeName('mixamorig:Hips'), 'mixamorigHips', 'three.js drops the colon as it loads');
});

test('a 65 body: bone(root, name) is root.getObjectByName(name), the same call and the same answer', () => {
  const names = ['pelvis', 'hand_r', 'Head', 'SwordDrawn', 'SwordSheathed'], root = scene(names);
  assert.equal(rigOf(root), '65');
  for (const n of [...names, 'WeaponDrawn', 'fk_socket_hand_r', 'mixamorigHips']) {
    root.calls.length = 0;
    assert.deepEqual(bone(root, n), names.includes(n) ? { name: n } : undefined, n);
    assert.deepEqual(root.calls, [n], `${n}: one lookup of the name itself`);
  }
  assert.equal(boneName('65', 'hand_r'), 'hand_r'); assert.equal(trackOn('65', 'pelvis.position'), 'pelvis.position'); assert.equal(trackAs65('65', 'pelvis.position'), 'pelvis.position');
  assert.ok(!isHeldWeaponName('65', 'fk_socket_hand_r'));
});

test('a 106 body: bones by their mixamorig names, the sword at fk_socket_hand_r (then the body\'s own node)', () => {
  const own = scene([...MIXAMO, 'SwordDrawn', 'SwordSheathed', 'fk_socket_hand_r', 'fk_socket_hip_r']);
  assert.equal(rigOf(own), '106');
  assert.equal(bone(own, 'pelvis').name, 'mixamorigHips'); assert.equal(bone(own, 'hand_r').name, 'mixamorigRightHand'); assert.equal(bone(own, 'Head').name, 'mixamorigHead');
  assert.equal(bone(own, 'ball_leaf_l').name, 'mixamorigLeftToe_End'); assert.equal(bone(own, 'root').name, 'root');
  assert.equal(bone(own, 'SwordDrawn').name, 'fk_socket_hand_r', "the socket first: it carries the 65 rig's sword frame");
  assert.equal(bone(own, 'SwordSheathed').name, 'SwordSheathed', "the body's own sheath node first");
  assert.equal(bone(own, 'WeaponDrawn'), undefined, 'WeaponDrawn is only ever the node itself (a grafted part)');
  assert.equal(heldWeapon(own).name, 'fk_socket_hand_r'); assert.equal(drawnSword(own).name, 'fk_socket_hand_r');
  const bare = scene([...MIXAMO, 'SwordDrawn']);
  assert.equal(bone(bare, 'SwordDrawn').name, 'SwordDrawn', 'no socket: its own sword node');
  assert.equal(bone(bare, 'SwordSheathed'), undefined);
  const grafted = scene([...MIXAMO, 'WeaponDrawn', 'fk_socket_hand_r']);
  assert.equal(heldWeapon(grafted).name, 'WeaponDrawn'); assert.equal(drawnSword(grafted).name, 'WeaponDrawn');
  assert.ok(isHeldWeaponName('106', 'fk_socket_hand_r'));
  assert.equal(boneAs65('106', 'mixamorigLeftForeArm'), 'lowerarm_l'); assert.equal(boneAs65('106', 'upperarm_twist_01_l'), 'upperarm_twist_01_l');
});

test("a 106 track reads as its 65 bone, so data/fight.json's guard-walk legs row splits a 106 clip the same way", () => {
  const legs = new RegExp(FIGHT.guardWalk.lowerBones), split = (rig, bones) => bones.map((b) => legs.test(trackAs65(rig, `${rig === '106' ? sanitizeNodeName(RIG.bones[b]) : b}.quaternion`)));
  const names = Object.keys(RIG.bones);
  assert.deepEqual(split('106', names), split('65', names));
  assert.equal(trackOn('106', 'pelvis.position'), 'mixamorigHips.position'); assert.equal(trackOn('106', 'Steel.morph'), 'Steel.morph');
});

test("OpenTrident's minotaur-106.glb: its bones.json is the map, every mapped joint is in it, the socket on the right hand, the 65 file's clips but the trident's", () => {
  const ot = JSON.parse(readFileSync(new URL('../src/assets/minotaur-106.bones.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.entries(ot.map).sort(), Object.entries(RIG.bones).sort(), 'data/rig.json bones = minotaur-106.bones.json map');
  const m = glb('../src/assets/minotaur-106.glb'), named = new Set(m.nodes.map((n) => n.name)), have = new Set(joints(m));
  for (const to of Object.values(RIG.bones)) assert.ok(have.has(to), `${to} is a joint`);
  assert.ok(have.has(RIG.detect['106']) && !named.has(RIG.detect['65']), 'detected as 106');
  const socket = m.nodes.findIndex((n) => n.name === 'fk_socket_hand_r'), parent = m.nodes.find((n) => (n.children ?? []).includes(socket));
  assert.equal(parent?.name, 'mixamorig:RightHand');
  assert.deepEqual(m.animations.map((a) => a.name), glb('../src/assets/minotaur.glb').animations.map((a) => a.name).filter((n) => !n.startsWith('Trident_')));
});

test("every 106 file data/rig.json names is addressable by the loader (scene.ts's URL table); every held node has its weapons row", () => {
  const scene = readFileSync(new URL('../src/fight/scene.ts', import.meta.url), 'utf8');
  for (const stem of Object.values(RIG.files)) assert.ok(scene.includes(`new URL('../assets/${stem}.glb', import.meta.url)`), `${stem}.glb in scene.ts fighterUrls`);
  assert.deepEqual(Object.values(RIG.held).every((k) => RIG.weapons[k]?.length), true, 'each held node has a weapons row');
});

test('gap fill (106 bodies only) names a clip for every role', () => {
  for (const role of ['Armed', 'Draw', 'Kick', 'Parry', 'Anything']) assert.ok(gapFillFor(role).length, role);
  assert.deepEqual(gapFillFor('Anything'), ['Idle']);
});
