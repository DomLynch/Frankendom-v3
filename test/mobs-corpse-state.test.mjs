// Trash mobs read PR #252's cut state (src/fight/cut-strike.ts corpseCutState): a corpse is protected exactly while it has units left to cut and released when it has none or is gone; the time rows are the
// fallback (the grace after a kill always; holdSeconds only if the cut state cannot be read).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOBS } from '../src/zone/mobs.ts';
import { createMobsRun } from '../src/mobs-run.ts';
import { registerCorpseSource, corpseCutState } from '../src/fight/cut-strike.ts';
import { OPPONENTS, opponentAt } from '../src/fight/moves.ts';
import { initialPractice } from '../src/fight/combat.ts';

const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8')), ZONE = JSON.parse(readFileSync(new URL('../data/zones/zone1.row.json', import.meta.url), 'utf8'));
const TICK = 1 / 60, C = MOBS.corpse;
const p0 = initialPractice(7, opponentAt(OPPONENTS[FIGHT.opponent], FIGHT.level), FIGHT.weapon, FIGHT.skill);
const at = (x, z) => ({ ...p0, duel: { ...p0.duel, fighters: [{ ...p0.duel.fighters[0], body: { ...p0.duel.fighters[0].body, x, z } }, p0.duel.fighters[1]] } });
const make = (cutState) => {
  const run = createMobsRun({ zone: ZONE, origin: { x: 0, z: 0 }, bosses: () => [], suppress: () => false, coins: () => {}, rangeMetres: 30, ...(cutState ? { cutState } : {}) });
  run.core.rows.spawnMinMetres = 0;
  for (const ring of Object.values(run.core.rows.rings)) ring.density = 0;
  return run;
};
const step = (run, practice, secs) => { for (let i = 0; i < secs / TICK; i++) run.tick(practice, practice.duel.fighters[0], TICK); };

test('a corpse with units left (no kill seen: a kept corpse) protects the hero cutting it and the ground round it; with none left it is released at once', () => {
  const corpse = { x: 70, z: 0, remainingUnits: 6 };
  const run = make(() => (corpse.remainingUnits > 0 ? [corpse] : []));
  run.core.spawnPackAt(70, 0, 'goblin', 6);
  step(run, at(70 + C.nearMetres + 25, 0), 1);   // hero in range of the pack but far from the corpse: the pad (corpse + nearMetres + padMetres) keeps the pack from coming in at the corpse
  assert.equal(run.core.count, 0, 'nobody spawns inside the corpse pad');
  run.core.spawnPackAt(120, 0, 'goblin', 6);
  step(run, at(120 - 10, 0), 6);
  assert.ok(run.core.count > 0, 'a pack outside every pad comes in');
  run.core.takeHeroDamage();
  const cutting = at(70 + C.nearMetres - 1, 0);
  run.core.reset(); run.core.spawnPackAt(70, 0, 'goblin', 6);   // (the other pack is far; this one sits in the corpse's own pad)
  step(run, cutting, 5);
  assert.equal(run.core.takeHeroDamage(), 0, 'nobody hits the hero standing at a corpse that still has units to cut');
  assert.equal(run.core.alive, 0, 'the live mobs went home');
  corpse.remainingUnits = 0;
  run.core.reset(); run.core.spawnPackAt(70, 0, 'goblin', 6);
  step(run, at(70 - 3, 0), 3);
  assert.ok(run.core.count > 0, 'cut to the last unit: the pad is gone and the pack comes in at once');
});

test('a corpse that is gone releases its pad; the time rows are the fallback only', () => {
  let list = [{ x: 70, z: 0, remainingUnits: 2 }];
  const run = make(() => list);
  run.core.spawnPackAt(70, 0, 'goblin', 4);
  step(run, at(70 + C.nearMetres + 20, 0), 1);
  assert.equal(run.core.count, 0);
  list = [];
  step(run, at(70 + C.nearMetres + 20, 0), 1);
  assert.ok(run.core.count > 0, 'the corpse is gone: its ground is free again');
  // the cut state cannot be read: holdSeconds is the fallback
  const broken = make(() => { throw new Error('no provider'); });
  const kill = { ...at(50, 0), enemy: { ...p0.enemy, x: 52, z: 0 }, finish: { victim: 1, location: 'torso', move: 'light_right', heading: 0 } };
  step(broken, kill, 0.1);
  assert.equal(broken.corpses.length, 1);
  step(broken, at(50, 0), C.graceSeconds + 1);
  assert.equal(broken.corpses.length, 1, 'without the cut state the time row still holds the corpse');
  step(broken, at(50, 0), C.holdSeconds);
  assert.equal(broken.corpses.length, 0);
  // with it, a time corpse only covers the grace
  const state = make(() => []);
  step(state, kill, 0.1);
  step(state, at(50, 0), C.graceSeconds + 1);
  assert.equal(state.corpses.length, 0, 'with the cut state the time corpse ends with the grace');
});

test('the default is #252\'s own registry: a ragdoll\'s corpse source is what the pad follows', () => {
  const row = { x: 70, z: 0, remainingUnits: 3 };
  const off = registerCorpseSource((push) => { if (row.remainingUnits > 0) push(row.x, row.z, row.remainingUnits); });
  try {
    assert.deepEqual(corpseCutState().map((c) => [c.x, c.z, c.remainingUnits]), [[70, 0, 3]]);
    const run = make();
    run.core.spawnPackAt(70, 0, 'goblin', 4);
    step(run, at(70 + C.nearMetres + 20, 0), 1);
    assert.equal(run.core.count, 0, 'the registered corpse protects its ground');
    row.remainingUnits = 0;
    step(run, at(70 + C.nearMetres + 20, 0), 1);
    assert.ok(run.core.count > 0, 'fully cut: released');
  } finally { off(); }
});
