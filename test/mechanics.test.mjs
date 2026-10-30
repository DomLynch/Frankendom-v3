// BOSS SIGNATURE MECHANICS (data/mechanics.json, src/fight/mechanics/; Dom 2026-10-28: each boss its own fighting identity). Nan the Impaler: IMPALE AND DRAG. The rows validate, every row has a maker and a boss that
// names it, and the move plays through the real sim (stepPractice with the mechanic's layer): the hold, the frozen line, the lunge, the hook and the poke; a roll out of the line dodges it; a hit on her in the hold, a dead
// boss, a dead hero and a new duel all stop it cleanly; the cooldown is a row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stepPractice } from '../src/fight/combat.ts';
import { distance, idleIntent } from '../src/fight/duel.ts';
import { RULES } from '../src/fight/moves.ts';
import { kindFightFor, kindPractice } from '../src/fight/spawn-kind.ts';
import { createNanImpale } from '../src/fight/mechanics/nan-impale.ts';
import { MECHANICS, createMechanics } from '../src/fight/mechanics/index.ts';
import { validateMechanics, validateFile } from '../src/sim/validate.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const FIGHT = read('fight'), PROFILES = read('profiles'), DIFF = read('difficulty'), BRAINS = read('brains'), MECH = read('mechanics'), RINGS = read('rings');
const ROW = MECH.mechanics['nan-impale'];
const ctx = { profiles: PROFILES.profiles, difficulty: DIFF, brains: BRAINS.brains, pick: DIFF.default, search: '', level: FIGHT.level, ai: FIGHT.ai, override: null, weapon: FIGHT.weapon, skill: FIGHT.skill, skill2: FIGHT.skill2, stance: FIGHT.stance, specials: FIGHT.specials };
const NAN = kindFightFor('sporty-granny', ctx);

/** A fight against Nan with the hero `gap` metres from her; `fast` shortens the opening delay so a test does not wait five seconds of the boss's own AI for the trigger. Steps like the page does: layer, then settle. */
function fight(gap, { fast = true, row = ROW } = {}) {
  let practice = kindPractice(NAN, ctx, 731, { hero: { x: 0, z: gap }, foe: { x: 0, z: 0 }, heroFacing: Math.PI });
  const mech = createNanImpale({ ...row, ...(fast ? { firstTicks: 10 } : {}) });
  const stages = [], log = [];
  const step = (hero = idleIntent()) => {
    const it = practice.duel.fighters[0].phase === 'sheathed' && !hero.action ? { ...hero, action: 'light' } : hero;   // the first press draws
    const prior = practice;
    practice = stepPractice(prior, it, NAN.ai, mech.layer);
    const moved = mech.settle(prior.duel, practice.duel);
    if (moved !== practice.duel) practice = { ...practice, duel: moved, fighter: moved.fighters[0].body, enemy: moved.fighters[1].body };
    const v = mech.view(), st = v ? v.stage : 'idle', tick = practice.duel.tick;
    if (stages.at(-1)?.[1] !== st) stages.push([tick, st]);
    for (const e of practice.duel.events) if (e.actor === 1 && ['Hit', 'GuardBroken', 'Dodged', 'Blocked', 'AttackMissed', 'Charged'].includes(e.type)) log.push([tick, e.type, e.move, e.damage]);
    return v;
  };
  return { mech, stages, log, step, get practice() { return practice; }, set practice(p) { practice = p; } };
}

