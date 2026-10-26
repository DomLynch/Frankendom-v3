// `?heavy=v1` turns the V3 directional heavies off: today's (V1's) input exactly. A hold on STRIKE is the heavy at input.heavy-hold-ms with no grace, a slide
// after it changes nothing, and G + A/D/W is the plain heavy. Its own file: input.ts reads the query once, at load.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { search: '?heavy=v1' };
const { createInput, DIRECTIONAL_HEAVY, HEAVY_HOLD_MS, STAB_SLIDE_PX } = await import('../src/fight/input.ts');
const { initialPractice } = await import('../src/fight/combat.ts');

function fake() {
  const handlers = {};
  return {
    dataset: {}, style: {}, offsetWidth: 0,
    addEventListener: (t, f) => { (handlers[t] ??= []).push(f); },
    fire(t, e = {}) { for (const f of handlers[t] ?? []) f({ button: 0, pointerId: 1, preventDefault() {}, ...e }); },
    setPointerCapture() {}, setAttribute() {}, click() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 72, height: 72 }),
  };
}
function rig() {
  const els = {}, win = fake(), s = initialPractice();
  let now = 0;
  const p = { ...s, duel: { ...s.duel, fighters: [{ ...s.duel.fighters[0], phase: 'ready', stamina: 100 }, s.duel.fighters[1]] } };
  const controls = createInput({ element: (id) => (els[id] ??= fake()), window: win, now: () => now, matchMedia: () => ({ matches: false }), innerWidth: () => 400, paused: () => false, ready: () => true, practice: () => p, quiet: () => {} });
  return { strike: els['attack-button'], win, at(t) { now = t; }, frame(t) { now = t; const a = controls.intent().action; controls.consumed([]); return a; } };
}

test('?heavy=v1: the directional heavies are off', () => assert.equal(DIRECTIONAL_HEAVY, false));

test('?heavy=v1: a hold is the heavy at the hold, a later slide changes nothing', () => {
  const r = rig();
  r.at(0); r.strike.fire('pointerdown', { clientX: 36, clientY: 36 });
  assert.equal(r.frame(HEAVY_HOLD_MS - 1), null);
  assert.equal(r.frame(HEAVY_HOLD_MS), 'heavy');
  r.at(HEAVY_HOLD_MS + 20); r.strike.fire('pointermove', { clientX: 36 - STAB_SLIDE_PX, clientY: 36 });
  assert.equal(r.frame(HEAVY_HOLD_MS + 20), null);
});

test('?heavy=v1: G with A, D or W is the plain heavy', () => {
  for (const held of [null, 'KeyA', 'KeyD', 'KeyW']) {
    const r = rig();
    if (held) r.win.fire('keydown', { code: held });
    r.win.fire('keydown', { code: 'KeyG' });
    assert.equal(r.frame(0), 'heavy', `G + ${held ?? 'nothing'}`);
  }
});
