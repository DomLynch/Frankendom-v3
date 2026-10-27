// PER-SPAWN KIND (Strategy + Dom 2026-10-27, "10 different bosses, build it once", PR 1 of 2): every zone spawn row's `kind` is a data/profiles.json row, and the sim's
// opponent (stats, moves, specials, brain) is swapped to that spawn's kind when the sim is handed to it (or it joins as an attacker) and back as the hero walks to another
// (src/fight/spawn-kind.ts, wired in src/client/main.ts). The default zone is three Pitborn, so it must be the fight the page built once before, byte for byte: this file builds that
// fight the OLD way (the page-wide opponent, copied from main.ts before the change) beside the new door and compares them, and the Gate 0 / golden rows run unchanged beside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { initialPractice, stepPractice } from '../src/fight/combat.ts';
import { OPPONENTS, opponentAt, profileAt } from '../src/fight/moves.ts';
import { idleIntent } from '../src/fight/duel.ts';
import { recordSpecials } from '../src/fight/replay.ts';
import { profileFor, resolveFight, scaledOpponent, scaledPractice } from '../src/difficulty.ts';
import { checkKinds, validateZone } from '../src/sim/validate.js';
import { joinAttacker, stepAttackers } from '../src/fight/attacker-bout.ts';
import { kindFightFor, kindIds, kindPractice, kindProblem, kindTable } from '../src/fight/spawn-kind.ts';
import { WORLD, spotsFor, validateSpots } from '../src/zone/spawns.ts';
import { zoneFor } from '../src/zone/zone-rows.ts';
import { zoneLoopFor } from '../src/fight/zone-loop.ts';
import { initialState } from '../src/fight/sim.ts';
import * as play from '../src/fight/play-radius.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const FIGHT = read('fight'), PROFILES = read('profiles'), DIFF = read('difficulty'), BRAINS = read('brains'), ROWS = read('respawn');
const ZONE = zoneFor('');
const NEW = 'goblin';   // a synthetic second kind: V1's goblin (dodges and weaves), as a profile row with its own brain knobs over the difficulty row's
const GOBLIN = { id: NEW, opponent: 'goblin', brain: null, foeHealthScale: 1, foeDamageScale: 1, knobs: { dodge: 0.95, aggression: 0.9, reaction: 7 } };
const profiles = [...PROFILES.profiles, GOBLIN];
const ctxOf = (search = '', over = {}) => ({ profiles, difficulty: DIFF, brains: BRAINS.brains, pick: DIFF.default, search, level: FIGHT.level, ai: FIGHT.ai,
  override: new URLSearchParams(search).get('pitborn') === 'v1' ? FIGHT.opponentV1.opponent : null, weapon: FIGHT.weapon, skill: FIGHT.skill, skill2: FIGHT.skill2, stance: FIGHT.stance, specials: FIGHT.specials, ...over });
const CTX = ctxOf();
const digest = (x) => createHash('sha1').update(JSON.stringify(x)).digest('hex');
const poseOf = (hero, spot) => ({ hero, foe: spot, heroFacing: Math.atan2(spot.x - hero.x, spot.z - hero.z) });
const pose = poseOf({ x: 0, z: 2.2 }, { x: 0, z: -2.2 });
const intentOf = (p, t) => ({ ...idleIntent(), action: p.phase === 'sheathed' && !p.finish ? 'light' : p.phase === 'ready' && t % 40 === 0 ? 'light' : null });

/** The fight the page built before this PR: one page-wide opponent id (main.ts make(), copied), for the equivalence below. */
function legacyMake(seed, p) {
  const opponentId = FIGHT.opponent, opponent = OPPONENTS[opponentId];
  const resolved = resolveFight({ profile: FIGHT.profile, difficulty: DIFF.default }, PROFILES.profiles, DIFF, BRAINS.brains);
  const body = opponentAt(opponent, FIGHT.level);
  const made = initialPractice(seed, scaledOpponent(body, resolved), FIGHT.weapon, FIGHT.skill, recordSpecials({ specials: FIGHT.specials, level: FIGHT.level, opponent: opponentId }), undefined, FIGHT.stance, p, undefined, undefined, undefined, undefined, FIGHT.skill2);
  const aiProfile = profileFor(profileAt(opponent, FIGHT.level), resolved, false);
  return { practice: scaledPractice(made, resolved), aiProfile };
}
const run = (p, ai, ticks) => { let cur = p; for (let t = 0; t < ticks; t++) cur = stepPractice(cur, intentOf(cur, t), ai); return cur; };

