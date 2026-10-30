// The career titles (src/core/career-rules.json ladderRule.titles) are checked at load against the sub-rank count and the grade table's tiers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TITLES, validateLadderTitles } from '../src/core/career-ladder.ts';
import { GRADES, TIERS, validateGradeTiers } from '../src/core/grades.ts';

const RULES = JSON.parse(readFileSync(new URL('../src/core/career-rules.json', import.meta.url), 'utf8')).ladderRule[0];

test('the shipped titles cover maxLevel exactly and match the grade tiers', () => {
  assert.doesNotThrow(() => validateLadderTitles(TITLES, RULES.maxLevel));
  assert.equal(TITLES.length * 5, RULES.maxLevel);
  assert.deepEqual(Object.keys(GRADES), [...TIERS]);
});

test('a title list of the wrong length throws at load with a clear message', () => {
  assert.throws(() => validateLadderTitles(TITLES.slice(0, 9), 50), /9 titles x 5 sub-ranks is 45 levels, but maxLevel is 50/);
  assert.throws(() => validateLadderTitles([...TITLES, 'Extra'], 50), /11 titles x 5 sub-ranks is 55 levels/);
});

test('an empty, blank or repeated title throws', () => {
  assert.throws(() => validateLadderTitles([...TITLES.slice(0, 9), ''], 50), /non-empty string/);
  assert.throws(() => validateLadderTitles([...TITLES.slice(0, 9), TITLES[0]], 50), /distinct/);
});

test('the grade table must have one tier per title, in order', () => {
  assert.doesNotThrow(() => validateGradeTiers(TITLES, GRADES));
  assert.throws(() => validateGradeTiers([...TITLES, 'Extra'], GRADES), /GRADES has 10 tiers .* but the career titles are 11/);
  assert.throws(() => validateGradeTiers(TITLES.slice().reverse(), GRADES), /must match in count and order/);
});
