// V3 directional heavies, the touch and key flow (src/fight/input.ts, oneButton on): a hold on STRIKE arms the heavy at input.heavy-hold-ms, a slide inside
// input.heavy-grace-ms picks the side or the stab, no slide is V1's heavy; a slide before the hold is still a light or the stab; G + A/D/W picks by key.
// The DOM is faked: each control is an event target with the few fields input.ts touches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInput, HEAVY_HOLD_MS, HEAVY_GRACE_MS, STAB_SLIDE_PX } from '../src/fight/input.ts';
import { initialPractice } from '../src/fight/combat.ts';

function fake() {
  const handlers = {};
  return {
    handlers, dataset: {}, style: {}, offsetWidth: 0,
    addEventListener: (t, f) => { (handlers[t] ??= []).push(f); },
    fire(t, e = {}) { for (const f of handlers[t] ?? []) f({ button: 0, pointerId: 1, preventDefault() {}, ...e }); },
    setPointerCapture() {}, setAttribute() {}, click() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 72, height: 72 }),
  };
}
function rig(practice = initialPractice()) {
  const els = {}, win = fake();
  let now = 0;
  const p = { ...practice, duel: { ...practice.duel, fighters: [{ ...practice.duel.fighters[0], phase: 'ready', stamina: 100 }, practice.duel.fighters[1]] } };
  const controls = createInput({
    element: (id) => (els[id] ??= fake()), window: win, now: () => now, matchMedia: () => ({ matches: false }), innerWidth: () => 400,
    paused: () => false, ready: () => true, practice: () => p, quiet: () => {},
  });
  const strike = els['attack-button'];
  return {
    controls, strike, win, p,
    at(t) { now = t; },
    // one frame at time t: the action the sim sees (then consumed)
    frame(t) { now = t; const a = controls.intent().action; controls.consumed([]); return a; },
  };
}
const C = 36;   // the STRIKE circle's centre in the fake rect

test('a hold with no slide is V1\'s heavy, after the grace', () => {
  const r = rig();
  r.at(0); r.strike.fire('pointerdown', { clientX: C, clientY: C });
  assert.equal(r.frame(HEAVY_HOLD_MS - 1), null);
  assert.equal(r.frame(HEAVY_HOLD_MS), null, 'armed, waiting for a slide');
  assert.equal(r.frame(HEAVY_HOLD_MS + HEAVY_GRACE_MS - 1), null);
  assert.equal(r.frame(HEAVY_HOLD_MS + HEAVY_GRACE_MS), 'heavy');
});

test('a slide inside the grace picks the heavy cut or the heavy stab', () => {
  for (const [dx, dy, want] of [[-STAB_SLIDE_PX, 0, 'heavy_left'], [STAB_SLIDE_PX, 0, 'heavy_right'], [0, -STAB_SLIDE_PX, 'heavy_thrust']]) {
    const r = rig();
    r.at(0); r.strike.fire('pointerdown', { clientX: C, clientY: C });
    assert.equal(r.frame(HEAVY_HOLD_MS), null);
    r.at(HEAVY_HOLD_MS + 20); r.strike.fire('pointermove', { clientX: C + dx, clientY: C + dy });
    assert.equal(r.frame(HEAVY_HOLD_MS + 20), want);
  }
});

test('a release inside the grace is V1\'s heavy at once; a slide before the hold is still the light cut or the stab', () => {
  let r = rig();
  r.at(0); r.strike.fire('pointerdown', { clientX: C, clientY: C });
  assert.equal(r.frame(HEAVY_HOLD_MS), null);
  r.at(HEAVY_HOLD_MS + 30); r.strike.fire('pointerup', { clientX: C, clientY: C });
  assert.equal(r.frame(HEAVY_HOLD_MS + 30), 'heavy');
  for (const [dx, dy, want] of [[-STAB_SLIDE_PX, 0, 'light_left'], [STAB_SLIDE_PX, 0, 'light_right'], [0, -STAB_SLIDE_PX, 'thrust']]) {
    r = rig();
    r.at(0); r.strike.fire('pointerdown', { clientX: C, clientY: C });
    r.at(100); r.strike.fire('pointermove', { clientX: C + dx, clientY: C + dy });
    assert.equal(r.frame(100), want);
  }
});

test('inside a counter window the heavy fires at the short hold, with no grace (as V1)', () => {
  const r = rig();
  r.p.duel.fighters[0].counterWindow = 10;
  r.at(0); r.strike.fire('pointerdown', { clientX: C, clientY: C });
  const hits = [];
  for (let t = 0; t <= HEAVY_HOLD_MS; t += 10) { const a = r.frame(t); if (a) hits.push([t, a]); }
  assert.equal(hits.length, 1);
  assert.equal(hits[0][1], 'heavy');
  assert.ok(hits[0][0] < HEAVY_HOLD_MS, 'the short window hold');
});

test('keyboard: G alone is V1\'s heavy; G with A, D or W is that heavy', () => {
  for (const [held, want] of [[null, 'heavy'], ['KeyA', 'heavy_left'], ['KeyD', 'heavy_right'], ['KeyW', 'heavy_thrust'], ['ArrowLeft', 'heavy_left'], ['ArrowUp', 'heavy_thrust']]) {
    const r = rig();
    if (held) r.win.fire('keydown', { code: held });
    r.win.fire('keydown', { code: 'KeyG' });
    assert.equal(r.frame(0), want, `G + ${held ?? 'nothing'}`);
  }
});
