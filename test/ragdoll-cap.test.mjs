// The package's cap on simultaneous ragdolls (physics budget-rows.json max_simultaneous_ragdolls, admit()) as V3 asks it (src/fight/ragdoll.ts admitRagdoll).
// The cap is the package's row, never a number here; a single kill (no other ragdoll awake) is admitted exactly as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { admit } from '@frankendom/physics';
import { admitRagdoll } from '../src/fight/ragdoll.ts';

const rows = JSON.parse(readFileSync(new URL('../node_modules/@frankendom/physics/data/budget-rows.json', import.meta.url), 'utf8'));
const chunk = { admit, budgetRows: rows };
const awake = (n) => Array.from({ length: n }, () => ({ awake: true }));

test('the row is the package\'s (3 today) and V3 reads it, not a copy (behaviour half; the source pins moved to test/source-pins/)', () => {
  assert.equal(rows.max_simultaneous_ragdolls, 3);
});

test('a single kill is admitted as before; with three active ragdolls the fourth is baked', () => {
  const cap = rows.max_simultaneous_ragdolls;
  assert.equal(admitRagdoll(chunk, awake(0)), 'ragdoll');
  assert.equal(admitRagdoll(chunk, awake(1)), 'ragdoll');
  assert.equal(admitRagdoll(chunk, awake(cap - 1)), 'ragdoll');
  assert.equal(admitRagdoll(chunk, awake(cap)), 'baked');
  assert.equal(admitRagdoll(chunk, awake(3)), 'baked');
});

test('the cap counts one Jolt world: 3 parked/held foes (a world each) plus a live foe are not capped; 3 awake fighting/dying in one world cap the 4th', () => {
  const worlds = [0, 1, 2, 3].map(() => new Set([{ awake: true }]));   // a zone page: three held foes' worlds and the live foe's, one awake ragdoll each
  for (const w of worlds) assert.equal(admitRagdoll(chunk, w), 'ragdoll');
  const fight = new Set(awake(3));                                       // one world: three awake ragdolls (live + dying corpses)
  assert.equal(admitRagdoll(chunk, fight), 'baked');
});

test('a corpse asleep does not count against the cap; the cap row moves the answer', () => {
  assert.equal(admitRagdoll(chunk, [...awake(2), { awake: false }, { awake: false }]), 'ragdoll');
  assert.equal(admitRagdoll({ admit, budgetRows: { ...rows, max_simultaneous_ragdolls: 1 } }, awake(1)), 'baked');
});
