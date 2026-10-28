// The HUD names the Minotaur body the Minotaur (Dom 2026-10-26, data/fight.json foeName; display only). ?foe=v1 = the Centurion's body and name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { foeDisplayName, foeNameFor, setFoeName } from '../src/fight/foe-name.ts';
import { validateFile } from '../src/sim/validate.js';
import { fightOpponent } from '../src/fight/foe-pick.ts';

const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));

test('the fight opponent (the Pitborn since Dom 10-26) is named the Minotaur; the sim id is his own', () => {
  assert.deepEqual([FIGHT.foeName.opponent, FIGHT.foeName.name], [FIGHT.order.opponent, 'Minotaur']);
  assert.equal(FIGHT.opponent, 'executioner', 'the first opponent is the Gargantua since the boss reorder; the Minotaur is the third (order.opponent is the order before)');
  assert.deepEqual(validateFile('fight', FIGHT), [], 'fight.json validates');
  setFoeName(foeNameFor(FIGHT.foeName, '', fightOpponent(FIGHT, '?order=v1')));
  assert.equal(foeDisplayName('pitborn'), 'Minotaur');
  assert.equal(foeDisplayName('veteran'), 'Centurion', 'the name is on the page opponent only');
  assert.notEqual(foeDisplayName('goblin'), 'Minotaur', 'other opponents keep their roster names');
  setFoeName(foeNameFor(FIGHT.foeName, '?trail=v1', fightOpponent(FIGHT, '?trail=v1&order=v1')));
  assert.equal(foeDisplayName('pitborn'), 'Minotaur', 'another flag leaves it on');
  setFoeName(null);
});

test('?pitborn=v1: the Centurion in the Minotaur body, still named the Minotaur', () => {
  const q = '?pitborn=v1';
  assert.equal(fightOpponent(FIGHT, q), 'veteran');
  setFoeName(foeNameFor(FIGHT.foeName, q, fightOpponent(FIGHT, q)));
  assert.equal(foeDisplayName('veteran'), 'Minotaur');
  setFoeName(null);
});

// 106 only (Dom 2026-10-26): ?foe=v1 (the Centurion's 65 body and name) is gone; the old link reads as the default page.
test('?foe=v1 no longer does anything: the Pitborn, named the Minotaur', () => {
  for (const q of ['?foe=v1', '?hero=v1&foe=v1']) {
    assert.equal(fightOpponent(FIGHT, q), 'executioner', q);
    setFoeName(foeNameFor(FIGHT.foeName, q, FIGHT.foeName.opponent));
    assert.equal(foeDisplayName('pitborn'), 'Minotaur', q);
  }
  assert.equal(fightOpponent(FIGHT, '?pitborn=v1&foe=v1'), 'veteran', '?pitborn=v1 is the Centurion\'s fight');
  setFoeName(null);
});
