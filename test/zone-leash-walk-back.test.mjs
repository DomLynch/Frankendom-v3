// The boss leash walk-back (src/zone/walk-back.ts, data/respawn.json walkBack): past its leash a boss no longer resets to full health on the spot; it walks home at the row's speed,
// regenerating on the way, harmless and untouchable, and resets to full on arrival; the hero stepping into its aggro again (inside the leash) cancels the walk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OPPONENTS, opponentAt } from '../src/fight/moves.ts';
import { initialPractice, project, stepPractice } from '../src/fight/combat.ts';
import { idleIntent } from '../src/fight/duel.ts';
import { initialState, STEP } from '../src/fight/sim.ts';
import * as play from '../src/fight/play-radius.ts';
import { zoneFor } from '../src/zone/zone-rows.ts';
import { WORLD, leashed, poseAt, spotsFor, zoneDuel } from '../src/zone/spawns.ts';
import { WALK_BACK, arrived, holdBack, reaggro, validateWalkBack, walkBackFighter, walkBackOn } from '../src/zone/walk-back.ts';
import { validateFile } from '../src/sim/validate.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const FIGHT = JSON.parse(read('../data/fight.json')), ROWS = JSON.parse(read('../data/respawn.json')), ZONE = zoneFor('');
play.setPlayScale(WORLD.pitScale);
const body = opponentAt(OPPONENTS[FIGHT.opponent], FIGHT.level);
const [A] = spotsFor(ZONE).map((s) => ({ ...s, deadFor: null }));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const withFighters = (p, f) => project({ ...p.duel, fighters: f(p.duel.fighters) }, p.ai, p);
const base = () => { const p = initialPractice(7, body, FIGHT.weapon, FIGHT.skill); return project(zoneDuel(p.duel, poseAt({ x: A.x + 3, z: A.z + 1 }, A, play.OPEN_RADIUS, ROWS.spawn.minDistance, initialState())), p.ai, p); };
// the boss dragged past its leash, hurt to 30 %, the hero standing right beside it
const leashedAt = (hurt = 0.3) => {
  const at = { x: A.x, z: A.z + A.leash + 0.5 };
  return withFighters(base(), ([h, f]) => [{ ...h, body: { ...h.body, x: at.x + 1, z: at.z } }, { ...f, body: { ...f.body, ...at }, health: f.maxHealth * hurt }]);
};

test('the rows are validated data: the shipped walkBack passes, every out-of-range value throws, validate.js knows the keys', () => {
  validateWalkBack();
  for (const [key, bad] of [['speedMetresPerSecond', 0], ['speedMetresPerSecond', 99], ['regenPerSecond', -1], ['regenPerSecond', 2], ['arriveMetres', 0], ['arriveMetres', 5], ['arriveMetres', NaN]]) {
    assert.throws(() => validateWalkBack({ ...WALK_BACK, [key]: bad }), /respawn\.json walkBack/, `${key} ${bad}`);
  }
  assert.ok(walkBackOn('') && !walkBackOn('?leash=v1') && !walkBackOn('', { ...WALK_BACK, on: false }), '?leash=v1 and the row both turn it off');
  assert.deepEqual(validateFile('respawn', ROWS), [], 'validate.js accepts the new keys');
  assert.notDeepEqual(validateFile('respawn', { ...ROWS, walkBack: { ...ROWS.walkBack, stray: 1 } }), [], 'and rejects a stray one');
});

test('one tick: a step of speed x STEP towards the spot, never past it; health up by the row; ready and idle', () => {
  const p = leashedAt(), boss = p.duel.fighters[1];
  const w = walkBackFighter({ ...boss, phase: 'attack', move: 'heavy', age: 9 }, A, p.enemyMaxHealth);
  assert.ok(Math.abs(dist(w.body, boss.body) - WALK_BACK.speedMetresPerSecond * STEP) < 1e-9, 'one tick of the row speed');
  assert.ok(dist(w.body, A) < dist(boss.body, A), 'closer to the spot');
  assert.ok(Math.abs(w.health - boss.health - p.enemyMaxHealth * WALK_BACK.regenPerSecond * STEP) < 1e-9, 'regen is the row fraction of the maximum');
  assert.deepEqual([w.phase, w.move, w.age], ['ready', null, 0]);
  const near = walkBackFighter({ ...boss, body: { ...boss.body, x: A.x, z: A.z + 0.001 } }, A, p.enemyMaxHealth);
  assert.ok(Math.abs(near.body.z - A.z) < 1e-9, 'it stops on the spot, no overshoot');
  assert.equal(walkBackFighter({ ...boss, health: p.enemyMaxHealth }, A, p.enemyMaxHealth).health, p.enemyMaxHealth, 'health is capped at the maximum');
});

test('the walk itself, on the real sim: visible movement home over the time the row says, regenerating, nobody hurt, then full health on arrival', () => {
  let p = leashedAt();
  assert.equal(leashed(A, p.enemy), true);
  const gap0 = dist(A, p.enemy), heroHealth = p.playerHealth, h0 = p.health;
  let ticks = 0, lastGap = gap0, lastHealth = h0, rising = true, closing = true;
  while (!arrived(A, p.enemy) && ticks < 60 * 60) {
    const prior = p, stepped = stepPractice(prior, { ...idleIntent() });
    p = holdBack(prior, stepped, A);
    ticks++;
    const gap = dist(A, p.enemy);
    if (gap > lastGap) closing = false;
    if (p.health < lastHealth) rising = false;
    lastGap = gap; lastHealth = p.health;
    assert.equal(p.playerHealth, heroHealth, 'the walking boss hurts nobody');
  }
  assert.ok(closing && rising, 'it only ever gets closer and healthier');
  assert.ok(p.health > h0 && p.health < p.enemyMaxHealth, 'regenerated on the way, not yet full: the full reset waits for arrival');
  const expected = (gap0 - WALK_BACK.arriveMetres) / WALK_BACK.speedMetresPerSecond / STEP;
  assert.ok(ticks >= Math.floor(expected) - 1 && ticks <= Math.ceil(expected) + 1, `${ticks} ticks, about ${expected.toFixed(0)}: the walk takes gap / speed, not an instant`);
  assert.ok(ticks > 60, 'a visible walk, over a second');
});

test('the hero cannot hurt it while it walks: his blows are dropped, its health only goes up', () => {
  let p = withFighters(leashedAt(), ([h, f]) => [{ ...h, body: { ...h.body, x: f.body.x + 1, z: f.body.z } }, f]);
  const h0 = p.health;
  for (let i = 0; i < 120; i++) {
    const prior = p, stepped = stepPractice(prior, { ...idleIntent(), action: 'light' });
    p = holdBack(prior, stepped, A);
    assert.ok(p.health >= h0, 'never below where it began');
    assert.equal(p.duel.events.length, 0, 'no event survives the walk');
  }
});

test('re-aggro: only inside the leash and with the hero inside its aggro (from where the boss is now); outside the leash the walk goes on', () => {
  const inside = { x: A.x, z: A.z + A.leash - 1 }, outside = { x: A.x, z: A.z + A.leash + 1 };
  assert.equal(reaggro(A, inside, { x: inside.x + A.aggro - 0.1, z: inside.z }), true);
  assert.equal(reaggro(A, inside, { x: inside.x + A.aggro + 0.1, z: inside.z }), false, 'out of its aggro');
  assert.equal(reaggro(A, outside, { x: outside.x + 0.5, z: outside.z }), false, 'still past the leash: no re-aggro');
});
