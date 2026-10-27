// Remote sword (src/presence/sword.ts): a body spawned before the hero's shape lands gets it when it lands; a rank change reaches live bodies; nothing is applied twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RemoteSwords } from '../src/presence/sword.ts';

const body = () => { const calls = []; return { calls, reshape: (m) => calls.push(m) }; };

test('a body spawned before the shape lands keeps the rig part, then takes the shape when it lands', () => {
  const swords = new RemoteSwords(), a = body(), b = body();
  swords.add(a); swords.add(b);
  assert.deepEqual(a.calls, [], 'nothing decided yet: no call');
  assert.equal(swords.set('blade1'), 2);
  assert.deepEqual(a.calls, ['blade1']); assert.deepEqual(b.calls, ['blade1']);
});

test('a body spawned after the shape landed takes it at once', () => {
  const swords = new RemoteSwords(), a = body();
  swords.set('blade1'); swords.add(a);
  assert.deepEqual(a.calls, ['blade1']);
});

test('the same shape again changes nothing (no stacking, no per-tick work)', () => {
  const swords = new RemoteSwords(), a = body();
  swords.add(a); swords.set('blade1');
  assert.equal(swords.set('blade1'), 0); assert.equal(swords.set('blade1'), 0);
  assert.deepEqual(a.calls, ['blade1']);
});

test('a rank change reaches every live body; a rank with no shape puts the rig part back', () => {
  const swords = new RemoteSwords(), a = body(), b = body();
  swords.add(a); swords.set('blade1'); swords.add(b);
  swords.set('blade2'); swords.set(undefined);
  assert.deepEqual(a.calls, ['blade1', 'blade2', undefined]);
  assert.deepEqual(b.calls, ['blade1', 'blade2', undefined]);
  swords.add(body()); assert.equal(swords.size, 3);
});
