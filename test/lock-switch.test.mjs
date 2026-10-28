// Tap-to-switch the soft lock (src/fight/lock-switch.ts, data/respawn.json lockSwitch): the rows, the flags, tap vs drag, the pick by screen distance, the swap of the held fight, and the page wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OPPONENTS, opponentAt } from '../src/fight/moves.ts';
import { initialPractice } from '../src/fight/combat.ts';
import { joinAttacker } from '../src/fight/attacker-bout.ts';
import { isTap, lockSwitchFor, pickTarget, swapHeld, validateLockSwitch } from '../src/fight/lock-switch.ts';
import { validateFile } from '../src/sim/validate.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ROWS = JSON.parse(read('../data/respawn.json')), R = ROWS.lockSwitch, LIM = ROWS.limits.lockSwitch;
const FIGHT = JSON.parse(read('../data/fight.json')), foe = OPPONENTS[FIGHT.opponent], body = opponentAt(foe, FIGHT.level);
const hero0 = { x: 0, z: 2 };
const fight = (seed, spot) => initialPractice(seed, body, FIGHT.weapon, FIGHT.skill, undefined, undefined, undefined, { hero: hero0, foe: spot, heroFacing: Math.atan2(spot.x - hero0.x, spot.z - hero0.z) });
const press = (x, y, t, id = 1) => ({ x, y, t, id });

test('the row is pinned, the schema knows it, bad rows are refused', () => {
  assert.deepEqual({ ...R, about: undefined }, { about: undefined, on: true, query: 'lockswitch', off: 'v1', tapMaxMs: 300, tapMaxMovePx: 12, pickRadiusPx: 64, aimHeightMetres: 1.3 });
  assert.deepEqual(validateFile('respawn', ROWS), []);
  assert.ok(validateFile('respawn', { ...ROWS, lockSwitch: { ...R, extra: 1 } }).length > 0);
  for (const k of Object.keys(LIM)) for (const v of [NaN, LIM[k][1] + 1, LIM[k][0] - 1]) assert.throws(() => validateLockSwitch({ ...R, [k]: v }, LIM), new RegExp(k), `${k}=${v}`);
  assert.throws(() => validateLockSwitch({ ...R, on: 'yes' }, LIM), /true or false/);
});

test('flags: ?lockswitch=v1, no soft lock (?lock=v1, ?freecam=v1, no zone) and on:false switch nothing', () => {
  assert.ok(lockSwitchFor(true, ''));
  assert.equal(lockSwitchFor(true, '?lockswitch=v1'), null);
  assert.equal(lockSwitchFor(false, ''), null, 'the soft lock is off (LOCK_ROWS null): no switching');
  assert.equal(lockSwitchFor(true, '', { lockSwitch: { ...R, on: false }, limits: ROWS.limits }), null);
  assert.ok(lockSwitchFor(true, '?look=off'), '?look=off does not touch the switch');
});

test('tap vs drag: a short press that stays put is a tap; a drag, a hold and another finger are not', () => {
  assert.equal(isTap(R, press(100, 100, 0), press(103, 104, 120)), true);
  assert.equal(isTap(R, press(100, 100, 0), press(100, 100, R.tapMaxMs)), true, 'exactly the limit');
  assert.equal(isTap(R, press(100, 100, 0), press(100, 100, R.tapMaxMs + 1)), false, 'a hold');
  assert.equal(isTap(R, press(100, 100, 0), press(100 + R.tapMaxMovePx + 1, 100, 100)), false, 'a look drag');
  assert.equal(isTap(R, press(100, 100, 0, 1), press(100, 100, 50, 2)), false, 'a different pointer');
  assert.equal(isTap(R, null, press(100, 100, 50)), false, 'a lift with no press');
});

