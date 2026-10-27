// M7 fight-feel registry (src/fight/feel.ts): ?feel= names, registration, the event bus V3's sim subscribes to, and that the three call sites in ragdoll.ts exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activeFeels, emitFeel, feel, feelNames, registerFeel } from '../src/fight/feel.ts';

test('?feel= lists module names, comma separated; absent or empty means none', () => {
  assert.deepEqual(feelNames(''), []);
  assert.deepEqual(feelNames('?feel='), []);
  assert.deepEqual(feelNames('?feel=hitreact'), ['hitreact']);
  assert.deepEqual(feelNames('?rules=m4&feel=hitreact, kick,'), ['hitreact', 'kick']);
});

test('activeFeels returns the registered hooks the page asked for, in its order, and ignores a name nothing registered', () => {
  const a = { hit() {} }, b = { frame() {} };
  registerFeel('t-a', a); registerFeel('t-b', b);
  assert.deepEqual(activeFeels('?feel=t-b,nope,t-a'), [b, a]);
  assert.deepEqual(activeFeels(''), []);
  const c = { kill() {} }; registerFeel('t-a', c);   // a second registration of a name replaces the first
  assert.deepEqual(activeFeels('?feel=t-a'), [c]);
});

test('feel events reach the named subscriber and the "*" one, are readable on globalThis.__feelEvents, and stop after unsubscribe', () => {
  globalThis.__feelEvents = [];
  const seen = [], off1 = feel.on('feel:limp', (n, p) => seen.push(['limp', n, p])), off2 = feel.on('*', (n) => seen.push(['*', n]));
  emitFeel('feel:limp', { part: 'leg_left', level: 0.5 });
  emitFeel('feel:clash', { kind: 'block', pushbackM: 0.4 });
  assert.deepEqual(seen, [['limp', 'feel:limp', { part: 'leg_left', level: 0.5 }], ['*', 'feel:limp'], ['*', 'feel:clash']]);
  assert.deepEqual(globalThis.__feelEvents.map((e) => e.name), ['feel:limp', 'feel:clash']);
  off1(); off2();
  emitFeel('feel:limp', {});
  assert.equal(seen.length, 3, 'no subscriber left');
});

test('limb state comes from the sim: feel.setLimbState hands the budget fractions to the hooks, none by default', () => {
  assert.deepEqual(feel.limbs(), {});
  feel.setLimbState(() => ({ leg_left: 0, head: 1 }));
  assert.deepEqual(feel.limbs(), { leg_left: 0, head: 1 });
  feel.setLimbState(null);
  assert.deepEqual(feel.limbs(), {});
});

test('ragdoll.ts calls the registry at the three sites (a Hit on him, every frame, his killing blow) and takes the hooks from the page', () => {
  const src = readFileSync(new URL('../src/fight/ragdoll.ts', import.meta.url), 'utf8');
  for (const call of ['f.hit?.(e, feelCtx())', 'f.frame?.(dt, events, feelCtx())', 'f.kill?.(killed, feelCtx())', 'activeFeels(search)']) assert.ok(src.includes(call), call);
});
