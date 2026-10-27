// The boss body is a data row (Dom 2026-10-27; data/profiles.json `body`, docs/BOSS-BODIES.md): the default is pinned to today's Minotaur, a body the rig rows do not
// know (or that has no clips) is rejected, ?boss= swaps it for a page and nothing else, and the ragdoll / cleaver-bake rows fitted to the Minotaur step aside for another body.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBodies, validateAll, validateFile } from '../src/sim/validate.js';
import { foeBodyFile, foeBodySwapped, foeKitFile, setBossBody } from '../src/fight/foe-body.ts';
import { foeSweepsFor } from '../src/fight/foe-reach.ts';
import { ragdollRowFor } from '../src/fight/ragdoll.ts';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const PROFILES = read('profiles'), RIG = read('rig'), FIGHT = read('fight'), PHYSICS = read('physics');
const clone = (x) => structuredClone(x);

test('the default boss body is the Minotaur, pinned (a change is a deliberate re-pin)', () => {
  assert.equal(PROFILES.defaultBody, 'minotaur');
  assert.equal(PROFILES.profiles.find((p) => p.id === PROFILES.default).body, 'minotaur');
  setBossBody('');
  assert.equal(foeBodyFile('pitborn', 'ignored'), 'minotaur-106');
  assert.equal(foeBodyFile('veteran', 'ignored'), 'minotaur-106');   // ?pitborn=v1's Centurion is drawn as the Minotaur too
  assert.equal(foeKitFile('pitborn'), null);
  assert.ok(foeBodySwapped('pitborn'));
});

test('the rows validate; an unknown body, a clip-less body and two bodies on one opponent are rejected', () => {
  assert.deepEqual(validateAll({ profiles: PROFILES, rig: RIG, fight: FIGHT }), []);
  assert.deepEqual(validateFile('profiles', PROFILES), []);
  const unknown = clone(PROFILES); unknown.profiles[0].body = 'no-such-body';
  assert.match(checkBodies(unknown, RIG).join('\n'), /profiles\.pitborn\.body: 'no-such-body' is not a data\/rig\.json files row/);
  assert.match(validateAll({ profiles: unknown, rig: RIG }).join('\n'), /no-such-body/);
  const noDefault = clone(PROFILES); noDefault.defaultBody = 'kachujin';
  assert.match(checkBodies(noDefault, RIG).join('\n'), /profiles\.defaultBody: 'kachujin' is not a data\/rig\.json files row/);
  const noClips = clone(RIG); noClips.files.kachujin = 'kachujin-106';   // a files row whose 106 file has no clips106 folder
  const clipless = clone(PROFILES); clipless.profiles[0].body = 'kachujin';
  assert.match(checkBodies(clipless, noClips).join('\n'), /no data\/rig\.json clips106\.dir folder/);
  const two = clone(PROFILES); two.profiles.push({ ...two.profiles[0], id: 'pitborn-b', body: 'psyche' });
  assert.match(checkBodies(two, RIG).join('\n'), /one body per opponent id/);
  const unknownKey = clone(PROFILES); unknownKey.profiles[0].bodie = 'x';
  assert.match(validateFile('profiles', unknownKey).join('\n'), /bodie: unknown key/);
});

test('?boss= draws every boss in another usable body for that page only; a bad value is ignored with a warning', () => {
  const warned = [];
  assert.equal(setBossBody('?boss=psyche', (m) => warned.push(m)), 'psyche');
  assert.equal(foeBodyFile('pitborn', 'ignored'), 'psyche-106');
  assert.equal(foeBodyFile('pitborn', 'ignored', true), 'psyche');
  assert.equal(setBossBody('?boss=nobody', (m) => warned.push(m)), null);
  assert.equal(foeBodyFile('pitborn', 'ignored'), 'minotaur-106');   // back to the row
  assert.equal(warned.length, 1);
  assert.match(warned[0], /\?boss=nobody ignored: 'nobody' is not a data\/rig\.json files row/);
  setBossBody('');
});

test("the Minotaur-fitted ragdoll row and cleaver bake apply to the Minotaur only", () => {
  setBossBody('');
  assert.ok(ragdollRowFor(PHYSICS, '', 'pitborn'), 'default: the Pitborn has his ragdoll row');
  assert.ok(foeSweepsFor(FIGHT.foeReach, '', 'pitborn'), 'default: the cleaver sweeps are laid over V1 s table');
  setBossBody('?boss=psyche', () => {});
  assert.equal(ragdollRowFor(PHYSICS, '?boss=psyche', 'pitborn'), null, 'Psyche has no measure row yet: today s death');
  assert.equal(foeSweepsFor(FIGHT.foeReach, '?boss=psyche', 'pitborn'), null, "the bake is the Minotaur's");
  setBossBody('');
});
