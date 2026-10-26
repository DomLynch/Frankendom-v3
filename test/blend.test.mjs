// Clip-to-clip blends in ms (data/fight.json blendMs/settleMs = V2 #70's data/anim.json rows); ?blend=v1 (null) = V1's fades exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setBlend, combatFade, weightEase, blendOn } from '../src/fight/anim-blend.ts';

const FIGHT = JSON.parse(readFileSync(new URL('../data/fight.json', import.meta.url), 'utf8'));
const close = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`);
const v1 = (p, dead) => Math.min(1, p * 12, dead ? 1 : (1 - p) * 10);
const span = (pose, kind, ticks, p) => ({ pose, progress: p, kind, age: p * ticks, left: (1 - p) * ticks });

test("V2's numbers, as they are in Frankendom-v2 data/anim.json (none above 150 but the roll's settle)", () => {
  const { about, ...b } = FIGHT.blendMs;
  assert.ok(about);
  assert.deepEqual(b, { locomotion: 120, attackIn: 75, attackOut: 80, specialIn: 75, specialOut: 80, hurtIn: 40, hurtOut: 80, rollIn: 60, rollOut: 120 });
  for (const [k, ms] of Object.entries(b)) assert.ok(ms > 0 && ms <= 150, `blendMs.${k} = ${ms}`);
  assert.equal(FIGHT.settleMs.roll, 120);   // V2's rollOut: V2's 300 settle was for its 1.4 s roll; V3's roll is 600 ms
});

test('?blend=v1 (null) is V1: 1/12 in, 1/10 out, 24/s weights, whatever the span', () => {
  setBlend(null);
  assert.equal(blendOn(), false);
  for (const p of [0, 0.03, 0.08, 0.5, 0.92, 0.97, 1]) {
    close(combatFade('attack', p, false, span('attack', 'attack', 50, p)), v1(p, false), `attack ${p}`);
    close(combatFade('roll', p, false, span('roll', 'roll', 36, p)), v1(p, false), `roll ${p}`);
  }
  close(weightEase(1 / 60), 1 - Math.exp(-24 / 60), 'ease');
});

test('rows on: fades in milliseconds from the move\'s ticks; the roll settles over settleMs.roll', () => {
  setBlend(FIGHT.blendMs, FIGHT.settleMs);
  assert.equal(blendOn(), true);
  // a 50-tick swing (833 ms): 3 ticks in = 50 ms of a 75 ms fade-in; 3 ticks left = 50 of an 80 ms fade-out
  close(combatFade('attack', 3 / 50, false, span('attack', 'attack', 50, 3 / 50)), 50 / 75, 'attack in');
  close(combatFade('attack', 47 / 50, false, span('attack', 'attack', 50, 47 / 50)), 50 / 80, 'attack out');
  close(combatFade('attack', 0.5, false, span('attack', 'attack', 50, 0.5)), 1, 'attack mid');
  // the 36-tick roll: 60 ms in, then out over settleMs.roll 120 ms (the last 7.2 ticks)
  close(combatFade('roll', 2 / 36, false, span('roll', 'roll', 36, 2 / 36)), (2000 / 60) / 60, 'roll in');
  close(combatFade('roll', 27 / 36, false, span('roll', 'roll', 36, 27 / 36)), 1, 'roll still full at 27');
  close(combatFade('roll', 33 / 36, false, span('roll', 'roll', 36, 33 / 36)), 50 / 120, 'roll settle');
  // the settle row wins over rollOut when they differ
  setBlend(FIGHT.blendMs, { roll: 300 });
  close(combatFade('roll', 27 / 36, false, span('roll', 'roll', 36, 27 / 36)), 150 / 300, 'settle row used');
  setBlend(FIGHT.blendMs, FIGHT.settleMs);
  // a hit: 40 ms in
  close(combatFade('hit', 1 / 30, false, span('hit', 'hurt', 30, 1 / 30)), (1000 / 60) / 40, 'hurt in');
  close(weightEase(1 / 60), 1 - Math.exp(-(1 / 60) * (3000 / 120)), 'ease');
});

test('a span that does not match the pose shown, a death or no span keeps V1', () => {
  setBlend(FIGHT.blendMs, FIGHT.settleMs);
  close(combatFade('hit', 0.05, false, span('attack', 'attack', 50, 0.05)), v1(0.05, false), 'restaged pose');
  close(combatFade('attack', 0.06, false, span('attack', 'attack', 50, 0.05)), v1(0.06, false), 'restaged progress');
  close(combatFade('death', 0.05, true, span('death', 'hurt', 50, 0.05)), v1(0.05, true), 'death');
  close(combatFade('attack', 0.05, false, null), v1(0.05, false), 'no span');
  setBlend(null);
});
