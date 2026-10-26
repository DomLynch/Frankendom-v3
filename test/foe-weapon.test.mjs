// The Minotaur wields V1's plain Cleaver (Dom 2026-10-26; Lead: VISUAL only, data/fight.json foeWeapon). The sim keeps the gladius; the scene
// draws src/assets/weapons/foe/cleaver.glb (the gladius's equip file with V1's Cleaver part in the socket, scripts/foe-body/graft-weapon.mjs)
// and V1's cleaver-plain rank shape. ?foeweapon=v1 = the gladius on him; ?foe=v1 = the Centurion exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { foeDrawnWeapon, foeWeaponFor, setFoeWeapon } from '../src/fight/foe-weapon.ts';
import { shapesFor } from '../src/fight/weapon-shapes.ts';
import { validateFile } from '../src/sim/validate.js';

const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));
const bytes = (path) => readFileSync(new URL(path, import.meta.url));
const glb = (path) => { const b = bytes(path), n = b.readUInt32LE(12); return { j: JSON.parse(b.subarray(20, 20 + n)), bin: b.subarray(28 + n) }; };
const sha = (path) => createHash('sha256').update(bytes(path)).digest('hex');

test('the row draws the cleaver over the gladius the fight is armed with; the sim weapon is untouched', () => {
  assert.deepEqual([FIGHT.foeWeapon.opponent, FIGHT.foeWeapon.weapon, FIGHT.foeWeapon.drawn], [FIGHT.opponent, 'gladius', 'cleaver']);
  assert.deepEqual(validateFile('fight', FIGHT), [], 'fight.json validates');
  setFoeWeapon(foeWeaponFor(FIGHT.foeWeapon, ''));
  assert.equal(foeDrawnWeapon('veteran', 'gladius'), 'cleaver');
  assert.equal(foeDrawnWeapon('veteran', 'trident'), 'trident', 'another weapon of his keeps its own look');
  assert.equal(foeDrawnWeapon('goblin', 'gladius'), 'gladius', 'other opponents keep theirs');
  assert.equal(shapesFor({ opponent: foeDrawnWeapon('veteran', 'gladius'), opponentId: 'veteran', playerLevel: 1, opponentLevel: 1 }).opponent, '/weapons/shapes/cleaver-plain.glb');
  setFoeWeapon(null);
});

test('?foeweapon=v1 and ?foe=v1 put the gladius back', () => {
  for (const q of ['?foeweapon=v1', '?foe=v1', '?hero=v1&foe=v1']) {
    setFoeWeapon(foeWeaponFor(FIGHT.foeWeapon, q));
    assert.equal(foeDrawnWeapon('veteran', 'gladius'), 'gladius', q);
    assert.equal(shapesFor({ opponent: foeDrawnWeapon('veteran', 'gladius'), opponentId: 'veteran', playerLevel: 1, opponentLevel: 1 }).opponent, '/weapons/shapes/gladius-plain.glb', q);
  }
  setFoeWeapon(foeWeaponFor(FIGHT.foeWeapon, '?trail=v1'));
  assert.equal(foeDrawnWeapon('veteran', 'gladius'), 'cleaver', 'another flag leaves it on');
  setFoeWeapon(null);
});

test("cleaver.glb is the gladius equip with V1's Cleaver in the same socket and the gladius's clips byte for byte", () => {
  const gladius = glb('../src/assets/weapons/player/gladius.glb'), cleaver = glb('../src/assets/weapons/foe/cleaver.glb');
  const socket = (g) => { const i = g.j.nodes.findIndex((n) => n.name === 'WeaponDrawn'); const parent = g.j.nodes.find((n) => (n.children ?? []).includes(i)); return { node: g.j.nodes[i], parent: parent?.name }; };
  const a = socket(gladius), b = socket(cleaver);
  assert.deepEqual([b.parent, b.node.translation, b.node.rotation, b.node.scale], [a.parent, a.node.translation, a.node.rotation, a.node.scale], 'same hand, same place');
  assert.deepEqual(b.node.extras, { contact: { from: 0.14, to: 0.86 }, weapon: 'cleaver', variant: 'trellis' });
  assert.equal(b.node.children.length, 2, "the part's blade and shaft");
  const names = (g) => g.j.nodes.map((n) => n.name).filter(Boolean);
  assert.deepEqual(names(cleaver), names(gladius), 'the same armature');
  const clip = ({ j, bin }, an) => an.channels.map((c) => {
    const s = an.samplers[c.sampler], data = (ai) => { const x = j.accessors[ai], v = j.bufferViews[x.bufferView], o = (v.byteOffset ?? 0) + (x.byteOffset ?? 0); return bin.subarray(o, o + v.byteLength).toString('base64'); };
    return `${j.nodes[c.target.node].name}.${c.target.path}:${data(s.input)}:${data(s.output)}`;
  });
  assert.deepEqual(cleaver.j.animations.map((x) => x.name), gladius.j.animations.map((x) => x.name), "the gladius's clips, not V1's cleaver Heavy");
  for (const an of gladius.j.animations) assert.deepEqual(clip(cleaver, cleaver.j.animations.find((x) => x.name === an.name)), clip(gladius, an), `${an.name} unchanged`);
  // The grip sits in the hand: the shaft spans the socket's origin, the blade's head starts above the fist.
  const box = (m) => cleaver.j.accessors[cleaver.j.meshes[m].primitives[0].attributes.POSITION];
  const shaft = cleaver.j.nodes[b.node.children[1]].mesh, blade = cleaver.j.nodes[b.node.children[0]].mesh;
  assert.ok(box(shaft).min[1] < 0 && box(shaft).max[1] > 0, 'the haft runs through the hand');
  assert.ok(box(blade).max[1] > 0.8 && box(blade).max[1] < 0.9, "V1's 0.86 m cleaver");
});

test("V1's files: the plain shape byte for byte (V1's pin), the gladius's untouched", () => {
  assert.equal(sha('../public/weapons/shapes/cleaver-plain.glb'), '83906bc8cd9a01fe8c8c6e90ba40bdb7a81bcf52a2badd37878e3fdc7319351a');
  assert.equal(sha('../public/weapons/shapes/gladius-plain.glb'), '7e39180d7e15bf52ef62645fc346899a56c7e8d308728d53f7b34e742f19b437');
});
