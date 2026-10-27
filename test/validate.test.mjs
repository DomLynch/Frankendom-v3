import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { SCHEMA, validateAll, validateFile } from '../src/sim/validate.js';

const dir = new URL('../data/', import.meta.url);
const files = Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.json'))
  .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(new URL(f, dir), 'utf8'))]));
const clone = (x) => JSON.parse(JSON.stringify(x));

test('every data file has a schema and the whole set validates', () => {
  for (const name of Object.keys(files)) assert.ok(SCHEMA[name], `${name} has a schema`);
  assert.deepEqual(validateAll(files), []);
});

test('an unknown key is rejected', () => {
  const bad = clone(files.stage);
  bad.duel.zoom = 2;
  bad.skye = '#fff';
  const errs = validateFile('stage', bad).join('\n');
  assert.match(errs, /stage\.duel\.zoom: unknown key/);
  assert.match(errs, /stage\.skye: unknown key/);
});

test('an armour block or immune field is rejected anywhere', () => {
  const bad = clone(files.stage);
  bad.light.block = true;
  assert.match(validateFile('stage', bad).join('\n'), /stage\.light\.block: armour may not block/);
});

test('cut.tap numeric rows must be present and finite (a missing one would be a NaN push)', () => {
  const missing = clone(files.physics); delete missing.cut.tap.awayMult;
  assert.match(validateFile('physics', missing).join('\n'), /physics\.cut\.tap\.awayMult: must be a finite number/);
  const nan = clone(files.physics); nan.cut.tap.sideMult = null;
  assert.match(validateFile('physics', nan).join('\n'), /physics\.cut\.tap\.sideMult: must be a finite number/);
  assert.deepEqual(validateFile('physics', files.physics), [], 'the shipped row validates');
});

test('cut.cue: known units, a label for every unit, and a plain #rrggbb colour (it is pasted into CSS)', () => {
  const unit = clone(files.physics); unit.cut.cue.units.push('tail');
  assert.match(validateFile('physics', unit).join('\n'), /physics\.cut\.cue\.units: unknown unit tail/);
  const label = clone(files.physics); delete label.cut.cue.labels.head;
  assert.match(validateFile('physics', label).join('\n'), /physics\.cut\.cue\.labels\.head: a unit needs a label/);
  const color = clone(files.physics); color.cut.cue.color = 'red;}body{display:none';
  assert.match(validateFile('physics', color).join('\n'), /physics\.cut\.cue\.color: must be #rrggbb/);
  assert.deepEqual(validateFile('physics', files.physics), []);
});

test('a file with no schema is rejected', () => {
  assert.match(validateFile('nope', {}).join('\n'), /nope: no schema/);
});
