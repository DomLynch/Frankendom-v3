// V3's opponent brains (src/brain.ts, data/brains.json): ?ai=v1 is V1's profile untouched; a row moves only the knobs it names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brainFor, brainProfile } from '../src/brain.ts';
import { OPPONENTS, profileAt } from '../src/fight/moves.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const BRAINS = read('brains.json'), FIGHT = read('fight.json');
const opponent = OPPONENTS[FIGHT.opponent], v1 = profileAt(opponent, FIGHT.level);

test('?ai=v1 plays V1 profile as the same object (today\'s fight)', () => {
  assert.equal(brainFor(BRAINS.brains, FIGHT.ai, '?ai=v1'), undefined);
  assert.equal(brainProfile(v1, brainFor(BRAINS.brains, FIGHT.ai, '?x=1&ai=v1')), v1);
});

test('the fight plays a brains.json row by default, laid over the opponent\'s own V1 profile', () => {
  const row = brainFor(BRAINS.brains, FIGHT.ai, '');
  assert.ok(row, `data/fight.json ai '${FIGHT.ai}' is a brains.json row`);
  const p = brainProfile(v1, row);
  for (const [k, v] of Object.entries(row)) if (k !== 'id') assert.equal(p[k], v, k);
  for (const k of Object.keys(v1)) if (!(k in row)) assert.equal(p[k], v1[k], `${k} stays V1's`);
  assert.equal('id' in p, false);
});

test('the novice is V2\'s novice brain and is easier than V1\'s normal on every skill knob', () => {
  const n = BRAINS.brains.find((b) => b.id === 'novice'), normal = opponent.profiles.normal;
  assert.deepEqual(n, { id: 'novice', reaction: 40, accuracy: 0.3, parry: 0.03, dodge: 0.05, aggression: 0.3, pressure: 0, discipline: 70, lapse: 0.6, read: 0.2 });
  assert.ok(n.reaction > normal.reaction && n.accuracy < normal.accuracy && n.parry < normal.parry && n.dodge < normal.dodge);
  assert.ok(n.aggression < normal.aggression && n.lapse > normal.lapse && n.read < normal.read && n.discipline > normal.discipline);
});

test('an unknown row is an error, not V1 in disguise', () => {
  assert.throws(() => brainFor(BRAINS.brains, 'nope', ''), /no row 'nope'/);
});
