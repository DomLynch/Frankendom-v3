// The ten Pit ranks' named opponents moved from src/fight/catalogue-data.ts to data/legends.json (as-data gate, label kind). The text must read exactly as before:
// the sha256 below is of the old literals (name, source, backstory per rank, rows in catalogue order) taken from the data file before the move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { catalogueRow } from '../src/fight/catalogue-rows.ts';
import { validateFile } from '../src/sim/validate.js';

const IDS = ['veteran', 'pitborn', 'goblin', 'nightborn', 'executioner', 'dwarf', 'plaguedoctor', 'knight', 'witch', 'shieldmaiden'];
const FILE = JSON.parse(readFileSync(new URL('../data/legends.json', import.meta.url), 'utf8'));

test('legends.json validates and names exactly the ten ranked characters', () => {
  assert.deepEqual(validateFile('legends', FILE), []);
  assert.deepEqual(Object.keys(FILE.ranks), IDS);
});

test('every ranked row reads the same 100 rank legends as the old literals, byte for byte', () => {
  const old = Object.fromEntries(IDS.map((id) => [id, catalogueRow(id).ranks.map((x) => ({ name: x.name, source: x.source, backstory: x.backstory }))]));
  assert.equal(Object.values(old).flat().length, 100);
  assert.equal(createHash('sha256').update(JSON.stringify(old)).digest('hex'), '5171acdacfc630570fb848df71126127b33347718acee736e49cf425aa6e7f57');
});

test('a creature row keeps no ranks, and the first rank of the Centurion is Crixus', () => {
  assert.deepEqual(catalogueRow('minotaur').ranks, []);
  assert.equal(catalogueRow('veteran').ranks[0].name, 'Crixus');
});

test('a bad legends file is refused', () => {
  const bad = structuredClone(FILE);
  bad.ranks.veteran.pop();
  bad.ranks.pitborn[0].backstory = ' ';
  bad.ranks.dwarf[1].extra = 1;
  const e = validateFile('legends', bad).join('\n');
  assert.match(e, /veteran: must list exactly ten/);
  assert.match(e, /pitborn\[0\]\.backstory: must be a non-blank/);
  assert.match(e, /dwarf\[1\]\.extra: unknown key/);
});
