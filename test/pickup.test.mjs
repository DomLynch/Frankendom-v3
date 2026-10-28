// Taking a boss's body parts (data/pickup.json, src/fight/pickup.ts): presentation only. Pinned: the rows validate (and a bad row is refused), the pickup is ON by default and ?pickup=v1 turns it off, the hint's
// clock (it waits for the frozen corpse, goes after hintSeconds, after a selection, after a walk away), the tap pick (nearest part inside the hit disc, none when too far), the safe box that keeps everything off the
// thumbs, the Take path through the bus event row, and the page wiring (a small hunk in scene.ts and ragdoll.ts, no sim import).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFile } from '../src/sim/validate.js';
import { PICKUP, clampTo, eligible, newPickupState, pick, pickupOn, pickupTapGate, plan, safeBox, select, validatePickup } from '../src/fight/pickup.ts';

const ROWS = JSON.parse(readFileSync(new URL('../data/pickup.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const part = (o = {}) => ({ corpseId: 'pitborn#1', unit: 'arm_left', boss: 'pitborn', frozenS: 1, at: { x: 0, y: 0, z: 0 }, centre: { x: 0, y: 0, z: 0 }, take: () => true, sx: 100, sy: 300, cx: 180, cy: 330, onScreen: true, cOnScreen: true, dist: 4, ...o });

test('the rows validate, and a bad row is refused', () => {
  assert.deepEqual(validateFile('pickup', ROWS), []);
  validatePickup(PICKUP);
  const bad = (f) => { const r = clone(ROWS); f(r); return r; };
  assert.deepEqual(validateFile('pickup', bad((r) => { r.extra = 1; })), ['pickup.extra: unknown key']);
  assert.deepEqual(validateFile('pickup', bad((r) => { r.arrow.extra = 1; })), ['pickup.arrow.extra: unknown key']);
  assert.throws(() => validatePickup(bad((r) => { r.colour = 'yellow'; })), /colour/);
  assert.throws(() => validatePickup(bad((r) => { r.hintSeconds = 0; })), /hintSeconds/);
  assert.throws(() => validatePickup(bad((r) => { r.units = []; })), /units/);
  assert.throws(() => validatePickup(bad((r) => { r.walkAwayM = r.rangeM + 1; })), /walkAwayM/);
  assert.throws(() => validatePickup(bad((r) => { r.safe.bottomFrac = 2; })), /bottomFrac/);
  assert.throws(() => validatePickup(bad((r) => { r.pill.label = ''; })), /pill\.label/);
  assert.throws(() => validatePickup(bad((r) => { r.fly.seconds = NaN; })), /fly\.seconds/);
});

test('the rows say what Dom asked for: a yellow arrow, "Take your body parts", about 8 s, the corpse frozen first, the cut units', () => {
  assert.equal(PICKUP.colour.toLowerCase(), '#ffd34a');
  assert.equal(PICKUP.text.label, 'Take your body parts');
  assert.equal(PICKUP.pill.label, 'Take');
  assert.equal(PICKUP.hintSeconds, 8);
  assert.equal(PICKUP.event, 'part:taken');
  const cue = JSON.parse(read('../data/physics.json')).cut.cue;
  assert.ok(cue.delayS <= PICKUP.delayS + 1e-9 || PICKUP.delayS >= 0.6 - 1e-9, 'it waits for the fall like the old cue did');
  for (const u of PICKUP.units) assert.ok(cue.units.includes(u), `${u} is a cuttable unit`);
});

test('the pickup is ON by default and ?pickup=v1 turns the whole thing off', () => {
  assert.equal(PICKUP.on, true);
  assert.equal(pickupOn(''), true);
  assert.equal(pickupOn('?x=1'), true);
  assert.equal(pickupOn('?pickup=v1'), false);
  assert.equal(pickupOn('?foo=1&pickup=v1'), false);
  assert.equal(pickupOn('?pickup=2'), true);
  assert.equal(pickupOn('', { ...PICKUP, on: false }), false);
  assert.equal(pickupTapGate(10, 10), false, 'nothing mounted: a tap is the corpse tap as it always was');
});

test('the hint waits for the frozen corpse, runs 8 s, and is gone for that corpse after', () => {
  const st = newPickupState();
  assert.equal(plan(PICKUP, st, [part({ frozenS: 0.2 })], 0.1).hint, null, 'still falling: no arrow');
  assert.ok(plan(PICKUP, st, [part({ frozenS: 0.7 })], 0.1).hint, 'frozen: the arrow shows');
  for (let i = 0; i < 70; i++) assert.ok(plan(PICKUP, st, [part()], 0.1).hint, `second ${(i + 1) / 10 + 0.1}`);
  for (let i = 0; i < 20; i++) plan(PICKUP, st, [part()], 0.1);
  assert.equal(plan(PICKUP, st, [part()], 0.1).hint, null, 'no tap in 8 s: the arrow and line are gone');
  assert.ok(plan(PICKUP, st, [part({ corpseId: 'pitborn#2' })], 0.1).hint, 'the next corpse has its own');
});

test('nothing takeable, or the hero walked away: no arrow; it points at the nearest corpse', () => {
  const st = newPickupState();
  assert.equal(plan(PICKUP, st, [], 0.1).hint, null);
  assert.equal(plan(PICKUP, st, [part({ dist: PICKUP.walkAwayM + 1 })], 0.1).hint, null, 'walked away');
  assert.ok(plan(PICKUP, st, [part({ dist: PICKUP.walkAwayM - 1 })], 0.1).hint, 'back in range: it returns (its clock was not spent)');
  const far = part({ corpseId: 'b#1', dist: 9 }), near = part({ corpseId: 'a#1', dist: 3 });
  const s2 = newPickupState();
  assert.equal(plan(PICKUP, s2, [far, near], 0.1).hint?.corpseId, 'a#1');
});

test('a tap picks the nearest part inside the hit disc, and none outside it', () => {
  const a = part({ unit: 'arm_left', sx: 100, sy: 300 }), b = part({ unit: 'head', sx: 120, sy: 300 });
  assert.equal(pick(PICKUP, [a, b], 112, 300)?.unit, 'head');
  assert.equal(pick(PICKUP, [a, b], 104, 300)?.unit, 'arm_left');
  assert.equal(pick(PICKUP, [a, b], 100 - PICKUP.hitRadiusPx - 1, 300), null);
  assert.equal(pick(PICKUP, [part({ onScreen: false })], 100, 300), null, 'off screen');
  assert.equal(pick(PICKUP, [part({ frozenS: 0.1 })], 100, 300), null, 'still falling');
  assert.equal(pick(PICKUP, [part({ dist: PICKUP.rangeM + 1 })], 100, 300), null, 'out of range');
  assert.equal(eligible(PICKUP, [part(), part({ frozenS: 0 })]).length, 1);
});

test('select, Take and walking away: a selection ends the hint; losing the part clears it', () => {
  const st = newPickupState(), p = part();
  assert.ok(plan(PICKUP, st, [p], 0.1).hint);
  select(st, p);
  const sel = plan(PICKUP, st, [p], 0.1);
  assert.equal(sel.hint, null, 'the main arrow goes once a part is selected');
  assert.equal(sel.selected?.unit, 'arm_left');
  assert.equal(plan(PICKUP, st, [part({ dist: PICKUP.rangeM + 5 })], 0.1).selected, null, 'out of range: let go');
  select(st, p);
  assert.equal(plan(PICKUP, st, [], 0.1).selected, null, 'the part was taken or timed out: let go');
  assert.equal(plan(PICKUP, st, [p], 0.1).hint, null, 'and the hint does not come back for that corpse');
});

test('the safe box keeps the arrow, the line and the pill off the thumb controls at 375 x 812', () => {
  const b = safeBox(PICKUP, 375, 812);
  assert.ok(b.bottom <= 812 * 0.72, `bottom ${b.bottom}: above the controls (they start about 72 % down)`);
  assert.ok(b.top >= 812 * 0.15, `top ${b.top}: below the HUD bars`);
  assert.ok(b.pillRight < 375 - PICKUP.safe.sideMarginPx, 'the pill stays left of the right edge');
  assert.ok(b.pillRight <= 375 * 0.7, 'and on the left side of the STRIKE cluster');
  assert.equal(clampTo(5, 10, 20), 10); assert.equal(clampTo(25, 10, 20), 20); assert.equal(clampTo(15, 10, 20), 15);
});

test('page wiring: scene mounts it behind pickupOn and ticks it; the ragdoll asks the gate and announces part:taken from the row', () => {
  const scene = read('../src/fight/scene.ts'), rag = read('../src/fight/ragdoll.ts'), pk = read('../src/fight/pickup.ts');
  assert.match(scene, /pickupOn\(location\.search\)/);
  assert.match(scene, /pickup\?\.frame\(animationDt\)/);
  assert.match(rag, /!pickupTapGate\(e\.clientX, e\.clientY\)/);
  assert.match(rag, /emitFeel\(PICKUP\.event,/);
  assert.match(rag, /registerTakeSource\(/);
  assert.doesNotMatch(pk, /from '\.\/(duel|moves|sim)|src\/sim/, 'presentation only: no sim import');
  assert.doesNotMatch(rag, /cut-cue.*#ffd34a/i, 'the old circles stay off');
});
