// BOSS ORDER (Dom 2026-10-28): the first opponent is the Gargantua, the second the Arachne, the third the Minotaur. The order is data (zone row spawn kinds, data/fight.json
// opponent/profile, data/profiles.json default); ?order=v1 (data/fight.json order) is the order before. This pins that every row agrees, that the revert is the old order exactly,
// and that every lookup the page makes for the live foe and for each held spawn resolves (ragdoll rows through the real held path, weapon rows, names).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orderedZone, orderProfile, orderV1 } from '../src/fight/boss-order.ts';
import { fightOpponent } from '../src/fight/foe-pick.ts';
import { heldRagdollFor, ragdollRowFor } from '../src/fight/ragdoll.ts';
import { rigStemOf } from '../src/fight/rig-bones.ts';
import { bodyOwnerOf, setBossBody, spawnBodyFile, foeBodyFile, profileBodyOf } from '../src/fight/foe-body.ts';
import { foeDisplayName, foeNameFor, setFoeName, setKindNames } from '../src/fight/foe-name.ts';
import { bossOpponent, bossRowOfBody } from '../src/fight/boss-weapon.ts';
import { OPPONENTS } from '../src/fight/moves.ts';
import { validateFile } from '../src/sim/validate.js';
import { zoneFor } from '../src/zone/zone-rows.ts';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}.json`, import.meta.url), 'utf8'));
const FIGHT = read('fight'), PROFILES = read('profiles'), PHYSICS = read('physics'), ZONE = zoneFor('');
const profile = (id) => PROFILES.profiles.find((p) => p.id === id);

test('the order: spawn 1 Gargantua (the opener), spawn 2 Arachne (east), spawn 3 Minotaur (west); the fight row and the default profile agree', () => {
  assert.deepEqual(ZONE.spawns.map((s) => [s.id, s.kind]), [['yard-pitborn', 'gargantua'], ['pit-pitborn-east', 'arachne'], ['pit-pitborn-west', 'pitborn']]);
  assert.equal(FIGHT.profile, 'gargantua'); assert.equal(PROFILES.default, 'gargantua');
  assert.equal(profile(FIGHT.profile).opponent, FIGHT.opponent); assert.equal(FIGHT.opponent, 'executioner');
  assert.equal(profile(ZONE.spawns[0].kind).opponent, fightOpponent(FIGHT, ''), 'the zone opener is the page fight\'s opponent');
  assert.deepEqual(validateFile('fight', FIGHT), []); assert.deepEqual(validateFile('profiles', PROFILES), []);
});

test('?order=v1 (and ?pitborn=v1) is the order before: Minotaur, Gargantua, Arachne; the shipped row is never mutated', () => {
  const before = structuredClone(ZONE);
  for (const search of ['?order=v1', '?pitborn=v1']) {
    assert.deepEqual(orderedZone(ZONE, FIGHT.order, search).spawns.map((s) => s.kind), ['pitborn', 'gargantua', 'arachne'], search);
    assert.equal(orderProfile(FIGHT.profile, FIGHT.order, search), 'pitborn', search);
  }
  assert.equal(fightOpponent(FIGHT, '?order=v1'), 'pitborn'); assert.equal(fightOpponent(FIGHT, '?pitborn=v1'), 'veteran');
  assert.equal(orderedZone(ZONE, FIGHT.order, ''), ZONE, 'no flag: the very same row'); assert.equal(orderV1(FIGHT.order, '?order=v2'), false);
  assert.deepEqual(ZONE, before);
  assert.deepEqual(Object.keys(FIGHT.order.kinds).sort(), ZONE.spawns.map((s) => s.id).sort(), 'the revert names every spawn');
  assert.equal(profile(FIGHT.order.profile).opponent, FIGHT.order.opponent);
});

test('the ragdoll rows resolve for the live foe and each held spawn through the real lookups, on the new page (executioner) and on ?order=v1 (pitborn)', () => {
  setBossBody('');
  assert.equal(ragdollRowFor(PHYSICS, '', 'executioner')?.body, 'gargantua', 'the live foe: the Gargantua\'s row');
  for (const stem of ['arachne', 'minotaur', 'gargantua']) {
    assert.equal(ragdollRowFor(PHYSICS, '', 'executioner', stem)?.body, stem, `held ${stem}`);
    assert.ok(heldRagdollFor('', 'executioner', rigStemOf(`${stem}-106`)), `heldRagdollFor builds a ragdoll for ${stem}`);
    assert.equal(heldRagdollFor('?physics=v1', 'executioner', stem), null);
  }
  assert.equal(ragdollRowFor(PHYSICS, '', 'pitborn')?.body, 'minotaur');
  for (const stem of ['arachne', 'gargantua']) assert.ok(heldRagdollFor('', 'pitborn', stem), `?order=v1: held ${stem}`);
  assert.deepEqual(Object.keys(PHYSICS.opponents.find((o) => o.id === 'executioner' && o.body === 'minotaur').measure), ['106']);
});

test('every body has its owner, weapon and name: the held Minotaur fights and is drawn with the cleaver, the Gargantua with the maul row', () => {
  setBossBody('');
  assert.deepEqual(['minotaur-106', 'gargantua-106', 'arachne-106'].map(bodyOwnerOf), ['pitborn', 'executioner', 'shieldmaiden']);
  assert.equal(bodyOwnerOf('psyche-106'), undefined);
  assert.equal(bossOpponent(OPPONENTS.pitborn, '').weapon, 'cleaver');
  assert.equal(bossOpponent(OPPONENTS.executioner, '').weapon, 'maul');
  assert.equal(bossOpponent(OPPONENTS.executioner, '?bossweapon=v1').weapon, OPPONENTS.executioner.weapon);
  assert.equal(bossRowOfBody('minotaur-106', profileBodyOf, ''), undefined);
  assert.equal(bossRowOfBody('gargantua-106', profileBodyOf, '')?.weapon, 'maul', 'the live rig of the default page is armed from this row (scene.ts liveBoss)');
  assert.equal(spawnBodyFile('pitborn', 'x'), 'minotaur-106'); assert.equal(foeBodyFile('executioner', 'x'), 'gargantua-106');
  setFoeName(foeNameFor(FIGHT.foeName, '', FIGHT.foeName.opponent)); setKindNames(PROFILES.profiles);
  assert.deepEqual(['executioner', 'shieldmaiden', 'pitborn'].map(foeDisplayName), ['Gargantua', 'Arachne', 'Minotaur']);
  setKindNames([]); setFoeName(null);
});

test('the page wires the order: zone and spots through orderedZone, the opener through orderProfile, the live rig armed from its boss row', () => {
  const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8'), main = src('client/main.ts'), scene = src('fight/scene.ts');
  assert.match(main, /orderedZone\(zoneFor\(search\), FIGHT\.order, search\)/);
  assert.match(main, /orderProfile\(FIGHT\.profile, FIGHT\.order, search\)/);
  assert.match(scene, /const liveBoss = bossRowOfBody\(foeBodyFile\(opponentId/);
  assert.match(scene, /bossOpponent\(OPPONENTS\[opponentId\], pageSearch\)/);
});
