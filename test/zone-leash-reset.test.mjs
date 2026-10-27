// A leash resets ONLY that boss (MMO style): the hero's health, the other attackers and their fights are untouched, and the hero is never fresh()ed. The pure part is
// src/fight/attacker-bout.ts resetHeld; main.ts leashReset calls it. Spot coordinates are read from the zone row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OPPONENTS, opponentAt } from '../src/fight/moves.ts';
import { initialPractice, project } from '../src/fight/combat.ts';
import { initialState } from '../src/fight/sim.ts';
import * as play from '../src/fight/play-radius.ts';
import { joinAttacker, resetHeld } from '../src/fight/attacker-bout.ts';
import { zoneFor } from '../src/zone/zone-rows.ts';
import { WORLD, leashed, poseAt, spotsFor, zoneDuel } from '../src/zone/spawns.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const FIGHT = JSON.parse(read('../data/fight.json')), ROWS = JSON.parse(read('../data/respawn.json')), ZONE = zoneFor('');
play.setPlayScale(WORLD.pitScale);
const body = opponentAt(OPPONENTS[FIGHT.opponent], FIGHT.level);
const base = (pose) => { const p = initialPractice(7, body, FIGHT.weapon, FIGHT.skill); return project(zoneDuel(p.duel, pose), p.ai, p); };
const poseOf = (hero, spot) => poseAt(hero, spot, play.OPEN_RADIUS, ROWS.spawn.minDistance, initialState());
const withFighters = (p, f) => project({ ...p.duel, fighters: f(p.duel.fighters) }, p.ai, p);

test('kite A past its leash while B is on the hero: the hero\'s health and body and B\'s fight are untouched, A is released; alone, the hero is still not reset', () => {
  const [A, B] = spotsFor(ZONE), hero = { x: A.x + 3, z: A.z + 1 };
  const hurtHero = (p) => withFighters(p, ([h, f]) => [{ ...h, health: 60 }, f]);
  const primary = withFighters(hurtHero(base(poseOf(hero, A))), ([h, f]) => [h, { ...f, body: { ...f.body, x: A.x, z: A.z + A.leash + 0.5 }, health: 30 }]);
  assert.equal(leashed(A, primary.enemy), true, 'A was dragged past its leash from its own spot');
  assert.equal(primary.playerHealth, 60);
  const onB = joinAttacker(1, hurtHero(base(poseOf(hero, B))));
  const out = resetHeld(primary, [onB], 0, () => { throw new Error('B is on him: nothing is rebuilt'); });
  assert.equal(out.practice.playerHealth, 60, 'the hero\'s health is the same');
  assert.deepEqual(out.practice.duel.fighters[0], primary.duel.fighters[0], 'and so is the hero, whole');
  assert.deepEqual([out.index, out.engaged, out.list.length], [1, true, 0], 'B\'s fight is now the held one');
  assert.deepEqual(out.practice.duel.fighters[1], onB.practice.duel.fighters[1], 'B is as it was');
  const alone = resetHeld(primary, [], 0, () => base(poseOf(hero, A)));
  assert.equal(alone.practice.playerHealth, 60);
  assert.deepEqual(alone.practice.duel.fighters[0], primary.duel.fighters[0]);
  assert.deepEqual([alone.index, alone.engaged], [0, false]);
  assert.deepEqual([alone.practice.enemy.x, alone.practice.enemy.z], [A.x, A.z], 'A is back at its spot');
  assert.equal(alone.practice.duel.fighters[1].health, alone.practice.duel.fighters[1].maxHealth, 'at full health');
  const killed = joinAttacker(1, withFighters(base(poseOf(hero, B)), ([h, f]) => [h, { ...f, health: 0 }]));
  assert.equal(resetHeld(primary, [{ ...killed, dead: true }], 0, () => base(poseOf(hero, A))).engaged, false, 'a dead attacker does not take the fight');
});

test('the page: a leash calls leashReset (only that boss), never hand / rematch / fresh', () => {
  const main = read('../src/client/main.ts');
  assert.match(main, /leashed\(spawns\[current\]!, practice\.enemy, openerLift\)\) \{ if \(walkBackEnabled && !attackers\.some\(\(a\) => !a\.dead\)\) \{ walkBack = true; engaged = false; \} else leashReset\(current, hero\); \}/);   // alone it walks home first (test/zone-leash-walk-back.test.mjs); the reset itself is unchanged
  const fn = main.slice(main.indexOf('function leashReset'), main.indexOf('/** The opening pose of attacker'));
  assert.doesNotMatch(fn, /fresh\(|rematch\(|\bhand\(/);
  assert.match(fn, /resetHeld\(practice, attackers, index,/);
});