test('the data: the fight row names the profile whose opponent it fights, and every shipped spawn kind is a profile row of an archetype', () => {
  assert.equal(PROFILES.profiles.find((p) => p.id === FIGHT.profile).opponent, FIGHT.opponent, 'the single fight (kind = fight.profile) is the same opponent as before');
  assert.deepEqual(checkKinds(PROFILES, Object.keys(OPPONENTS)), []);
  for (const s of ZONE.spawns) assert.equal(kindProblem(s.kind, PROFILES.profiles), null, s.id);
  assert.deepEqual(kindIds(PROFILES.profiles), PROFILES.profiles.map((p) => p.id));
});

test('(c) the default zone is unchanged: three Pitborn spawns resolve to ONE kind object, and it is the old page-wide fight, digest for digest', () => {
  assert.deepEqual(ZONE.spawns.map((s) => s.kind), ['pitborn', 'pitborn', 'pitborn']);
  const kinds = kindTable(CTX), spots = spotsFor(ZONE);
  assert.equal(new Set(spots.map((s) => kinds(s.kind))).size, 1, 'every default spawn is the same kind object: a hand-over between them swaps nothing');
  const k = kinds('pitborn'), old = legacyMake(731, pose);
  assert.equal(k.opponentId, FIGHT.opponent); assert.equal(k.scaled, true);
  const made = kindPractice(k, CTX, 731, pose);
  assert.deepEqual(made, old.practice, 'the opening practice is the old one, field for field');
  assert.deepEqual(k.ai, old.aiProfile, 'and so is the brain');
  assert.equal(digest(run(made, k.ai, 600)), digest(run(old.practice, old.aiProfile, 600)), '600 ticks of the fight digest alike');
});

test('(c) ?pitborn=v1 stays the Centurion for every kind, difficulty off, V1 brain row; no-zone single fight is the fight row\'s profile', () => {
  const v1 = ctxOf('?pitborn=v1'), k = kindFightFor('pitborn', v1), g = kindFightFor(NEW, v1);
  assert.equal(k.opponentId, FIGHT.opponentV1.opponent); assert.equal(k.scaled, false);
  assert.equal(g.opponentId, FIGHT.opponentV1.opponent, 'the legacy toggle is page-wide on purpose: every spawn is the Centurion');
  assert.deepEqual(k.ai, g.ai);
  assert.deepEqual(kindFightFor(FIGHT.profile, CTX).opponent, OPPONENTS[FIGHT.opponent], 'no zone: the fight row\'s profile');
});

test('(a) handing the sim to a goblin spawn uses the goblin\'s stats, specials and brain, and handing back restores the Pitborn exactly', () => {
  const kinds = kindTable(CTX), pit = kinds('pitborn'), gob = kinds(NEW);
  assert.notEqual(pit, gob);
  assert.equal(gob.opponentId, 'goblin'); assert.equal(gob.opponent, OPPONENTS.goblin);
  const before = kindPractice(pit, CTX, 731, pose);
  const swapped = kindPractice(gob, CTX, 9, pose);
  const [, goblinFighter] = swapped.duel.fighters, [, pitFighter] = before.duel.fighters;
  assert.equal(swapped.health, opponentAt(OPPONENTS.goblin, FIGHT.level).health, 'the goblin\'s own health bar (scales of 1)');
  assert.notEqual(swapped.health, before.health, 'not the Pitborn\'s');
  assert.equal(goblinFighter.weapon, OPPONENTS.goblin.weapon, 'the goblin\'s own weapon');
  assert.notEqual(goblinFighter.weapon, pitFighter.weapon);
  const specials = recordSpecials({ specials: FIGHT.specials, level: FIGHT.level, opponent: 'goblin' });
  assert.deepEqual(swapped, initialPractice(9, opponentAt(OPPONENTS.goblin, FIGHT.level), FIGHT.weapon, FIGHT.skill, specials, undefined, FIGHT.stance, pose, undefined, undefined, undefined, undefined, FIGHT.skill2),
    'built by the sim\'s own door with the goblin\'s id: scales of 1 leave it untouched');
  // the brain: the goblin's profile knobs (dodge, aggression, reaction) over the difficulty row's, V1's goblin profile under them; the Pitborn's are the difficulty row's alone
  const row = DIFF.rows.find((r) => r.id === DIFF.default);
  assert.equal(gob.ai.dodge, 0.95); assert.equal(gob.ai.aggression, 0.9); assert.equal(gob.ai.reaction, 7);
  assert.equal(gob.ai.parry, row.parry, 'a knob the kind leaves out is the difficulty row\'s');
  assert.equal(pit.ai.dodge, row.dodge); assert.equal(pit.ai.aggression, row.aggression);
  // and back: the Pitborn is rebuilt exactly (same seed, same pose => the same practice, the same brain object, the same 600 ticks)
  const back = kindPractice(kinds('pitborn'), CTX, 731, pose);
  assert.deepEqual(back, before); assert.equal(kinds('pitborn').ai, pit.ai);
  assert.equal(digest(run(back, kinds('pitborn').ai, 600)), digest(run(before, pit.ai, 600)));
  assert.notEqual(digest(run(swapped, gob.ai, 600)), digest(run(before, pit.ai, 600)), 'and the goblin\'s fight is a different fight');
});

