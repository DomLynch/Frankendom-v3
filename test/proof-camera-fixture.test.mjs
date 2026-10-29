// PROOF ONLY (throwaway branch proof/camera-pre-change, never merged): the camera/feel probe run on the PRE-change src+data (34317a36) must reproduce every key of
// test/fixtures/camera-feel-ab.json, including the zone-chase-* keys (rig and follow keys to 1e-12 as in test/camera-feel-ab.test.mjs, the rest bit for bit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { probe } from './helpers/camera-feel-probe.mjs';

const GOLDEN = JSON.parse(readFileSync(new URL('./fixtures/camera-feel-ab.json', import.meta.url), 'utf8'));
const NOW = JSON.parse(JSON.stringify(probe()));
const close = (a, b, path = '') => {
  if (typeof a === 'number' && typeof b === 'number') return assert.ok(Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b)), `${path}: ${a} vs ${b}`);
  if (Array.isArray(a) && Array.isArray(b)) { assert.equal(a.length, b.length, path); return a.forEach((x, i) => close(x, b[i], `${path}[${i}]`)); }
  if (a && b && typeof a === 'object' && typeof b === 'object') { assert.deepEqual(Object.keys(a), Object.keys(b), path); return Object.keys(a).forEach((k) => close(a[k], b[k], `${path}.${k}`)); }
  assert.deepEqual(a, b, path);
};
const keys = Object.keys(GOLDEN);
test(`proof: the fixture has ${keys.length} keys, ${keys.filter((k) => k.startsWith('zone-chase')).length} of them zone-chase-*`, () => assert.ok(keys.some((k) => k.startsWith('zone-chase'))));
for (const key of keys) test(`pre-change code reproduces fixture key: ${key}`, () => close(NOW[key], GOLDEN[key], key));
test('the probe covers what the fixture covers, nothing more', () => assert.deepEqual(Object.keys(NOW), keys));