test('the rows validate; every row has a maker; the boss that names a mechanic is the row\'s boss', () => {
  assert.deepEqual(validateFile('mechanics', MECH), []);
  assert.deepEqual(validateMechanics(MECH, PROFILES.profiles.map((p) => p.id)), []);
  for (const [id, row] of Object.entries(MECH.mechanics)) assert.ok(MECHANICS[row.type], `${id}: code for type ${row.type}`);
  for (const b of RINGS.bosses) {
    if (b.mechanic === null) continue;
    assert.ok(MECH.mechanics[b.mechanic], `${b.kind}: mechanic ${b.mechanic} has a data/mechanics.json row`);
    assert.equal(MECH.mechanics[b.mechanic].boss, b.kind, `${b.mechanic} belongs to ${b.kind}`);
  }
  const reg = createMechanics();
  assert.equal(reg.of('sporty-granny').boss, 'sporty-granny');
  assert.equal(typeof reg.of('sporty-granny').layer, 'function', 'Nan\'s move rewrites her intent');
  assert.equal(reg.of('pumpkinhulk').layer, undefined, 'a boss whose move does not shape his intent has no layer');
  assert.ok(ROW.parkTicks < RULES.charge.max, 'the hold ends by the player\'s release, not the engine\'s maximum');
});

test('the validator names a bad row', () => {
  for (const [key, bad] of [['gapMax', 1], ['parkTicks', 60], ['lungeSpeed', 5], ['move', 'light'], ['lineColour', 'red'], ['extra', 1], ['freezeTicks', 40]]) {
    const rows = clone(MECH); rows.mechanics['nan-impale'][key] = bad;
    assert.ok(validateMechanics(rows).length > 0, `${key}=${bad} is refused`);
  }
  const unknown = clone(MECH); unknown.mechanics['made-up'] = { type: 'spin', about: 'x', boss: 'pumpkinhulk' };
  assert.match(validateMechanics(unknown).join('\n'), /made-up\.type: one of/);
  assert.match(validateMechanics(MECH, ['other']).join('\n'), /no data\/profiles\.json row "sporty-granny"/);
});

test('stood still at 4 m: the hold, the frozen line, the lunge, the hook, the pull, the poke, then the cooldown', () => {
  const f = fight(4);
  let lockedAt = null, pulledGap = null;
  for (let t = 0; t < 700; t++) {
    const v = f.step(); if (v?.stage === 'tell' && v.lock && lockedAt === null) lockedAt = f.practice.duel.tick;
    if (v?.stage === 'follow' && pulledGap === null) pulledGap = distance(f.practice.duel.fighters[0].body, f.practice.duel.fighters[1].body);   // measured when the pull ends: a second cycle may already be backing her off by the end of the run
  }
  const names = f.stages.map((s) => s[1]);
  assert.deepEqual(names.slice(0, 6), ['idle', 'tell', 'lunge', 'drag', 'follow', 'idle'], JSON.stringify(f.stages));
  const at = (n) => f.stages.find((s) => s[1] === n)[0];
  assert.ok(at('lunge') - at('tell') >= ROW.parkTicks, 'the tell is the hold: at least parkTicks of it before the lunge');
  assert.ok(lockedAt !== null && at('lunge') - lockedAt >= ROW.freezeTicks - 2, 'the line froze at least freezeTicks before the lunge (the roll window)');
  assert.ok(f.log.some((e) => e[1] === 'Charged' && e[2] === 'heavy_thrust'), 'the held stab is the engine\'s own charged blow');
  const hit = f.log.find((e) => e[1] === 'Hit' && e[2] === 'heavy_thrust');
  assert.ok(hit && hit[3] > 0, 'it landed through the sim\'s own hit row');
  const poke = f.log.find((e) => (e[1] === 'Hit' || e[1] === 'Blocked') && e[2] === 'thrust');
  assert.ok(poke && poke[0] > hit[0], 'the follow-up poke came after the hook');
  assert.ok(pulledGap !== null && pulledGap < ROW.stopGap + 0.5, `he was pulled in to her point (gap ${pulledGap})`);
  assert.ok(f.practice.duel.fighters[0].health > 0, 'no instant kill');
  const second = f.stages.filter((s) => s[1] === 'tell');
  if (second.length > 1) assert.ok(second[1][0] - at('lunge') >= ROW.cooldownTicks - 120, 'the cooldown row spaces the next one');
});

