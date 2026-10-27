// Dom 2026-10-27 (live eaeade1fd): "I don't see any of the gore, the finishers (decapitation, split crown, etc.); they should happen for almost every fight; rotate them so it isn't boring."
// Measured cause (this file's first run): the Minotaur's roster row allows only 'opened', so resolveFinisher dropped 3 of the 4 gore picks to nothing, and once an Opened had
// played it stayed the 'previous' pick for good (null never resets it), so the Minotaur got no ceremony at all after its first. Fix, behind ?gore=v1 (revert): while the ragdoll
// takes finishers it plays every finisher with a finisherCuts row (setRagdollPlays), and the automatic pick is a gore finisher on every kill (setGoreEvery: no plain death in the pool).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFinisher, setRagdollPlays } from '../src/roster.ts';
import { setGoreEvery, ROTATION } from '../src/fight/finishers.ts';

const MOVES = ['light', 'light_left', 'light_right', 'heavy', 'thrust'], LOCS = ['head', 'torso', 'legs', 'arm_left'];
const GORE = ['splitCrown', 'decapitation', 'runThrough', 'opened', 'dismember', 'hamstringCut'];   // the six (Dom 2026-10-27)
const run = (opp, n = 1000) => {
  let prev = null; const seq = [];
  for (let i = 0; i < n; i++) {
    const r = resolveFinisher(opp, { victim: 1, location: LOCS[i % 4], move: MOVES[(i * 7) % 5], heading: (i * 0.37) % 6.28, draw: false }, ['longsword', 'maul'], null, prev);
    seq.push(r); if (r) prev = r;
  }
  return seq;
};

test('before: the Minotaur gets no ceremony after its first (the measured bug), a free-roster body gets gore on 79%', () => {
  setRagdollPlays(null); setGoreEvery(false);
  const m = run('minotaur');
  assert.ok(m.filter(Boolean).length <= 1, 'one Opened at most, then nothing');
  const v = run('veteran');
  assert.ok(v.filter((x) => x && x !== 'plainDeath').length / v.length < 0.85);
});

test('gore every kill on the Minotaur while the ragdoll takes finishers: a gore finisher on 100% of kills, no back-to-back repeat, all four used', () => {
  setRagdollPlays(() => GORE); setGoreEvery(true);
  try {
    const m = run('minotaur');
    assert.ok(m.every((x) => GORE.includes(x)), 'every kill: ' + [...new Set(m)]);
    for (let i = 1; i < m.length; i++) assert.notEqual(m[i], m[i - 1], `repeat at ${i}`);
    assert.equal(new Set(m).size, 6, 'all six used');
    for (const g of GORE) assert.ok(m.filter((x) => x === g).length > 100, g + ' is drawn about a sixth of the time');
    assert.deepEqual(run('minotaur'), m, 'replay-identical');
    assert.ok(!ROTATION.length || ROTATION.includes('plainDeath'), 'the rotation rows themselves are untouched');
  } finally { setRagdollPlays(null); setGoreEvery(false); }
});

test('with gore off (?gore=v1) the clipless cut rows (dismember, hamstringCut) are never picked: the 5-way rotation as before', () => {
  setRagdollPlays(null); setGoreEvery(false);
  const v = run('veteran'); assert.ok(!v.includes('dismember') && !v.includes('hamstringCut'));
});

test('a kick, a skill kill, the hero death and a draw keep their plain fall', () => {
  setRagdollPlays(() => GORE); setGoreEvery(true);
  try {
    const f = (o) => resolveFinisher('minotaur', { victim: 1, location: 'torso', move: 'light', heading: 1, draw: false, ...o }, ['longsword', 'maul'], null, null);
    assert.equal(f({ move: 'kick' }), null); assert.equal(f({ move: 'skill_x' }), null); assert.equal(f({ victim: 0 }), null); assert.equal(f({ draw: true }), null);
  } finally { setRagdollPlays(null); setGoreEvery(false); }
});
