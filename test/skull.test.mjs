// The Skull Crack ×0.75 (data/fight.json specialPace, src/fight/special-pace.ts): every motion tick of the player's SPECIAL 1 at 3/4,
// rounded; ?skull=v1 (no pace) is today's timing exactly; the Whirlwind and the opponent never change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialPractice, stepPractice, actorPose } from '../src/fight/combat.ts';
import { OPPONENTS, RULES, SKILL_ROWS, opponentAt, profileAt, specialOf } from '../src/fight/moves.ts';
import { distance } from '../src/fight/duel.ts';
import { quantizeIntent } from '../src/fight/record.ts';
import { playScaleFor, setLateNotice, setPlayScale } from '../src/fight/play-radius.ts';
import { setStab } from '../src/fight/stab-rule.ts';
import { setStanceRows } from '../src/fight/stance-era.ts';
import { SPECIAL_MELEE_WINDUP } from '../src/fight/sandbox-rules.ts';
import { SPECIAL_RECOVER, specialStage } from '../src/fight/special-look.ts';
import { setSpecialPace, specialPaceFor } from '../src/fight/special-pace.ts';

const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));
// Re-pinned 2026-10-26 (fix-forward, Dom's Pitborn call): the HERO's Skull Crack ticks, scripted against the Centurion they were written on
// (data/fight.json opponentV1, still the page's fight under ?pitborn=v1). The Pitborn (the default since) whips the scripted windup and hits
// through it, so the script never reaches the strike; the pace under test is the hero's and the same for both.
const FOE = FIGHT.opponentV1.opponent;
const opponent = OPPONENTS[FOE], profile = profileAt(opponent, FIGHT.level);

// The page fight as src/client/main.ts starts it, under the pace `search` picks.
function fight(search) {
  setPlayScale(playScaleFor(FOE, Infinity)); setLateNotice(true); setStab(true); setStanceRows(true);
  setSpecialPace(specialPaceFor(FIGHT.specialPace, search));
  const aiSkill = Object.values(SKILL_ROWS).find((r) => r.opponent === FOE)?.id ?? null, name = specialOf(FOE, FIGHT.level);
  return initialPractice(FIGHT.seed, opponentAt(opponent, FIGHT.level), FIGHT.weapon, FIGHT.skill,
    { level: FIGHT.level, aiSkill, ...(name ? { name } : {}) }, undefined, FIGHT.stance, undefined, undefined, undefined, undefined, undefined, FIGHT.skill2);
}
// Draw, walk in, press `action` once in reach and stand: the hero's state and pose every tick, and the tick of the press.
function run(search, action, ticks = 900) {
  let p = fight(search), fired = -1;
  const trace = [];
  for (let t = 0; t < ticks; t++) {
    const h = p.duel.fighters[0], gap = distance(h.body, p.duel.fighters[1].body);
    const ready = h.phase === 'ready' && (action === 'skill' ? h.skillCooldown : h.skillCooldown2 ?? 0) === 0;
    const press = t === 2 ? 'light' : fired < 0 && t > 60 && ready && gap < 2 ? action : null;
    if (press === action) fired = t;
    p = stepPractice(p, quantizeIntent({ move: { x: 0, z: fired < 0 && gap > 1.6 ? 1 : 0, yaw: 0, run: false }, action: press, guard: false, lock: true }), profile);
    // the hero's own events: since Dom's Pitborn call (2026-10-26) the opponent has specials of his own (Butcher's Cleave, Earth Fold), whose SpecialLanded is not the hero's
    trace.push({ f: structuredClone(p.duel.fighters), events: p.events.filter((e) => e.actor === 0).map((e) => e.type), pose: actorPose(p, 0), stage: specialStage(p.duel.fighters[0]) });
  }
  setSpecialPace(null);
  assert.ok(fired > 0, `the hero pressed ${action}`);
  return { trace, fired };
}

test('the data row: the Skull Crack (cleave) at 0.75; ?skull=v1 = no pace (today\'s timing)', () => {
  assert.equal(FIGHT.skill, 'cleave');
  assert.deepEqual(specialPaceFor(FIGHT.specialPace, ''), { skill: 'cleave', scale: 0.75 });
  assert.equal(specialPaceFor(FIGHT.specialPace, '?skull=v1'), null);
  assert.equal(specialPaceFor(FIGHT.specialPace, '?cam=v1&skull=v1'), null);
  assert.throws(() => specialPaceFor({ skill: 'cleave', scale: 1.5 }), /not in/);
});

for (const [label, search, scale] of [['default (×0.75)', '', 0.75], ['?skull=v1', '?skull=v1', 1]]) {
  test(`Skull Crack ticks, ${label}`, () => {
    const pace = (n) => Math.round(n * scale);
    const { trace, fired } = run(search, 'skill');
    const press = trace[fired];
    assert.ok(press.events.includes('SpecialStarted'));
    assert.equal(press.f[0].special, pace(SPECIAL_MELEE_WINDUP) - 1, 'committed windup (the cast tick counts)');
    assert.equal(SPECIAL_MELEE_WINDUP, 32); assert.equal(RULES.special.recovery, 45); assert.equal(SPECIAL_RECOVER, 45);
    const land = trace.findIndex((s, t) => t > fired && s.events.includes('SpecialLanded'));
    assert.ok(land > fired, 'the Skull Crack lands');
    assert.equal(trace[land].f[0].specialRecover, pace(RULES.special.recovery), 'no-attack recovery after the strike');
    // the clip: the raise is read over 120 ticks, or 90 paced, so it covers the same span (32/120 = 24/90) 4/3 faster; the return runs
    // over the paced ticks to its end
    const c = press.pose.contact;
    assert.equal(pace(SPECIAL_MELEE_WINDUP) / pace(RULES.special.windup), SPECIAL_MELEE_WINDUP / RULES.special.windup);
    assert.ok(Math.abs(press.pose.progress - c * (1 - (pace(SPECIAL_MELEE_WINDUP) - 1) / pace(RULES.special.windup))) < 1e-9, 'the raise is read at its pace');
    const recover = trace.slice(land).findIndex((s) => s.stage === null);
    assert.equal(recover, pace(SPECIAL_RECOVER), 'the clip\'s return lasts the paced ticks');
    assert.ok(trace[land + recover - 1].pose.progress > 1 - 1 / pace(SPECIAL_RECOVER) - 1e-9, 'the clip reaches its end, not cut');
  });
}

test('the default fight\'s Skull Crack is 25% shorter: 32 + 45 = 77 ticks to 24 + 34 = 58', () => {
  assert.equal(Math.round(SPECIAL_MELEE_WINDUP * .75) + Math.round(RULES.special.recovery * .75), 58);
  assert.equal(SPECIAL_MELEE_WINDUP + RULES.special.recovery, 77);
});

test('the Whirlwind (SPECIAL 2) and the opponent step the same ticks with or without the pace', () => {
  const paced = run('', 'skill2'), v1 = run('?skull=v1', 'skill2');
  assert.equal(paced.fired, v1.fired);
  assert.deepEqual(paced.trace, v1.trace);
});
