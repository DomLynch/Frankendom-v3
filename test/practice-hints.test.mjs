// The practice HUD's lines moved to data/practice-hints.json (as-data gate, label kind). Every branch of practiceHint (hand-built states in test/fixtures/practice-hint-cases.mjs) must read
// exactly what the code printed BEFORE the move (test/fixtures/practice-hint-golden.json, recorded from the old code).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { practiceHint, counterLine } from '../src/fight/combat.ts';
import { validateFile } from '../src/sim/validate.js';
import { cases } from './fixtures/practice-hint-cases.mjs';

const read = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const GOLDEN = read('./fixtures/practice-hint-golden.json'), FILE = read('../data/practice-hints.json');

test('practice-hints.json validates', () => assert.deepEqual(validateFile('practice-hints', FILE), []));

test('every branch of practiceHint reads the same words as before the move', () => {
  const all = cases();
  assert.ok(all.length >= 120);
  for (const c of all) assert.equal(practiceHint(c.s, ...c.args), GOLDEN[c.label], c.label);
  assert.equal(counterLine('Goblin'), GOLDEN['counterLine plain']);
  assert.equal(counterLine('Goblin', 'Grendel'), GOLDEN['counterLine legend']);
});

test('a bad file is refused: a missing line, an unknown piece, a blank move name', () => {
  const bad = structuredClone(FILE);
  delete bad.lines.fell; bad.lines.miss = 'Miss {nope}'; bad.moves.thrust = ' '; bad.parts.hitKind.stop = '';
  const e = validateFile('practice-hints', bad).join('\n');
  assert.match(e, /lines\.fell: must be a string/); assert.match(e, /lines\.miss: unknown piece \{nope\}/); assert.match(e, /moves\.thrust/); assert.match(e, /hitKind\.stop/);
});
