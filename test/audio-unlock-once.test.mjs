// The audio-unlock gesture listeners (src/audio/unlock-once.ts, wired in src/client/main.ts): armed while the audio is locked, gone once it runs, armed again only if it locks again.
// Audit D: they used to stay for the page's life and every gesture ran the unlock (feedback.resume allocates a one-sample buffer each time).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudioUnlock, rearmWhenLocked } from '../src/audio/unlock-once.ts';

function fakeTarget() {
  const map = new Map();
  return {
    addEventListener: (t, fn) => { (map.get(t) ?? map.set(t, new Set()).get(t)).add(fn); },
    removeEventListener: (t, fn) => { map.get(t)?.delete(fn); },
    fire: (t) => { for (const fn of [...(map.get(t) ?? [])]) fn(); },
    count: () => [...map.values()].reduce((n, s) => n + s.size, 0),
  };
}
const TYPES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];

test('listeners run the unlock until the context is running, then every one is removed and nothing runs again', () => {
  const target = fakeTarget(); let running = false, runs = 0;
  const u = createAudioUnlock({ target, types: TYPES, run: () => { runs++; }, unlocked: () => running });
  u.arm();
  assert.equal(target.count(), TYPES.length);
  target.fire('pointerdown'); target.fire('pointerup');   // the context has not reached running yet: a retry is still wanted
  assert.equal(runs, 2); assert.equal(target.count(), TYPES.length);
  running = true;
  target.fire('touchend');   // this gesture finds it running: the last one
  assert.equal(runs, 3); assert.equal(target.count(), 0, 'all listeners removed');
  assert.equal(u.armed(), false);
  for (const t of TYPES) target.fire(t);
  assert.equal(runs, 3, 'no gesture runs the unlock any more');
});

test('arm is idempotent (a wake handler may call it often) and a later lock re-arms the same single set', () => {
  const target = fakeTarget(); let running = true, runs = 0;
  const u = createAudioUnlock({ target, types: TYPES, run: () => { runs++; }, unlocked: () => running });
  u.arm(); u.arm(); u.arm();
  assert.equal(target.count(), TYPES.length, 'never doubled');
  target.fire('click'); assert.equal(target.count(), 0);
  running = false; u.arm();   // the page was locked again (a call, an app switch)
  assert.equal(target.count(), TYPES.length);
  running = true; target.fire('keydown');
  assert.equal(runs, 2); assert.equal(target.count(), 0);
});

test('a statechange to a locked state re-arms the listeners; a statechange to running does not', () => {
  const target = fakeTarget(); let running = true; let fire = () => {};
  const u = createAudioUnlock({ target, types: TYPES, run: () => {}, unlocked: () => running });
  rearmWhenLocked((fn) => { fire = fn; }, u.arm, () => running);
  u.arm(); target.fire('click'); assert.equal(target.count(), 0);
  fire(); assert.equal(target.count(), 0, 'still running: stays disarmed');
  running = false; fire();   // iOS: 'interrupted', no pageshow or focus
  assert.equal(target.count(), TYPES.length, 're-armed');
  fire(); assert.equal(target.count(), TYPES.length, 'idempotent');
});
