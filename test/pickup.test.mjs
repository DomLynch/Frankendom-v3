// The cut hint (data/pickup.json, src/fight/pickup.ts), presentation only. Dom 2026-10-28: the select + Take UI of #219 is out; the corpse works as before (a tap on a part cuts it). Pinned: the rows validate (a bad
// row is refused), the hint is ON by default with the default text and ?pickup=v1 hides it, there is NO Take pill / select / part:taken anywhere, the hint's clock (it waits for the frozen corpse, goes after
// the first cut, after hintSeconds, or when the hero walks away), the safe box that keeps it off the thumbs, and the page wiring (no gate on the corpse tap).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFile } from '../src/sim/validate.js';
import { PICKUP, clampTo, newPickupState, pickupOn, plan, safeBox, validatePickup } from '../src/fight/pickup.ts';

const ROWS = JSON.parse(readFileSync(new URL('../data/pickup.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const body = (o = {}) => ({ corpseId: 'pitborn#1', frozenS: 1, cuts: 1, centre: { x: 0, y: 0, z: 0 }, cx: 180, cy: 330, onScreen: true, dist: 4, ...o });

test('the rows validate, and a bad row is refused', () => {
  assert.deepEqual(validateFile('pickup', ROWS), []);
  validatePickup(PICKUP);
  const bad = (f) => { const r = clone(ROWS); f(r); return r; };
  assert.deepEqual(validateFile('pickup', bad((r) => { r.extra = 1; })), ['pickup.extra: unknown key']);
  assert.deepEqual(validateFile('pickup', bad((r) => { r.pill = {}; })), ['pickup.pill: unknown key'], 'no Take pill row');
  assert.throws(() => validatePickup(bad((r) => { r.colour = 'yellow'; })), /colour/);
  assert.throws(() => validatePickup(bad((r) => { r.hintSeconds = 0; })), /hintSeconds/);
  assert.throws(() => validatePickup(bad((r) => { r.text.label = ''; })), /text\.label/);
  assert.throws(() => validatePickup(bad((r) => { r.units = []; })), /units/);
});

test('the default: a yellow arrow with the text row "Strike to dismember", ~0.6 s after the freeze, 8 s; ?pickup=v1 hides it', () => {
  assert.equal(PICKUP.on, true);
  assert.equal(PICKUP.text.label, 'Strike to dismember');
  assert.deepEqual(PICKUP.units, JSON.parse(read('../data/physics.json')).cut.cue.units, 'the hint counts the six units the old circles covered: head, both arms, both legs, the waist');
  assert.equal(PICKUP.units.length, 6);
  assert.equal(PICKUP.colour.toLowerCase(), '#ffd34a');
  assert.equal(PICKUP.delayS, 0.6);
  assert.equal(PICKUP.hintSeconds, 8);
  assert.equal(pickupOn(''), true);
  assert.equal(pickupOn('?pickup=v1'), false);
  assert.equal(pickupOn('', { ...PICKUP, on: false }), false);
});

test('no Take pill, no select, no part:taken, no yellow cut circles: the corpse tap is the plain cut', () => {
  const pk = read('../src/fight/pickup.ts'), rag = read('../src/fight/ragdoll.ts'), scene = read('../src/fight/scene.ts');
  for (const word of ['part:taken', 'pk-pill', 'pk-sel', 'pk-chip', 'pickupTapGate', 'takeablesOf']) for (const [n, s] of [['pickup.ts', pk], ['ragdoll.ts', rag], ['scene.ts', scene]]) assert.ok(!s.includes(word), `${word} is not in ${n}`);
  assert.ok(!('event' in ROWS) && !('pill' in ROWS) && !('fly' in ROWS), 'no Take rows');
  // #252 (cut.strike): the same maxMovePx/maxMs gate, then the tap goes straight to the corpse tap (the strike row off) or through the strike, whose aimed pass IS that same corpse tap at the same point
  assert.match(rag, /<= row\.maxMs\)\) return;/, 'a tap passes the same px/ms gate');
  assert.match(rag, /if \(!strike\?\.on\) \{ this\.tap\(aim\(e\.clientX, e\.clientY\)\); return; \}/, 'the strike row off: a tap goes straight to the corpse tap');
  assert.match(rag, /req\.aim \? this\.tap\(aim\(req\.aim\.x, req\.aim\.y\)\) : null/, 'the strike\'s aimed pass is the corpse tap at the point');
  assert.match(rag, /strikeOnce\(e\.timeStamp, \{ x: e\.clientX, y: e\.clientY \}\)/, 'a finger\'s tap hands its point to the strike');
  assert.match(scene, /pickupOn\(location\.search\)/);
  assert.match(scene, /pickup\?\.frame\(animationDt\)/);
  assert.match(rag, /registerHintSource\(/);
  assert.equal(JSON.parse(read('../data/physics.json')).cut.cue.default, false, 'the circles stay off (#215)');
});

test('the hint waits for the frozen corpse, runs 8 s, and is gone for that corpse after', () => {
  const st = newPickupState();
  assert.equal(plan(PICKUP, st, [body({ frozenS: 0.2 })], 0.1), null, 'still falling: no arrow');
  assert.ok(plan(PICKUP, st, [body({ frozenS: 0.7 })], 0.1), 'frozen: the arrow shows');
  for (let i = 0; i < 70; i++) assert.ok(plan(PICKUP, st, [body()], 0.1));
  for (let i = 0; i < 20; i++) plan(PICKUP, st, [body()], 0.1);
  assert.equal(plan(PICKUP, st, [body()], 0.1), null, 'no cut in 8 s: gone');
  assert.ok(plan(PICKUP, st, [body({ corpseId: 'pitborn#2' })], 0.1), 'the next corpse has its own');
});

test('the first cut made while it shows ends the hint (a cut the kill made does not)', () => {
  const st = newPickupState();
  assert.ok(plan(PICKUP, st, [body({ cuts: 1 })], 0.1), 'the kill already cut one unit: the hint shows');
  assert.ok(plan(PICKUP, st, [body({ cuts: 1 })], 0.1));
  assert.equal(plan(PICKUP, st, [body({ cuts: 2 })], 0.1), null, 'the player cut a part: gone');
  assert.equal(plan(PICKUP, st, [body({ cuts: 2 })], 0.1), null, 'and it does not come back');
});

test('nothing to hint, or the hero walked away: no arrow; it points at the nearest corpse', () => {
  const st = newPickupState();
  assert.equal(plan(PICKUP, st, [], 0.1), null);
  assert.equal(plan(PICKUP, st, [body({ dist: PICKUP.walkAwayM + 1 })], 0.1), null, 'walked away');
  assert.ok(plan(PICKUP, st, [body({ dist: PICKUP.walkAwayM - 1 })], 0.1), 'back in range: it returns');
  assert.equal(plan(PICKUP, newPickupState(), [body({ corpseId: 'b#1', dist: 9 }), body({ corpseId: 'a#1', dist: 3 })], 0.1)?.corpseId, 'a#1');
});

test('the safe box keeps the arrow and line above the thumb controls at 375 x 812', () => {
  const b = safeBox(PICKUP, 375, 812);
  assert.ok(b.bottom <= 812 * 0.72 && b.top >= 812 * 0.15);
  assert.equal(clampTo(5, 10, 20), 10); assert.equal(clampTo(25, 10, 20), 20); assert.equal(clampTo(15, 10, 20), 15);
});
