// The swing trail softer (data/fight.json trail, Dom 2026-10-26): the cuts at half, the stab 30% less, on V1's .12; ?trail=v1 = today's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTrailOpacity, swingTrailOpacity } from '../src/fight/trail-opacity.ts';
import { ATTACKS } from '../src/fight/combat.ts';

const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));
const close = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`);

test('every number in the row names a clip key the swing plays', () => {
  for (const [key, v] of Object.entries(FIGHT.trail)) if (key !== 'about') { assert.ok(key in ATTACKS, key); assert.equal(typeof v, 'number', key); }
});

test('cuts at half, the stab 30% less; the pommel keeps V1', () => {
  setTrailOpacity(FIGHT.trail);
  for (const cut of ['light', 'return', 'heavy', 'slashRiposte']) close(swingTrailOpacity(cut), .06, cut);
  for (const stab of ['thrust', 'riposte']) close(swingTrailOpacity(stab), .084, stab);
  close(swingTrailOpacity('pommel'), .12, 'pommel');
});

test('?trail=v1 (null) is V1\'s .12 on every swing', () => {
  setTrailOpacity(null);
  for (const key of Object.keys(ATTACKS)) close(swingTrailOpacity(key), .12, key);
});
