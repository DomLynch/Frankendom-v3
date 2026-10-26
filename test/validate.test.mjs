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

test('a file with no schema is rejected', () => {
  assert.match(validateFile('nope', {}).join('\n'), /nope: no schema/);
});
