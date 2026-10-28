// Boss tuning by URL (src/tune.ts, data/tune.json): ?tune=gargantua.health:1.2,arachne.damage:0.9 multiplies one boss's health, damage or speed for one page view.
// No ?tune= is the fight byte for byte as before; bad keys are ignored with a warning; numbers are clamped to the table's min/max.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tuneFrom, tunedOpponent, tunedResolved, validateTune } from '../src/tune.ts';
import { validateFile } from '../src/sim/validate.js';
import { kindFightFor, kindPractice } from '../src/fight/spawn-kind.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const TUNE = read('tune'), PROFILES = read('profiles'), DIFF = read('difficulty'), BRAINS = read('brains'), FIGHT = read('fight');
const ctxOf = (search = '') => ({ profiles: PROFILES.profiles, difficulty: DIFF, brains: BRAINS.brains, pick: DIFF.default, search, level: FIGHT.level, ai: FIGHT.ai, override: null,
  weapon: FIGHT.weapon, skill: FIGHT.skill, skill2: FIGHT.skill2, stance: FIGHT.stance, specials: FIGHT.specials });
const withTune = (search) => { const warns = []; const tune = tuneFrom(TUNE, search, (m) => warns.push(m)); return { tune, warns, ctx: { ...ctxOf(search), tune } }; };
const digest = (x) => createHash('sha1').update(JSON.stringify(x)).digest('hex');
const KINDS = ['gargantua', 'arachne', 'pitborn'];
const practiceOf = (ctx, kind) => kindPractice(kindFightFor(kind, ctx), ctx, 7);

test('the table validates: the three kinds are profile rows, every key clamps around 1 (no override)', () => {
  assert.deepEqual(validateFile('tune', TUNE), []);
  assert.deepEqual(validateTune(TUNE, PROFILES.profiles.map((p) => p.id)), []);
  assert.deepEqual(Object.keys(TUNE.kinds).sort(), ['arachne', 'gargantua', 'minotaur']);
  assert.deepEqual(TUNE.keys.map((k) => k.id), ['health', 'damage', 'speed']);
  const bad = structuredClone(TUNE); bad.kinds.ghost = 'nobody'; bad.keys[0].min = 2;
  assert.equal(validateTune(bad, PROFILES.profiles.map((p) => p.id)).length, 2);
});

test('no ?tune= (or an empty one): no override, and the fight is byte for byte the one without the feature', () => {
  for (const s of ['', '?difficulty=3', '?tune=', '?tune=,,']) {
    const { tune, warns, ctx } = withTune(s);
    assert.deepEqual(tune, {}); assert.deepEqual(warns, []);
    for (const kind of KINDS) {
      const plain = ctxOf(s), a = kindFightFor(kind, plain), b = kindFightFor(kind, ctx);
      assert.deepEqual(b.resolved, a.resolved);
      assert.equal(digest(practiceOf(ctx, kind)), digest(practiceOf(plain, kind)), `${kind} at ${s || 'no query'}`);
      assert.deepEqual(b.opponent, a.opponent);
    }
  }
  const r = { opponent: 'x', brain: {}, foeHealthScale: 1, foeDamageScale: 1 }, o = { id: 'x', speed: 1 };
  assert.equal(tunedResolved(r, {}, 'gargantua'), r); assert.equal(tunedResolved(r, undefined, 'gargantua'), r);
  assert.equal(tunedOpponent(o, {}, 'gargantua'), o); assert.equal(tunedOpponent(o, { gargantua: { health: 2 } }, 'gargantua'), o);
});

test('?tune=gargantua.health:1.2,arachne.damage:0.9 parses; minotaur names the pitborn row', () => {
  const { tune, warns } = withTune('?tune=gargantua.health:1.2,arachne.damage:0.9,minotaur.speed:1.1');
  assert.deepEqual(tune, { gargantua: { health: 1.2 }, arachne: { damage: 0.9 }, pitborn: { speed: 1.1 } });
  assert.deepEqual(warns, []);
});

test('health scales the boss hp, damage the blows and the special, speed his pace; the other bosses are untouched', () => {
  const base = ctxOf(), { ctx } = withTune('?tune=gargantua.health:1.5,gargantua.damage:2,gargantua.speed:1.25');
  const b = practiceOf(base, 'gargantua'), t = practiceOf(ctx, 'gargantua');
  assert.equal(b.health, 137);
  assert.equal(t.health, Math.round(160 * 1.19 * 0.72 * 1.5));
  const [, fb] = b.duel.fighters, [, ft] = t.duel.fighters;
  assert.equal(ft.speed, fb.speed * 1.25);
  assert.deepEqual([fb.sheet.attack, ft.sheet.attack], [-28, 44], 'attack dial = (0.72 - 1) x 100 by default, (0.72 x 2 - 1) x 100 tuned');
  if (fb.specialShare !== undefined) assert.ok(ft.specialShare > fb.specialShare);
  for (const kind of ['arachne', 'pitborn']) assert.equal(digest(practiceOf(ctx, kind)), digest(practiceOf(base, kind)), `${kind} unaffected`);
});

test('bad input is ignored with a console warning, never thrown; out-of-range numbers clamp to the table', () => {
  const junk = ['nobody.health:2', 'gargantua.mana:2', 'gargantua.health:abc', 'gargantua.health', 'gargantua.health:NaN', 'gargantua.health:-1e9', 'gargantua.health:Infinity', '.health:1'];
  const { tune, warns } = withTune(`?tune=${junk.join(',')}`);
  assert.deepEqual(tune, {}); assert.equal(warns.length, junk.length);
  assert.ok(warns.every((w) => w.includes('ignored')));
  const c = withTune('?tune=gargantua.health:99,arachne.damage:0,minotaur.speed:0.01');
  assert.deepEqual(c.tune, { gargantua: { health: 4 }, arachne: { damage: 0.25 }, pitborn: { speed: 0.5 } });
  assert.equal(c.warns.length, 3); assert.ok(c.warns.every((w) => w.includes('clamped')));
  const mixed = withTune('?tune=gargantua.health:1.2,bogus.x:1');
  assert.deepEqual(mixed.tune, { gargantua: { health: 1.2 } }); assert.equal(mixed.warns.length, 1);
});