test('a roll out of the frozen line dodges the lunge: no hook, no pull', () => {
  for (const side of [1, -1]) {
    const f = fight(4);
    let rolled = false;
    for (let t = 0; t < 400; t++) {
      const v = f.mech.view(), it = idleIntent();
      if (v?.stage === 'tell' && v.lock && !rolled) { rolled = true; f.step({ ...it, move: { x: side, z: 0, yaw: 0, run: false }, action: 'dodge' }); } else f.step(it);
    }
    assert.ok(rolled, 'the line froze');
    assert.ok(!f.stages.some((s) => s[1] === 'drag'), `no hook (side ${side})`);
    assert.ok(f.log.some((e) => e[1] === 'AttackMissed' && e[2] === 'heavy_thrust'), 'the stab met empty air');
    assert.ok(!f.log.some((e) => e[1] === 'Hit' && e[2] === 'heavy_thrust'));
  }
});

test('a spear wants room: started close, she backs off to backTo while the aim follows, then lunges; inside gapMin it does not start', () => {
  const f = fight(1.4);
  let widest = 0;
  for (let t = 0; t < 200; t++) { f.step(); if (f.mech.view()?.stage === 'tell') widest = Math.max(widest, distance(f.practice.duel.fighters[0].body, f.practice.duel.fighters[1].body)); }
  assert.ok(f.stages.some((s) => s[1] === 'lunge'), JSON.stringify(f.stages));
  assert.ok(widest > ROW.backTo - 0.35 && widest <= ROW.backTo + 0.05, `she backed to about backTo (${widest.toFixed(2)})`);
  const w = idleIntent(), d0 = fight(2).practice.duel, d = { ...d0, fighters: [{ ...d0.fighters[0], body: { ...d0.fighters[0].body, z: d0.fighters[1].body.z + ROW.gapMin - 0.1 } }, d0.fighters[1]] };
  assert.equal(createNanImpale({ ...ROW, firstTicks: 0 }).layer(d, w), w, 'inside gapMin the layer leaves the warden alone');
});

test('a hit on her in the hold cancels it (shorter cooldown), and a dead boss, a dead hero or a new duel stop it cleanly', () => {
  const hold = (n) => { const f = fight(4); for (let t = 0; t < 400 && !(f.mech.view()?.stage === 'tell' && f.practice.duel.fighters[1].charge >= n); t++) f.step(); assert.equal(f.mech.view()?.stage, 'tell'); return f; };
  const hurt = hold(8);
  const d = hurt.practice.duel, foe = { ...d.fighters[1], phase: 'hurt' };
  hurt.practice = { ...hurt.practice, duel: { ...d, fighters: [d.fighters[0], foe] } };
  hurt.step();
  assert.equal(hurt.mech.view(), null, 'staggered in the hold: cancelled');
  const dead = hold(8), dd = dead.practice.duel;
  dead.practice = { ...dead.practice, duel: { ...dd, fighters: [dd.fighters[0], { ...dd.fighters[1], phase: 'dead', health: 0 }] } };
  const w = idleIntent();
  assert.equal(dead.mech.layer(dead.practice.duel, w), w, 'a fallen boss: the warden\'s own intent, untouched');
  assert.equal(dead.mech.view(), null);
  const gone = hold(8), dg = gone.practice.duel;
  assert.equal(gone.mech.layer({ ...dg, fighters: [{ ...dg.fighters[0], health: 0, phase: 'dead' }, dg.fighters[1]] }, w), w, 'a dead hero');
  const fresh = hold(8);
  fresh.mech.layer({ ...fresh.practice.duel, tick: 0 }, w);   // the clock ran backwards: a new duel
  assert.equal(fresh.mech.view(), null, 'a new duel starts the mechanic over');
});

test('it does not touch a fight without it, and the layer returns the warden\'s own intent when idle', () => {
  const f = fight(4, { fast: false });
  const w = idleIntent();
  assert.equal(f.mech.layer(f.practice.duel, w), w, 'before the opening delay: the same object');
  assert.equal(f.mech.settle(f.practice.duel, f.practice.duel), f.practice.duel, 'nothing moved: the same duel');
});