test('the pick: nearest boss within the radius, never the held one, none on empty ground', () => {
  const c = [{ index: 0, x: 200, y: 300 }, { index: 1, x: 120, y: 300 }, { index: 2, x: 140, y: 310 }];
  assert.equal(pickTarget(R, { x: 125, y: 300 }, c, 0), 1);
  assert.equal(pickTarget(R, { x: 138, y: 308 }, c, 0), 2, 'the nearer of two');
  assert.equal(pickTarget(R, { x: 200, y: 300 }, c, 0), 2, 'the held boss is not a target: the next nearest within the radius, or none');
  assert.equal(pickTarget(R, { x: 200, y: 300 }, [c[0]], 0), null);
  assert.equal(pickTarget(R, { x: 125 + R.pickRadiusPx + 1, y: 300 + 200 }, c, 0), null, 'empty ground');
  assert.equal(pickTarget(R, { x: 120, y: 300 + R.pickRadiusPx }, c, 0), 1, 'exactly the radius');
  assert.equal(pickTarget(R, { x: 120, y: 300 }, [{ index: 1, x: NaN, y: 300 }], 0), null, 'behind the camera');
  assert.equal(pickTarget(R, { x: 120, y: 300 }, [], 0), null);
});

test('the swap: the tapped boss\'s fight becomes the held one, the old held fight becomes an attacker; health and the hero carry on', () => {
  const a = fight(7, { x: 0, z: -1.25 }), b = fight(99, { x: 3, z: 1 });
  const hurtB = { ...b, health: 40, duel: { ...b.duel, fighters: [b.duel.fighters[0], { ...b.duel.fighters[1], health: 40 }] } };
  const heroNow = { ...a.duel.fighters[0], health: 55 }, held = { ...a, playerHealth: 55, duel: { ...a.duel, fighters: [heroNow, a.duel.fighters[1]] } };
  const list = [joinAttacker(1, hurtB), joinAttacker(2, fight(5, { x: -3, z: 1 }))];
  const out = swapHeld(held, list, 0, 1, undefined);
  assert.equal(out.index, 1);
  assert.equal(out.practice.duel.fighters[1].health, 40, 'the tapped boss keeps its own health');
  assert.equal(out.practice.playerHealth, 55, 'the hero\'s health is not reset');
  assert.equal(out.practice.duel.fighters[0].health, 55);
  assert.equal(out.list.length, 2);
  assert.equal(out.list[0].index, 0, 'the old held boss takes the tapped one\'s place');
  assert.equal(out.list[0].practice, held, 'its fight is untouched');
  assert.equal(out.list[1].index, 2);
  const back = swapHeld(out.practice, out.list, 1, 0, undefined);
  assert.equal(back.index, 0);
  assert.equal(back.practice.duel.fighters[1].health, held.duel.fighters[1].health, 'switching back restores the first boss\'s fight');
});

test('the swap refuses: a dead attacker, an unknown boss, the held boss, a finished fight', () => {
  const a = fight(7, { x: 0, z: -1.25 }), b = fight(99, { x: 3, z: 1 });
  assert.equal(swapHeld(a, [{ ...joinAttacker(1, b), dead: true }], 0, 1), null);
  assert.equal(swapHeld(a, [joinAttacker(1, b)], 0, 2), null);
  assert.equal(swapHeld(a, [joinAttacker(1, b)], 0, 0), null);
  assert.equal(swapHeld({ ...a, finish: { victim: 1 } }, [joinAttacker(1, b)], 0, 1), null);
});

test('the page wiring is pinned: gated by the soft lock and the attackers, its own press listener, only a locked live fight, no look/cut listener touched', () => {
  const main = read('../src/client/main.ts');
  assert.match(main, /const SWITCH = LOCK_ROWS && multi \? lockSwitchFor\(true, search\) : null/);
  assert.match(main, /if \(paused\(\) \|\| !engaged \|\| lockState\.broken \|\| practice\.finish \|\| !isTap\(SWITCH,/);
  assert.match(main, /swapHeld\(practice, attackers, current, pick, kindAt\(current\)\.ai\)/);
  assert.match(main, /useKind\(kindAt\(current\)\)/);
  assert.equal(/switchTarget/.test(read('../src/fight/lock-break.ts')), false, 'the hook is replaced');
});
