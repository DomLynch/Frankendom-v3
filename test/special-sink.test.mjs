// A landed special no longer sinks the struck body into the sand (data/fight.json specialSink, Dom 2026-10-26); ?dip=v1 = V1's knee-dip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setSpecialSink, specialLift } from '../src/fight/special-sink.ts';
import { validateFile } from '../src/sim/validate.js';

const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));

test('the row is off by default and validates', () => {
  assert.equal(FIGHT.specialSink.sink, false);
  assert.deepEqual(validateFile('fight', FIGHT), []);
});

test('no sink: a drop stays at the floor, a lift still lifts; ?dip=v1 keeps V1 exactly', () => {
  setSpecialSink(false);
  assert.equal(specialLift(-0.28), 0);
  assert.equal(specialLift(0.35), 0.35);
  setSpecialSink(true);
  assert.equal(specialLift(-0.28), -0.28);
  assert.equal(specialLift(0.35), 0.35);
});
