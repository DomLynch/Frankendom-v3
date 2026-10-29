// The top-level data-layer shift: values that left src/*.ts for data rows keep their old numbers byte-for-byte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFile } from '../src/sim/validate.js';

const INPUT = JSON.parse(readFileSync(new URL('../data/input.json', import.meta.url), 'utf8'));

test('input.json detect.doubleTapMs is the 350 ms double-tap window src/zoom-guard.ts held, and the file validates', () => {
  assert.equal(INPUT.detect.doubleTapMs, 350);
  assert.deepEqual(validateFile('input', INPUT), []);
});

test('src/zoom-guard.ts has no 350 literal of its own', () => {
  const src = readFileSync(new URL('../src/zoom-guard.ts', import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/\b350\b/.test(src.replace(/\/\/.*$/gm, '')));
  assert.match(src, /DOUBLE_TAP_MS/);
});
