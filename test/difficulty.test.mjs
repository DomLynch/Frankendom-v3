// V3's difficulty setting (src/difficulty.ts, data/difficulty.json over data/profiles.json): the ladder is monotonic and in range, the default row is pinned,
// row 10 is V1's level-18 Pitborn, ?difficulty= never throws, and the scales reach the opponent's health, blows and special without moving anything at scale 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { KNOBS, difficultyPick, profileFor, resolveFight, scaledOpponent, scaledPractice } from '../src/difficulty.ts';
import { checkDifficulty, validateAll } from '../src/sim/validate.js';
import { initialPractice, stepPractice } from '../src/fight/combat.ts';
import { OPPONENTS, opponentAt, profileAt } from '../src/fight/moves.ts';
import { recordSpecials } from '../src/fight/replay.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const DIFF = read('difficulty'), PROFILES = read('profiles'), BRAINS = read('brains'), FIGHT = read('fight');
const clone = (x) => JSON.parse(JSON.stringify(x));
const pick = (difficulty) => ({ profile: FIGHT.profile, difficulty });
const resolve = (difficulty) => resolveFight(pick(difficulty), PROFILES.profiles, DIFF, BRAINS.brains);

test('the data files validate: every row has every knob in range and the ladder runs 1..10', () => {
  assert.deepEqual(checkDifficulty(DIFF, PROFILES, BRAINS, FIGHT), []);
  assert.deepEqual(validateAll({ difficulty: DIFF, profiles: PROFILES, brains: BRAINS, fight: FIGHT }), []);
  assert.deepEqual(DIFF.rows.map((r) => r.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const r of [...DIFF.rows, ...DIFF.named]) for (const k of [...KNOBS, 'foeHealthScale', 'foeDamageScale']) assert.equal(typeof r[k], 'number', `${r.id}.${k}`);
});

test('the validator rejects a missing knob, an out-of-range value, a broken ladder, an unknown key and a bad default', () => {
  const bad = (edit, re) => { const d = clone(DIFF); edit(d); assert.match(checkDifficulty(d, PROFILES, BRAINS, FIGHT).join('\n'), re); };
  bad((d) => { delete d.rows[3].parry; }, /rows\[4\]\.parry/);
  bad((d) => { d.rows[3].accuracy = 1.5; }, /rows\[4\]\.accuracy: 1.5 is not a number from 0 to 1/);
  bad((d) => { d.rows[6].reaction = 80; }, /rows\[7\]\.reaction: 80 moves the wrong way/);
  bad((d) => { d.rows[6].foeHealthScale = 0.5; }, /rows\[7\]\.foeHealthScale/);
  bad((d) => { d.rows.pop(); d.default = 10; }, /difficulty\.default: 10 is not a ladder row/);
  bad((d) => { d.rows[0].id = 3; }, /ladder runs 1\.\.10 in order/);
  const d = clone(DIFF); d.rows[0].hp = 3;
  assert.match(validateAll({ difficulty: d, profiles: PROFILES, brains: BRAINS, fight: FIGHT }).join('\n'), /difficulty\.rows\[0\].*\.hp: unknown key/);
  const p = clone(PROFILES); p.profiles[0].brain = 'nope';
  assert.match(checkDifficulty(DIFF, p, BRAINS, FIGHT).join('\n'), /not a brains\.json row/);
});

test('the ladder is monotonic: every knob moves one way as the row rises', () => {
  const up = ['accuracy', 'parry', 'dodge', 'aggression', 'pressure', 'read', 'foeHealthScale', 'foeDamageScale'], down = ['reaction', 'discipline', 'lapse'];
  for (let i = 1; i < DIFF.rows.length; i++) {
    for (const k of up) assert.ok(DIFF.rows[i][k] >= DIFF.rows[i - 1][k], `${k} row ${i + 1}`);
    for (const k of down) assert.ok(DIFF.rows[i][k] <= DIFF.rows[i - 1][k], `${k} row ${i + 1}`);
  }
  assert.ok(DIFF.rows[0].foeHealthScale < 1 && DIFF.rows[0].reaction > DIFF.rows[9].reaction, 'row 1 is forgiving');
});

test('the default row is pinned (row 5) and an easier fight than the one before this setting', () => {
  assert.equal(DIFF.default, 5);
  assert.equal(PROFILES.default, 'pitborn');
  assert.equal(FIGHT.profile, 'pitborn');
  const d = DIFF.rows[4], legacy = DIFF.named[0];
  assert.equal(d.id, 5);
  assert.ok(d.foeHealthScale < 1 && d.foeDamageScale < 1 && d.reaction > legacy.reaction - 1);
});

test('row 10 is V1\'s level-18 Pitborn untouched; legacy is the novice brain with scales 1', () => {
  const v1 = profileAt(OPPONENTS.pitborn, FIGHT.level), r = resolve(10);
  const p = profileFor(v1, r, false);
  assert.deepEqual(p, v1, 'row 10 plays ?ai=v1\'s profile, knob for knob');
  assert.equal(r.foeHealthScale, 1); assert.equal(r.foeDamageScale, 1);
  const novice = BRAINS.brains.find((b) => b.id === 'novice'), legacy = DIFF.named.find((x) => x.id === 'legacy');
  for (const k of KNOBS) assert.equal(legacy[k], novice[k], k);
  assert.equal(legacy.foeHealthScale, 1); assert.equal(legacy.foeDamageScale, 1);
  assert.deepEqual(profileFor(v1, resolve('legacy'), false), { ...v1, ...Object.fromEntries(KNOBS.map((k) => [k, novice[k]])) });
  assert.equal(profileFor(v1, resolve(1), true), v1, '?ai=v1 plays V1\'s profile as the same object, whatever the row');
});

test('?difficulty= picks a row; anything else is the default with a warning, never a throw', () => {
  const seen = []; const warn = (m) => seen.push(m);
  assert.equal(difficultyPick(DIFF, '', warn), 5);
  assert.equal(difficultyPick(DIFF, '?x=1', warn), 5);
  for (let n = 1; n <= 10; n++) assert.equal(difficultyPick(DIFF, `?difficulty=${n}`, warn), n);
  assert.equal(difficultyPick(DIFF, '?difficulty=legacy', warn), 'legacy');
  assert.equal(seen.length, 0);
  for (const bad of ['0', '11', '-1', '4.5', 'abc', '', '1e1', '99999999999999999999', 'LEGACY']) assert.equal(difficultyPick(DIFF, `?difficulty=${bad}`, warn), 5, bad);
  assert.equal(seen.length, 9);
  assert.match(seen[0], /\?difficulty=0 is not a difficulty row/);
});

const start = (r, seed = 731) => {
  const body = scaledOpponent(opponentAt(OPPONENTS.pitborn, FIGHT.level), r);
  return scaledPractice(initialPractice(seed, body, FIGHT.weapon, FIGHT.skill, recordSpecials({ specials: true, level: FIGHT.level, opponent: 'pitborn' }), undefined, FIGHT.stance, undefined, undefined, undefined, undefined, undefined, FIGHT.skill2), r);
};
const idle = { move: { x: 0, z: 0, yaw: 0, run: false }, action: null, guard: false, lock: true };
const foeBlows = (r, ticks) => {
  let p = start(r); const profile = profileFor(profileAt(OPPONENTS.pitborn, FIGHT.level), r, false), hits = [], specials = [];
  for (let t = 0; t < ticks; t++) {
    p = stepPractice(p, t === 0 ? { ...idle, action: 'light' } : t < 60 ? idle : { ...idle, move: { x: 0, z: 1, yaw: 0, run: false } }, profile);
    for (const e of p.duel.events) { if (e.type === 'Hit' && e.actor === 1) hits.push({ move: e.move, damage: e.damage }); if (e.type === 'SpecialLanded' && e.actor === 1) specials.push({ move: e.move, damage: e.damage }); }
    if (p.duel.finish) break;
  }
  return { hits, specials, p };
};

test('the scales reach the body: health, every blow and the special; scale 1 is the untouched body and practice', () => {
  const one = resolve(10), half = { ...resolve(10), foeHealthScale: 0.5, foeDamageScale: 0.5 };
  const body = opponentAt(OPPONENTS.pitborn, FIGHT.level);
  assert.equal(scaledOpponent(body, one), body, 'scales 1 return the same body object');
  assert.equal(scaledOpponent(body, half).health, Math.round(body.health / 2));
  assert.equal(start(half).duel.fighters[1].maxHealth, 95);
  assert.equal(start(half).enemyMaxHealth, 95);
  const p1 = start(one), p2 = initialPractice(731, body, FIGHT.weapon, FIGHT.skill, recordSpecials({ specials: true, level: FIGHT.level, opponent: 'pitborn' }), undefined, FIGHT.stance, undefined, undefined, undefined, undefined, undefined, FIGHT.skill2);
  assert.equal(JSON.stringify(p1.duel), JSON.stringify(p2.duel), 'scale 1 builds exactly the unscaled fight');
  const a = foeBlows(one, 2400), b = foeBlows(half, 2400);
  assert.ok(a.hits.length > 0 && b.hits.length > 0, 'the foe lands blows on a hero who walks in');
  // the same move lands for half the damage (the two fights drift apart, so compare per move: the first landing of each move both fights share)
  const pairs = (xs, ys) => [...new Set(xs.map((x) => x.move))].flatMap((move) => { const x = xs.find((e) => e.move === move), y = ys.find((e) => e.move === move); return y && x.damage > 4 ? [[move, x.damage, y.damage]] : []; });
  const blows = pairs(a.hits, b.hits), specials = pairs(a.specials, b.specials);
  assert.ok(blows.length >= 2, 'at least two moves land in both fights');
  for (const [move, full, scaled] of [...blows, ...specials]) assert.ok(Math.abs(scaled - full / 2) <= 1, `${move} halves (${full} -> ${scaled})`);
  assert.ok(specials.length >= 1, 'the special lands in both fights');
});

test('the same pick is the same fight: deterministic, state for state', () => {
  const run = (d) => { const r = resolve(d); const { p } = foeBlows(r, 900); return createHash('sha256').update(JSON.stringify([p.duel, p.ai])).digest('hex'); };
  assert.equal(run(4), run(4));
  assert.notEqual(run(4), run(10));
});