test('(a) a kind\'s profile scales and knobs ride the profile row: health and damage scales multiply the difficulty row\'s, knobs win over the ladder', () => {
  const hard = { ...GOBLIN, id: 'goblin-hard', foeHealthScale: 2, foeDamageScale: 1.5 };
  const ctx = ctxOf('', { profiles: [...PROFILES.profiles, hard] }), k = kindFightFor('goblin-hard', ctx);
  const row = DIFF.rows.find((r) => r.id === DIFF.default);
  assert.equal(k.resolved.foeHealthScale, 2 * row.foeHealthScale); assert.equal(k.resolved.foeDamageScale, 1.5 * row.foeDamageScale);
  assert.equal(kindPractice(k, ctx, 5, pose).health, Math.max(1, Math.round(opponentAt(OPPONENTS.goblin, FIGHT.level).health * 2 * row.foeHealthScale)));
  const laddered = (id) => kindFightFor(NEW, ctxOf('', { pick: id })).ai;
  for (const id of [1, 5, 10]) { const ai = laddered(id); assert.equal(ai.dodge, 0.95); assert.equal(ai.aggression, 0.9); assert.equal(ai.reaction, 7); }
  assert.notEqual(kindFightFor('pitborn', ctxOf('', { pick: 1 })).ai.dodge, kindFightFor('pitborn', ctxOf('', { pick: 10 })).ai.dodge, 'a kind without knobs still follows the ladder');
});

test('(a) an attacker steps with its own kind\'s brain, not the held boss\'s', () => {
  const kinds = kindTable(CTX), pit = kinds('pitborn'), gob = kinds(NEW);
  const hero = { x: 0, z: 0 }, first = kindPractice(pit, CTX, 11, poseOf(hero, { x: 0, z: -20 })), joined = kindPractice(gob, CTX, 12, poseOf(hero, { x: 0, z: -1.6 }));
  const still = { ...gob.ai, aggression: 0, reaction: 120 }, rush = { ...gob.ai, aggression: 1, reaction: 1, lapse: 0 };
  const play300 = (profile, held) => {
    let p = first, list = [joinAttacker(1, joined, held)];
    for (let t = 0; t < 300; t++) { const intent = intentOf(p, t), after = stepPractice(p, intent, pit.ai), out = stepAttackers(p, after, intent, list, profile); p = out.practice; list = out.list; }
    return digest(list[0].practice.duel.fighters[1]);
  };
  assert.equal(play300(pit.ai, rush), play300(rush, undefined), 'the attacker\'s own profile is the one it steps with; absent, the page profile (as before)');
  assert.notEqual(play300(pit.ai, rush), play300(pit.ai, still), 'two brains on one attacker fight differently');
});

