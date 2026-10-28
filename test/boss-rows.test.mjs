// Zone bosses 2 and 3 (Dom 2026-10-28): the Gargantua (V1 executioner, health x3.75) and the Arachne (V1 shieldmaiden) are data/profiles.json rows with a display `name`.
// OpenTrident's bodies (data/rig.json files + clips106 rows, the GLBs) are a separate PR, so the zone spawn rows that name them are proved here against SYNTHETIC
// bodies (the way test/boss-body.test.mjs does); the shipped zone row stays three Pitborn until the bodies merge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBodies, checkKinds, validateFile, validateZone } from '../src/sim/validate.js';
import { OPPONENTS, opponentAt } from '../src/fight/moves.ts';
import { resolveFight, scaledOpponent } from '../src/difficulty.ts';
import { foeDisplayName, foeNameFor, setFoeName, setKindNames } from '../src/fight/foe-name.ts';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
const PROFILES = read('profiles'), RIG = read('rig'), DIFF = read('difficulty'), BRAINS = read('brains'), FIGHT = read('fight');
const ZONE = JSON.parse(readFileSync(new URL('../data/zones/zone1.row.json', import.meta.url), 'utf8'));
const clone = (x) => structuredClone(x);
const row = (id) => PROFILES.profiles.find((p) => p.id === id);

test('the rows: gargantua is the executioner at health x3.75 (first value on the row), arachne the shieldmaiden at x1; both named', () => {
  const g = row('gargantua'), a = row('arachne');
  assert.deepEqual([g.opponent, g.name, g.foeHealthScale, g.foeDamageScale, g.brain], ['executioner', 'Gargantua', 3.75, 1, null]);
  assert.deepEqual([a.opponent, a.name, a.foeHealthScale, a.foeDamageScale, a.brain], ['shieldmaiden', 'Arachne', 1, 1, null]);
  assert.equal(Object.keys(g)[1], 'foeHealthScale', 'the one number Dom tunes is the first value after the id');
  assert.equal(Object.keys(a)[1], 'foeHealthScale');
  assert.deepEqual(validateFile('profiles', PROFILES), []);
  assert.deepEqual(checkKinds(PROFILES, Object.keys(OPPONENTS)), []);
  assert.deepEqual(checkBodies(PROFILES, RIG, 'psyche'), [], 'with no body named the rows draw the default body: valid on main before the bodies land');
  assert.equal(PROFILES.default, 'pitborn');
});

test('health: executioner 160 x 3.75 = 600 at scale 1 of the ladder; the default difficulty row (0.72) makes it 432; the Arachne is 190 x 0.72', () => {
  const at = (id, pick) => scaledOpponent(opponentAt(OPPONENTS[row(id).opponent], FIGHT.level), resolveFight({ profile: id, difficulty: pick }, PROFILES.profiles, DIFF, BRAINS.brains)).health;
  assert.equal(OPPONENTS.executioner.health, 160);
  assert.equal(at('gargantua', 'legacy'), 600);
  assert.equal(at('gargantua', DIFF.default), Math.round(160 * 3.75 * DIFF.rows.find((r) => r.id === DIFF.default).foeHealthScale));
  assert.equal(at('arachne', 'legacy'), 190);
});

test('names: a profile row names its own spawn; a nameless row and the page-wide Minotaur row are unchanged; no row, no change', () => {
  setFoeName(foeNameFor(FIGHT.foeName, '', 'pitborn'));
  assert.equal(foeDisplayName('executioner'), 'Executioner', 'before the rows are set: the roster name');
  setKindNames(PROFILES.profiles);
  assert.equal(foeDisplayName('executioner'), 'Gargantua');
  assert.equal(foeDisplayName('shieldmaiden'), 'Arachne');
  assert.equal(foeDisplayName('pitborn'), 'Minotaur');
  setKindNames([]); setFoeName(null);
  assert.equal(foeDisplayName('executioner'), 'Executioner');
  const bad = clone(PROFILES); bad.profiles[1].name = '  ';
  assert.match(checkKinds(bad, Object.keys(OPPONENTS)).join('\n'), /profiles\.gargantua\.name: must be a non-empty display name/);
});

// The gated half: spawn 2 = gargantua, spawn 3 = arachne, each drawn in its own body. The bodies are synthetic rig rows here (OpenTrident's PR adds the real ones).
const ROOMY = clone(RIG);
for (const b of ['gargantua', 'arachne']) { ROOMY.files[b] = `${b}-106`; ROOMY.clips106.dir[`${b}-106`] = `106/${b}`; }
const WITH_BODIES = clone(PROFILES); for (const p of WITH_BODIES.profiles) if (p.id === 'gargantua' || p.id === 'arachne') p.body = p.id;
const MIXED = clone(ZONE); MIXED.spawns[1].kind = 'gargantua'; MIXED.spawns[2].kind = 'arachne';

test('the staged rows (bodies named, spawn 2 gargantua, spawn 3 arachne) validate against synthetic bodies; spawn 1 stays pitborn', () => {
  const kinds = WITH_BODIES.profiles.map((p) => p.id);
  assert.deepEqual(checkBodies(WITH_BODIES, ROOMY, 'psyche'), []);
  assert.deepEqual(validateZone(MIXED, kinds, ROOMY), []);
  assert.deepEqual(MIXED.spawns.map((s) => s.kind), ['pitborn', 'gargantua', 'arachne']);
  assert.match(checkBodies(WITH_BODIES, RIG, 'psyche').join('\n'), /profiles\.gargantua\.body: 'gargantua' is not a data\/rig\.json files row/, 'on main without the bodies the same rows are refused: that is why they are staged last');
});

test('the shipped zone row is unchanged: three Pitborn, no spawn body', () => {
  assert.deepEqual(ZONE.spawns.map((s) => [s.id, s.kind]), [['yard-pitborn', 'pitborn'], ['pit-pitborn-east', 'pitborn'], ['pit-pitborn-west', 'pitborn']]);
  assert.ok(ZONE.spawns.every((s) => s.body === undefined));
  assert.equal(PROFILES.profiles.find((p) => p.id === 'pitborn').body, 'minotaur');
});
