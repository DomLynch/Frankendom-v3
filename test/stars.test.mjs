// Star bosses (data/stars.json, src/stars.ts): rows validate, the roll is deterministic and never stars a first encounter, weights rise with kills, and the 0-star fight (every first encounter) is byte for byte the one without the feature.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { rollStar, starMark, starTune, starWeights, trophyText, validateStars, levelOf } from '../src/stars.ts';
import { addTrophy, freshSave, parseSave, recordKill, writeSave } from '../src/progression.ts';
import { tuneFrom } from '../src/tune.ts';
import { validateFile } from '../src/sim/validate.js';
import { kindFightFor, kindPractice, kindTable } from '../src/fight/spawn-kind.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const STARS = read('stars'), PROFILES = read('profiles'), DIFF = read('difficulty'), BRAINS = read('brains'), FIGHT = read('fight'), TUNE = read('tune'), PROG = read('progression');
const DIFF_IDS = [...DIFF.rows.map((r) => r.id), ...DIFF.named.map((r) => r.id)];
const ctxOf = (extra = {}) => ({ profiles: PROFILES.profiles, difficulty: DIFF, brains: BRAINS.brains, pick: DIFF.default, search: '', level: FIGHT.level, ai: FIGHT.ai, override: null,
  weapon: FIGHT.weapon, skill: FIGHT.skill, skill2: FIGHT.skill2, stance: FIGHT.stance, specials: FIGHT.specials, ...extra });
const digest = (x) => createHash('sha1').update(JSON.stringify(x)).digest('hex');
const KINDS = ['gargantua', 'arachne', 'pitborn'];

test('the table validates, covers every difficulty row, and star 0 is the identity', () => {
  assert.deepEqual(validateFile('stars', STARS), []);
  assert.deepEqual(validateStars(STARS, DIFF_IDS), []);
  assert.deepEqual(STARS.levels.map((l) => l.star), [0, 1, 2]);
  const bad = structuredClone(STARS); bad.levels[0].healthX = 1.1; bad.levels[2].scaleX = 3; bad.weights.pop(); bad.hudColour = 'gold';
  assert.equal(validateStars(bad, DIFF_IDS).length, 4);
});

test('the default first fight is byte for byte the one without the feature (star 0 changes nothing)', () => {
  for (const kind of KINDS) {
    const plain = ctxOf(), withStars = ctxOf({ stars: STARS });
    const table = kindTable(withStars), a = kindFightFor(kind, plain), b = table(kind), c = table(kind, 0);
    assert.equal(digest(a), digest(b)); assert.equal(b, c); assert.equal(b.star, undefined);
    assert.equal(digest(kindPractice(a, plain, 7)), digest(kindPractice(b, withStars, 7)));
  }
  assert.deepEqual(starTune(STARS, 0, 'gargantua'), {});
  assert.equal(starMark(STARS, 0), ''); assert.equal(trophyText(STARS, 0), null);
});

test('a star multiplies health and damage on top of the profile, difficulty, escalation and ?tune=', () => {
  const tune = tuneFrom(TUNE, '?tune=gargantua.health:1.2,gargantua.damage:0.9');
  const base = kindFightFor('gargantua', ctxOf({ stars: STARS, tune })).resolved;
  for (const star of [1, 2]) {
    const l = levelOf(STARS, star), s = kindFightFor('gargantua', ctxOf({ stars: STARS, tune }), star);
    assert.equal(s.star, star);
    assert.ok(Math.abs(s.resolved.foeHealthScale - base.foeHealthScale * l.healthX) < 1e-9);
    assert.ok(Math.abs(s.resolved.foeDamageScale - base.foeDamageScale * l.damageX) < 1e-9);
  }
  const other = kindFightFor('arachne', ctxOf({ stars: STARS, tune }), 2).resolved, plain = kindFightFor('arachne', ctxOf({ stars: STARS, tune })).resolved;
  assert.ok(other.foeHealthScale > plain.foeHealthScale);
  const p1 = kindPractice(kindFightFor('gargantua', ctxOf({ stars: STARS })), ctxOf({ stars: STARS }), 7), p2 = kindPractice(kindFightFor('gargantua', ctxOf({ stars: STARS }), 2), ctxOf({ stars: STARS }), 7);
  assert.ok(p2.health > p1.health);
});

test('the roll is deterministic per spawn instance and never stars a first encounter', () => {
  for (const d of DIFF_IDS) for (const id of ['z1-a', 'z1-b', 'z1-c']) {
    assert.equal(rollStar(STARS, d, id, 0, 0), 0);   // the boss has never fallen: 0-star, whatever the hash says
    for (let n = 1; n < 40; n++) assert.equal(rollStar(STARS, d, id, n, 5), rollStar(STARS, d, id, n, 5));
  }
  const rolls = (id) => Array.from({ length: 200 }, (_, n) => rollStar(STARS, 10, id, n + 1, 10));
  assert.deepEqual(rolls('z1-a'), rolls('z1-a'));
  assert.notDeepEqual(rolls('z1-a'), rolls('z1-b'));
  const seen = new Set(rolls('z1-a')); assert.deepEqual([...seen].sort(), [0, 1, 2]);
  assert.equal(digest(rolls('z1-a')).length, 40);
});

test('the weights rise with kills and with the difficulty, capped; the shares land near the weights', () => {
  assert.deepEqual(starWeights(STARS, 5, 0), [STARS.zeroWeight, 0, 0]);
  let last = starWeights(STARS, 5, STARS.minKills);
  for (let k = STARS.minKills + 1; k <= STARS.killsCap; k++) { const w = starWeights(STARS, 5, k); assert.ok(w[1] > last[1] && w[2] >= last[2]); last = w; }
  assert.deepEqual(starWeights(STARS, 5, 99), starWeights(STARS, 5, STARS.killsCap));
  for (let d = 2; d <= 10; d++) assert.ok(starWeights(STARS, d, 3)[1] > starWeights(STARS, d - 1, 3)[1]);
  const w = starWeights(STARS, 10, 10), total = w.reduce((a, b) => a + b, 0), n = 4000, count = [0, 0, 0];
  for (let i = 0; i < n; i++) count[rollStar(STARS, 10, `s${i}`, 1 + (i % 7), 10)]++;
  for (let s = 0; s < 3; s++) assert.ok(Math.abs(count[s] / n - w[s] / total) < 0.04, `star ${s}`);
});

test('a star kill banks a trophy in the save; a save without stars is unchanged', () => {
  const kill = recordKill(freshSave(), 'gargantua', PROG).save;
  assert.equal('trophies' in kill, false);
  const stored = {}, store = { getItem: (k) => stored[k] ?? null, setItem: (k, v) => { stored[k] = v; } };
  writeSave(store, PROG, kill);
  assert.deepEqual(Object.keys(JSON.parse(stored[PROG.key])), ['v', 'kills', 'ladder', 'unlocked']);
  const two = addTrophy(addTrophy(kill, 2), 2);
  writeSave(store, PROG, two);
  assert.deepEqual(parseSave(stored[PROG.key], PROG).trophies, { 2: 2 });
  assert.equal(recordKill(two, 'gargantua', PROG).save.trophies[2], 2);
  assert.equal(trophyText(STARS, 2), `Trophy: ${STARS.levels[2].trophy.name}`);
  assert.equal(parseSave(JSON.stringify({ v: PROG.version, kills: {}, ladder: [], trophies: { x: 1, 1: -3 } }), PROG).trophies, undefined);
});
