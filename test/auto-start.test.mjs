// The fight starts by itself (src/auto-start.ts, data/fight.json start): no Fight press; ?start=v1 is V1's Fight button. The driver's
// draw press is the same sim input a tap on Fight made, so the sim is V1's and Gate 0 is untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { autoStartOn, startAction } from '../src/auto-start.ts';
import { canon, loadV3, startFight, tickState } from './gate0/harness.mjs';

const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));
// the page's fight (src/client/main.ts fresh()), as a Gate 0 config
const CONFIG = { id: 'page', flags: { playScaleFor: FIGHT.opponent, lateNotice: true, stab: true, stanceRows: true }, opponent: FIGHT.opponent, level: FIGHT.level,
  weapon: FIGHT.weapon, skill: FIGHT.skill, skill2: FIGHT.skill2, stance: FIGHT.stance, specials: FIGHT.specials, brain: FIGHT.ai };
const nextSeed = (s) => (Math.imul(s, 1664525) + 1013904223) >>> 0;   // main.ts rematch

test('on by default; ?start=v1 (anywhere in the query) is V1\'s Fight button', () => {
  assert.equal(FIGHT.start.auto, true);
  assert.equal(autoStartOn('', FIGHT.start.auto), true);
  assert.equal(autoStartOn('?cam=v1', FIGHT.start.auto), true);
  assert.equal(autoStartOn('?start=v1', FIGHT.start.auto), false);
  assert.equal(autoStartOn('?x=1&start=v1', FIGHT.start.auto), false);
  assert.equal(autoStartOn('', false), false);
});

test('the driver presses draw only for a sheathed hero with no press of his own, in a fight not over', () => {
  const sheathed = { phase: 'sheathed', finish: null };
  assert.equal(startAction(true, sheathed, null), 'light');
  assert.equal(startAction(false, sheathed, null), null);
  assert.equal(startAction(true, sheathed, 'heavy'), 'heavy');
  for (const phase of ['draw', 'ready', 'guard', 'attack', 'hurt', 'dead']) assert.equal(startAction(true, { phase, finish: null }, null), null, phase);
  assert.equal(startAction(true, { phase: 'sheathed', finish: { victim: 0 } }, null), null);
});

// Steps the page's fight with no press from the player for `ticks`, the driver's start rule on or off.
async function idle(on, seed = FIGHT.seed, ticks = 900) {
  const side = await loadV3(), q = side.record.quantizeIntent;
  let { practice, profile } = startFight(side, CONFIG, seed);
  const states = [];
  for (let i = 0; i < ticks && !practice.duel.finish; i++) {
    practice = side.combat.stepPractice(practice, q({ move: { x: 0, z: 0, yaw: 0, run: false }, action: startAction(on, practice, null), guard: false, lock: true }), profile);
    states.push(practice);
  }
  return states;
}
const foeActs = (states) => states.some((p) => p.events.some((e) => e.actor === 1 && (e.type === 'AttackStarted' || e.type === 'SpecialStarted')));

test('no press: the hero draws on the first tick, stands ready after V1\'s draw, and the opponent engages', async () => {
  const side = await loadV3(), states = await idle(true);
  assert.ok(states[0].events.some((e) => e.type === 'ActionStarted' && e.actor === 0 && e.action === 'draw'), 'the draw starts on tick 1');
  const ready = states.findIndex((p) => p.phase !== 'sheathed' && p.phase !== 'draw');
  assert.equal(ready + 1, side.moves.RULES.draw + 1, 'ready one tick after RULES.draw ticks of drawing');
  assert.ok(foeActs(states), 'the opponent attacks without a press from the player');
});

test('?start=v1: with no press the hero stays sheathed and the opponent waits, as V1', async () => {
  const states = await idle(false);
  assert.ok(states.every((p) => p.phase === 'sheathed'));
  assert.equal(foeActs(states), false);
});

test('the driver\'s draw is exactly a Fight tap on the first tick (same sim state every tick)', async () => {
  const side = await loadV3(), q = side.record.quantizeIntent, auto = await idle(true, FIGHT.seed, 300);
  let { practice, profile } = startFight(side, CONFIG, FIGHT.seed);
  for (let i = 0; i < auto.length; i++) {
    practice = side.combat.stepPractice(practice, q({ move: { x: 0, z: 0, yaw: 0, run: false }, action: i === 0 ? 'light' : null, guard: false, lock: true }), profile);
    assert.equal(canon(tickState(practice)), canon(tickState(auto[i])), `tick ${i + 1}`);
  }
});

test('a rematch (the next seed) starts by itself too', async () => {
  const states = await idle(true, nextSeed(FIGHT.seed), 120);
  assert.ok(states[0].events.some((e) => e.type === 'ActionStarted' && e.action === 'draw'));
});
