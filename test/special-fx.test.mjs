// The hero's Skull Crack and Whirlwind throw a lighter contact kit (data/fight.json specialFx, src/fight/hero-special-fx.ts; Dom 2026-10-26, Strategy approved
// PR #67 with the hit-stop kept at 6 frames). Presentation only; ?fx=v1 (null) = today's numbers exactly; an opponent's special never changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFile } from '../src/sim/validate.js';
import { setHeroSpecialFx, heroSpecialFxFor, kickScale, flashScale, sparkScale, soundScale, trailScale } from '../src/fight/hero-special-fx.ts';
import { impactShove, impactStopMs, SPECIAL_KICK } from '../src/fight/hit-impact.ts';
import { CONTACTS } from '../src/fight/hit-stop-rows.ts';
import { cuesFor } from '../src/fight/sound/cues.ts';
import { specialSoundOf } from '../src/fight/sandbox-rules.ts';
import { createSkillImpact } from '../src/fight/skill-impact.ts';

const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));
const close = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`);
const ROW = FIGHT.specialFx;
const APPROVED = { ...ROW, cameraKick: 0.5, flash: 0.55, sparks: 0.5, soundGain: 0.75 };   // Strategy's PR #67 set: the mechanisms are tested at it; the SHIPPED row (Dom: only the arc) is pinned below
const ON = () => setHeroSpecialFx(heroSpecialFxFor(APPROVED, ''));
const OFF = () => setHeroSpecialFx(heroSpecialFxFor(ROW, '?fx=v1'));

test('fight.json validates with the specialFx row, and the row is the approved one', () => {
  assert.deepEqual(validateFile('fight', FIGHT), []);
  assert.deepEqual([ROW.cameraKick, ROW.flash, ROW.sparks, ROW.trailReaping, ROW.soundGain], [1, 1, 1, 0.25, 1]);   // Dom: only the Whirlwind's arc is cut; the rest is today's until the row is edited
  assert.deepEqual(ROW.skills, ['cleave', 'reaping']);
  assert.deepEqual(ROW.soundRows, ['cleave-3', 'reaping-2', 'reaping-3', 'reaping-4']);   // not the bone crack, not the first whooshes
  const bad = { ...FIGHT, specialFx: { ...ROW, surprise: 1 } };
  assert.ok(validateFile('fight', bad).length > 0, 'an unknown key is refused');
});

test('the shipped default changes the Whirlwind arc only (x0.25 = .015); ?fx=v1 is today\'s', () => {
  setHeroSpecialFx(heroSpecialFxFor(ROW, ''));
  for (const move of ['skill_cleave', 'skill_reaping']) { assert.equal(kickScale(0, move), 1); assert.equal(flashScale(0, move), 1); assert.equal(sparkScale(0, move), 1); }
  for (const id of ROW.soundRows) assert.equal(soundScale(0, id), 1, id);
  close(0.12 * 0.5 * trailScale(0, 'skill_reaping'), 0.015, 'the arc: .06 x .25');
  assert.equal(trailScale(0, 'skill_cleave'), 1, 'the Skull Crack trail stays'); assert.equal(trailScale(1, 'skill_reaping'), 1, 'the opponent\'s stays');
  OFF(); assert.equal(trailScale(0, 'skill_reaping'), 1);
});

test('the row loader refuses a bad multiplier or a trail skill outside the list', () => {
  assert.throws(() => heroSpecialFxFor({ ...ROW, cameraKick: 0 }), /multiplier/);
  assert.throws(() => heroSpecialFxFor({ ...ROW, flash: 1.5 }), /multiplier/);
  assert.throws(() => heroSpecialFxFor({ ...ROW, trailSkill: 'stomp' }), /trailSkill/);
  assert.throws(() => heroSpecialFxFor({ ...ROW, soundRows: [] }), /ids/);
  assert.equal(heroSpecialFxFor(undefined, ''), null);
});

test('the hit-stop stays 6 frames (100 ms): the row never touches it', () => {
  ON();
  assert.equal(CONTACTS.special.frames, 6);
  assert.equal(impactStopMs([{ type: 'SpecialLanded', actor: 0, target: 1, move: 'skill_cleave', tick: 1 }]), 100);
  assert.equal(impactStopMs([{ type: 'Hit', actor: 0, target: 1, move: 'skill_reaping', tick: 1 }]), 100);
  assert.equal(Object.keys(ROW).includes('hitStopFrames'), false);
});

const landed = (actor, move = 'skill_cleave') => ({ type: 'SpecialLanded', tick: 1, actor, target: 1 - actor, move });
const hit = (actor, move = 'skill_reaping') => ({ type: 'Hit', tick: 1, actor, target: 1 - actor, move });

test('?fx=v1 restores the exact old camera kick (the old literals, the old contact row)', () => {
  OFF();
  const s = impactShove(landed(0), undefined);
  // today's numbers, written out: along .05, drop .06, push .08 (the contact row has a push, so the knock rides the sideways term only)
  close(s.along, 0.05, 'along'); close(s.drop, 0.06, 'drop'); close(s.push, -0.08, 'push (the hero is slot 0: the camera jolts back, -push)');
  assert.equal(s.settle, 0.12);   // KNOCK_SETTLE once a push is set
  assert.deepEqual([SPECIAL_KICK.along, SPECIAL_KICK.drop, SPECIAL_KICK.hold, SPECIAL_KICK.settle], [0.05, 0.06, 2 / 60, 0.22]);   // the literals moved to rows, the same numbers
});

test('default: the hero\'s specials kick the camera at half (push, knock, along, drop)', () => {
  OFF(); const before = impactShove(landed(0), undefined), beforeWhirl = impactShove(hit(0), 'left');
  ON(); const after = impactShove(landed(0), undefined), afterWhirl = impactShove(hit(0), 'left');
  close(after.push, before.push * 0.5, 'push'); close(after.along, before.along * 0.5, 'along');
  close(after.drop, 0.06 * 0.5, 'drop');
  close(afterWhirl.push, beforeWhirl.push * 0.5, 'whirlwind push'); close(afterWhirl.drop, beforeWhirl.drop * 0.5, 'whirlwind drop');
  close(afterWhirl.along, beforeWhirl.along * 0.5, 'whirlwind along');
});

test('an opponent\'s special, a plain blow and a parry are unchanged by the row', () => {
  OFF(); const foe = impactShove(landed(1), undefined), foeHit = impactShove(hit(1), 'left'), heavy = impactShove({ type: 'Hit', tick: 1, actor: 0, target: 1, move: 'heavy_right', charged: true }, 'right'), light = impactShove({ type: 'Hit', tick: 1, actor: 0, target: 1, move: 'light_right' }, 'right');
  ON();
  assert.deepEqual(impactShove(landed(1), undefined), foe);
  assert.deepEqual(impactShove(hit(1), 'left'), foeHit);
  assert.deepEqual(impactShove({ type: 'Hit', tick: 1, actor: 0, target: 1, move: 'heavy_right', charged: true }, 'right'), heavy);
  assert.deepEqual(impactShove({ type: 'Hit', tick: 1, actor: 0, target: 1, move: 'light_right' }, 'right'), light);
  // a skill the row does not list (the hero's pommel or stomp) is not scaled either
  OFF(); const stomp = impactShove(hit(0, 'skill_stomp'), 'left'); ON();
  assert.deepEqual(impactShove(hit(0, 'skill_stomp'), 'left'), stomp);
});

test('flash, sparks, sound and trail multipliers: the hero\'s two specials only', () => {
  ON();
  for (const move of ['skill_cleave', 'skill_reaping']) { close(flashScale(0, move), 0.55, move); close(sparkScale(0, move), 0.5, move); close(kickScale(0, move), 0.5, move); }
  for (const [who, move] of [[1, 'skill_cleave'], [1, 'skill_reaping'], [0, 'skill_stomp'], [0, 'light_right'], [0, undefined]]) { assert.equal(flashScale(who, move), 1); assert.equal(sparkScale(who, move), 1); assert.equal(kickScale(who, move), 1); }
  close(trailScale(0, 'skill_reaping'), 0.25, 'whirlwind trail'); assert.equal(trailScale(0, 'skill_cleave'), 1); assert.equal(trailScale(1, 'skill_reaping'), 1); assert.equal(trailScale(0, 'heavy_right'), 1);
  for (const id of ROW.soundRows) { close(soundScale(0, id), 0.75, id); assert.equal(soundScale(1, id), 1, `${id} for the opponent`); }
  for (const id of ['cleave-1', 'cleave-2', 'reaping-1', 'stomp-2']) assert.equal(soundScale(0, id), 1, id);
  OFF();
  for (const fn of [flashScale, sparkScale, kickScale]) assert.equal(fn(0, 'skill_cleave'), 1);
  assert.equal(trailScale(0, 'skill_reaping'), 1); assert.equal(soundScale(0, 'cleave-3'), 1);
});

test('the hero\'s landing sounds: 600/750/750/550 become 450/562.5/562.5/412.5 (x0.75), ?fx=v1 = today\'s, the opponent\'s keep theirs', () => {
  const gains = (events) => cuesFor(events).map((c) => [c.name, c.gain]);
  const row = (id) => specialSoundOf(id.split('-')[0]).find((r) => r.id === id);
  const events = (actor, move) => [{ type: 'SpecialStarted', tick: 1, actor, move }, { type: 'SpecialLanded', tick: 2, actor, target: 1 - actor, move }];
  OFF(); const old = { cleave: gains(events(0, 'skill_cleave')), foe: gains(events(1, 'skill_cleave')) };
  assert.ok(old.cleave.some(([n, g]) => n === 'hit_heavy' && Math.abs(g - row('cleave-3').gain / 1000) < 1e-9), 'today: the hit_heavy at its row gain');
  ON();
  const now = gains(events(0, 'skill_cleave')), foe = gains(events(1, 'skill_cleave'));
  assert.deepEqual(foe, old.foe, 'the opponent\'s cleave sounds the same');
  assert.equal(now.length, old.cleave.length);
  const hitNow = now.find(([n]) => n === 'hit_heavy'), hitOld = old.cleave.find(([n]) => n === 'hit_heavy');
  close(hitNow[1], hitOld[1] * 0.75, 'cleave hit_heavy');
  for (const [i, [n, g]] of now.entries()) if (n === 'bone_crack' || n === 'whoosh_heavy') assert.equal(g, old.cleave[i][1], `${n} untouched`);
});

test('the impact kit: flash size x0.55 and sparks 10 -> 5 for the hero, today\'s for an opponent', () => {
  // the pool is a THREE points object; read its sizes through a stub scene
  const sizesOf = (event) => {
    const added = []; const scene = { add: (o) => added.push(o), remove() {} };
    const kit = createSkillImpact(scene);
    const fighters = [{ body: { x: 0, z: 0 } }, { body: { x: 0, z: 1.5 } }];
    kit.fire([event], fighters, [1, 1]); kit.update(0.01);
    const sizes = added[0].geometry.attributes.impactSize.array;
    return { alive: kit.alive(), flash: sizes[0] };
  };
  OFF(); const hero0 = sizesOf(hit(0, 'skill_reaping')), foe0 = sizesOf(hit(1, 'skill_reaping'));
  ON(); const hero1 = sizesOf(hit(0, 'skill_reaping')), foe1 = sizesOf(hit(1, 'skill_reaping'));
  assert.equal(hero0.alive, 11, 'today: one flash and ten sparks'); assert.equal(hero1.alive, 6, 'default: one flash and five sparks');
  assert.ok(Math.abs(hero1.flash / hero0.flash - 0.55) < 1e-5, `flash size ${hero1.flash} / ${hero0.flash}`);   // Float32 storage
  assert.deepEqual(foe1, foe0); assert.equal(foe1.alive, 11);
});
