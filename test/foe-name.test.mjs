// The HUD names the Minotaur body the Minotaur (Dom 2026-10-26, data/fight.json foeName; display only). ?foe=v1 = the Centurion's body and name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { foeDisplayName, foeNameFor, setFoeName } from '../src/fight/foe-name.ts';
import { validateFile } from '../src/sim/validate.js';

const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));

test('the fight opponent is named the Minotaur; the sim id stays veteran', () => {
  assert.deepEqual([FIGHT.foeName.opponent, FIGHT.foeName.name], [FIGHT.opponent, 'Minotaur']);
  assert.equal(FIGHT.opponent, 'veteran');
  assert.deepEqual(validateFile('fight', FIGHT), [], 'fight.json validates');
  setFoeName(foeNameFor(FIGHT.foeName, ''));
  assert.equal(foeDisplayName('veteran'), 'Minotaur');
  assert.notEqual(foeDisplayName('goblin'), 'Minotaur', 'other opponents keep their roster names');
  setFoeName(foeNameFor(FIGHT.foeName, '?trail=v1'));
  assert.equal(foeDisplayName('veteran'), 'Minotaur', 'another flag leaves it on');
  setFoeName(null);
});

test('?foe=v1 keeps the Centurion', () => {
  for (const q of ['?foe=v1', '?hero=v1&foe=v1']) {
    setFoeName(foeNameFor(FIGHT.foeName, q));
    assert.equal(foeDisplayName('veteran'), 'Centurion', q);
  }
  setFoeName(null);
});
