// Fractional knockback (audit C, 2026-10-29; data/fight.json knockRound, src/fight/knock-round.ts, the shove in duel.ts wound()). A glancing (off-band, x0.4) blow's knockback is a fraction:
// V1 shoved ceil(fraction) whole steps (a thrust of 3 x 0.4 = 1.2 shoved TWO), the flag rounds it (1). Off by default in a headless run (Gate 0 steps V1's ceil byte for byte).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFile } from '../src/sim/validate.js';
import { KNOCK_ROUND, knockRoundFor, setKnockRound, shoveSteps } from '../src/fight/knock-round.ts';
import { createFighter, idleIntent, opponentFighter, stepDuel } from '../src/fight/duel.ts';
import { OPPONENTS } from '../src/fight/moves.ts';

const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));
afterEach(() => setKnockRound(false));

test('the row validates, defaults on for the page, and ?knock=v1 turns it off', () => {
  assert.deepEqual(validateFile('fight', FIGHT), []);
  assert.deepEqual(FIGHT.knockRound.round, true);
  assert.equal(knockRoundFor(FIGHT.knockRound, ''), true);
  assert.equal(knockRoundFor(FIGHT.knockRound, '?knock=v1'), false);
  assert.equal(knockRoundFor(undefined, ''), false);
  assert.throws(() => knockRoundFor({ round: 1 }, ''), /not a boolean/);
  const bad = JSON.parse(JSON.stringify(FIGHT)); bad.knockRound.extra = 1;
  assert.match(validateFile('fight', bad).join('\n'), /knockRound\.extra/);
});

test('shoveSteps: off is V1 (ceil), on is Math.round, a whole number is the same either way, under half a step is no shove', () => {
  assert.equal(KNOCK_ROUND, false, 'off until a driver sets it (a headless run)');
  // [knockback, off (V1), on]
  const table = [[0, 0, 0], [0.4, 1, 0], [0.8, 1, 1], [1.2, 2, 1], [1.6, 2, 2], [2.4, 3, 2], [3.2, 4, 3], [0.5, 1, 1], [3, 3, 3], [4, 4, 4], [14, 14, 14], [5.6, 6, 6]];
  for (const [kb, off, on] of table) { setKnockRound(false); assert.equal(shoveSteps(kb), off, `off ${kb}`); setKnockRound(true); assert.equal(shoveSteps(kb), on, `on ${kb}`); }
  // the floats the sim really produces: def.knockback x the off-band factor 0.4
  setKnockRound(false); assert.equal(shoveSteps(3 * 0.4), 2); assert.equal(shoveSteps(6 * 0.4), 3);
  setKnockRound(true); assert.equal(shoveSteps(3 * 0.4), 1); assert.equal(shoveSteps(6 * 0.4), 2);
});

// A hero at the origin and the veteran `gap` ahead, bands on (as the live game fights), the foe never defends. Returns how many 0.05 m steps the foe was shoved on the tick the blow landed.
const STEP_M = 0.05;
function shove(action, gap, on) {
  setKnockRound(on);
  let d = { tick: 0, fighters: [createFighter({ x: 0, z: 0, heading: 0, distance: 0 }, 'ready'), opponentFighter(OPPONENTS.veteran, { x: 0, z: gap, heading: Math.PI, distance: 0 }, 'ready')], finish: null, events: [], bands: true };
  for (let t = 0; t < 240; t++) {
    const z0 = d.fighters[1].body.z;
    d = stepDuel(d, [t === 0 ? { ...idleIntent(), action } : idleIntent(), idleIntent()]);
    const hit = d.events.find((e) => e.type === 'Hit' && e.target === 1);
    if (hit) return { steps: Math.round((d.fighters[1].body.z - z0) / STEP_M), glance: !!hit.glance, move: hit.move };
  }
  throw new Error(`${action} at ${gap} never landed`);
}

test('a glancing thrust (3 x 0.4 = 1.2) shoves ONE step with the flag, TWO without (V1)', () => {
  const off = shove('thrust', 1.3, false), on = shove('thrust', 1.3, true);
  assert.ok(off.glance && on.glance, 'an off-band thrust is a glancing blow');
  assert.equal(off.steps, 2); assert.equal(on.steps, 1);
});

test('a glancing kick (6 x 0.4 = 2.4) shoves TWO steps with the flag, THREE without', () => {
  const off = shove('kick', 1.3, false), on = shove('kick', 1.3, true);
  assert.ok(off.glance && on.glance);
  assert.equal(off.steps, 3); assert.equal(on.steps, 2);
});

test('a clean blow (whole knockback) shoves the same either way: the flag only touches fractions', () => {
  for (const [action, gap, steps] of [['thrust', 1.5, 3], ['light', 1.5, 4], ['heavy', 1.5, 4]]) {
    const off = shove(action, gap, false), on = shove(action, gap, true);
    assert.ok(!off.glance && !on.glance, `${action} at ${gap} is in the best band`);
    assert.equal(off.steps, steps); assert.equal(on.steps, steps);
  }
});

test('a glancing light or heavy (4 x 0.4 = 1.6) shoves 2 either way: round and ceil agree there, so those blows do not move', () => {
  for (const action of ['light', 'heavy']) { const off = shove(action, 1.3, false), on = shove(action, 1.3, true); assert.ok(off.glance); assert.equal(off.steps, 2); assert.equal(on.steps, 2); }
});