test('(b) the validators refuse an unknown kind, with the profile ids in the message', () => {
  const spots = spotsFor(ZONE), ids = kindIds(PROFILES.profiles), start = initialState();
  play.setPlayScale(ROWS.world.pitScale);   // the zone's circle (each test file is its own process)
  {
    assert.doesNotThrow(() => validateSpots(spots, start, play.RADIUS, WORLD, ids), 'the shipped kinds are profile rows');
    assert.doesNotThrow(() => validateSpots(spots.map((s, i) => (i === 1 ? { ...s, kind: NEW } : s)), start, play.RADIUS, WORLD, kindIds(profiles)), 'a second kind passes once it has a profile row');
    assert.throws(() => validateSpots(spots.map((s, i) => (i === 1 ? { ...s, kind: NEW } : s)), start, play.RADIUS, WORLD, ids), /spawn pit-pitborn-east names kind "goblin", which is no profile row \(data\/profiles\.json: pitborn\)/);
    assert.throws(() => validateSpots(spots.map((s) => ({ ...s, kind: 'nobody' })), start, play.RADIUS, WORLD, ids), /names kind "nobody"/);
  }
  const row = JSON.parse(JSON.stringify(ZONE)); row.spawns[2].kind = 'nobody';
  assert.match(validateZone(row, ids).join('\n'), /spawns\[2\]\.kind: 'nobody' is not an opponent profile id/);
  assert.deepEqual(validateZone(ZONE, ids), []);
  assert.throws(() => zoneLoopFor(row, '', ids), /spawn pit-pitborn-west names unknown kind "nobody"/);
  assert.throws(() => kindFightFor('nobody', CTX), /kind "nobody" is no data\/profiles\.json row \(pitborn, goblin\)/);
  assert.match(kindProblem('ghost', [{ ...GOBLIN, id: 'ghost', opponent: 'no-such-archetype' }]), /names opponent "no-such-archetype", which is no archetype/);
  assert.match(checkKinds({ profiles: [{ ...GOBLIN, opponent: 'nope' }] }, Object.keys(OPPONENTS)).join('\n'), /profiles\.goblin\.opponent: 'nope' is not an archetype/);
  assert.match(checkKinds({ profiles: [GOBLIN, GOBLIN] }, Object.keys(OPPONENTS)).join('\n'), /duplicate id/);
  assert.match(checkKinds({ profiles: [{ ...GOBLIN, knobs: { dodge: 2 } }] }, Object.keys(OPPONENTS)).join('\n'), /knobs\.dodge: 2 is not a number from 0 to 1/);
  assert.match(checkKinds({ profiles: [{ ...GOBLIN, knobs: { speed: 1 } }] }, Object.keys(OPPONENTS)).join('\n'), /knobs\.speed: unknown knob/);
  assert.match(checkKinds({ profiles: [{ ...GOBLIN, knobs: { reaction: 2.5 } }] }, Object.keys(OPPONENTS)).join('\n'), /whole number/);
  assert.deepEqual(checkKinds({ profiles }, Object.keys(OPPONENTS)), []);
});

test('the page wires it: each spawn\'s kind on every hand-over, leash reset, adoption and join; no page-wide opponent left in the zone path', () => {
  const main = src('../src/client/main.ts');
  assert.doesNotMatch(main, /fightOpponent\(/, 'the page no longer reads one opponent id for the whole zone');
  assert.match(main, /const kindAt = \(index: number\): KindFight => KINDS\(spawns\[index\]!\.kind\)/);
  assert.match(main, /if \(ZONE\) useKind\(kindAt\(index\)\);/, 'rematch (every hand-over, death and reset) takes the target spawn\'s kind');
  assert.match(main, /make\(seed, poseFor\(index, at\), kindAt\(index\)\)/, 'a leash reset rebuilds the boss as its own kind');
  assert.match(main, /useKind\(kindAt\(current\)\);\s+\/\/ an attacker may take the sim/);
  assert.match(main, /useKind\(kindAt\(current\)\);\s+\/\/ the attacker's own kind is now the sim's opponent/);
  assert.match(main, /joinAttacker\(i, make\([^;]*kindAt\(i\)\), kindAt\(i\)\.ai\)/, 'an attacker is built and stepped as its own kind');
  assert.match(main, /useKind\(kindAt\(current\)\); practice = fresh\(poseFor\(current, heroStart\)\)/, 'the page opens on the held spawn\'s kind');
  assert.match(main, /validateSpots\(SPOTS, initialState\(\), RADIUS, WORLD, kindIds\(KIND_CTX\.profiles\)\); for \(const s of SPOTS\) KINDS\(s\.kind\)/);
  assert.match(main, /zoneLoopFor\(zoneFor\(search\), search, kindIds\(KIND_CTX\.profiles\)\)/);
  assert.match(main, /override: pitbornV1\(search\) \? FIGHT\.opponentV1\.opponent : null/, '?pitborn=v1 stays the page-wide Centurion toggle');
});
