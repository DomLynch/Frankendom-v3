// The open-world budget rows (data/perf.json): they validate, a bad row is refused, and no tier asks for more corpses than data/physics.json corpse.max keeps (a cap above it would never bind).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFile } from '../src/sim/validate.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const ROWS = read('../data/perf.json'), PHYSICS = read('../data/physics.json'), clone = (x) => JSON.parse(JSON.stringify(x));

test('the rows validate and no tier keeps more corpses than the physics row allows', () => {
  assert.deepEqual(validateFile('perf', ROWS), []);
  for (const [tier, row] of Object.entries(ROWS.tiers)) assert.ok(row.corpsesMax <= PHYSICS.corpse.max, `${tier}.corpsesMax is above data/physics.json corpse.max`);
  assert.ok(ROWS.tiers.phone.frameMsP95 >= ROWS.tiers.full.frameMsP95, 'the phone is allowed at least the full tier\'s frame time');
  assert.ok(ROWS.tiers.phone.corpsesMax <= ROWS.tiers.full.corpsesMax && ROWS.tiers.phone.cutPiecesMax <= ROWS.tiers.full.cutPiecesMax, 'the phone never keeps more than the full tier');
});

test('a bad row is refused', () => {
  const bad = (f) => { const r = clone(ROWS); f(r); return validateFile('perf', r).join('\n'); };
  assert.match(bad((r) => { r.extra = 1; }), /perf\.extra: unknown key/);
  assert.match(bad((r) => { r.tiers.phone.frameMsP95 = 0; }), /frameMsP95/);
  assert.match(bad((r) => { r.tiers.phone.corpsesMax = 1.5; }), /corpsesMax/);
  assert.match(bad((r) => { r.tiers.full.feelOff = 'yes'; }), /feelOff/);
  assert.match(bad((r) => { r.tiers.phone.bogus = 1; }), /bogus: unknown key/);
  assert.match(bad((r) => { delete r.tiers.full; }), /tiers\.full: a tier row is required/);
  assert.match(bad((r) => { r.ladder = ['corpses', 'corpses']; }), /ladder/);
  assert.match(bad((r) => { r.ladder = ['wings']; }), /ladder/);
  assert.match(bad((r) => { r.ladder = ['corpses']; }), /ladder/, 'a partial ladder is refused');
  assert.match(bad((r) => { r.tiers.phone = null; }), /tiers\.phone: must be an object/, 'a null tier is an error, not a crash');
  assert.match(bad((r) => { r.windowFrames = 0; }), /windowFrames/);
});
