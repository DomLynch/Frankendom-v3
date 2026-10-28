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

test('the default boss body is the Gargantua (the first opponent since the boss reorder) and the Minotaur is the pitborn profile\'s, pinned (a change is a deliberate re-pin)', () => {
  assert.equal(PROFILES.defaultBody, 'minotaur');
  assert.equal(PROFILES.default, 'gargantua');
  assert.equal(PROFILES.profiles.find((p) => p.id === PROFILES.default).body, 'gargantua');
  assert.equal(PROFILES.profiles.find((p) => p.id === 'pitborn').body, 'minotaur');
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
  const noDefault = clone(PROFILES); noDefault.defaultBody = 'synthbody';
  assert.match(checkBodies(noDefault, RIG).join('\n'), /profiles\.defaultBody: 'synthbody' is not a data\/rig\.json files row/);
  const noClips = clone(RIG); noClips.files.synthbody = 'synthbody-106';   // a files row whose 106 file has no clips106 folder
  const clipless = clone(PROFILES); clipless.profiles[0].body = 'synthbody';
  assert.match(checkBodies(clipless, noClips).join('\n'), /no data\/rig\.json clips106\.dir folder/);
  const two = clone(PROFILES); two.profiles.push({ ...two.profiles[0], id: 'pitborn-b', body: 'psyche' });
  assert.match(checkBodies(two, RIG).join('\n'), /one body per opponent id/);
  const unknownKey = clone(PROFILES); unknownKey.profiles[0].bodie = 'x';
  assert.match(validateFile('profiles', unknownKey).join('\n'), /bodie: unknown key/);
});

// Only two 106 bodies are in the repo and one is the hero's, so a second boss body is a synthetic rig row here (a third `files` row with a clips106 folder).
const ROOMY = clone(RIG); ROOMY.files.synthbody = 'synthbody-106'; ROOMY.clips106.dir['synthbody-106'] = '106/synthbody';

test('?boss= draws every boss in another usable body for that page only; a bad value is ignored with a warning', () => {
  const warned = [], warn = (m) => warned.push(m);
  assert.equal(setBossBody('?boss=synthbody', warn, ROOMY, 'psyche'), 'synthbody');
  assert.equal(foeBodyFile('pitborn', 'ignored', true), 'synthbody');
  assert.equal(foeBodyFile('veteran', 'ignored', true), 'synthbody');
  assert.equal(setBossBody('?boss=nobody', warn, ROOMY, 'psyche'), null);
  assert.equal(foeBodyFile('pitborn', 'ignored'), 'minotaur-106');   // back to the row
  assert.equal(warned.length, 1);
  assert.match(warned[0], /\?boss=nobody ignored: 'nobody' is not a data\/rig\.json files row/);
  assert.equal(setBossBody('?boss=synthbody', warn, RIG, 'psyche'), null, 'a body the rig rows do not have is ignored');
  setBossBody('');
});

test("the hero's own body is not a boss body: the page shares one rig between two actors of one file and it carries one weapon", () => {
  const warned = [];
  assert.equal(setBossBody('?boss=psyche', (m) => warned.push(m)), null, 'the real rows: Psyche is the hero');
  assert.match(warned[0], /'psyche' is the hero's body/);
  assert.equal(foeBodyFile('pitborn', 'ignored'), 'minotaur-106');
  const bad = clone(PROFILES); bad.profiles[0].body = 'psyche';
  assert.match(checkBodies(bad, RIG, 'psyche').join('\n'), /profiles\.pitborn\.body: 'psyche' is the hero's body/);
  assert.deepEqual(checkBodies(PROFILES, RIG, 'psyche'), []);
});

test('the Minotaur-fitted ragdoll row and cleaver bake apply to the Minotaur only', () => {
  setBossBody('');
  assert.ok(ragdollRowFor(PHYSICS, '', 'pitborn'), 'default: the Pitborn has his ragdoll row');
  assert.ok(foeSweepsFor(FIGHT.foeReach, '', 'pitborn'), "default: the cleaver sweeps are laid over V1's table");
  setBossBody('?boss=synthbody', () => {}, ROOMY, 'psyche');
  assert.equal(ragdollRowFor(PHYSICS, '', 'pitborn'), null, 'another body has no measure row: today\'s death');
  assert.equal(foeSweepsFor(FIGHT.foeReach, '', 'pitborn'), null, "the bake is the Minotaur's");
  setBossBody('');
});
