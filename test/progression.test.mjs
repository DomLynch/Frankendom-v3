// Progression and saving (src/progression.ts, data/progression.json): a weapon per boss killed, a kill ladder, a localStorage save that never throws, difficulty that escalates per kill (capped).
// No save is the game as before: the same tune object, the fight row's weapon, and the three bosses' practices byte for byte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { escalation, freshSave, heroWeapon, loadSave, mergeTune, parseSave, progressionOn, recordKill, storageOf, unlockText, validateProgression, writeSave } from '../src/progression.ts';
import { tuneFrom } from '../src/tune.ts';
import { isWeaponId } from '../src/fight/moves.ts';
import { validateFile } from '../src/sim/validate.js';
import { kindFightFor, kindPractice } from '../src/fight/spawn-kind.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const P = read('progression'), TUNE = read('tune'), PROFILES = read('profiles'), DIFF = read('difficulty'), BRAINS = read('brains'), FIGHT = read('fight');
const IDS = PROFILES.profiles.map((p) => p.id);
const ctxOf = (tune, weapon = FIGHT.weapon) => ({ profiles: PROFILES.profiles, difficulty: DIFF, brains: BRAINS.brains, pick: DIFF.default, search: '', level: FIGHT.level, ai: FIGHT.ai, override: null,
  weapon, skill: FIGHT.skill, skill2: FIGHT.skill2, stance: FIGHT.stance, specials: FIGHT.specials, tune });
const digest = (x) => createHash('sha1').update(JSON.stringify(x)).digest('hex');
const KINDS = ['gargantua', 'arachne', 'pitborn'];
const memory = () => { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; };
const kill = (save, ...ids) => ids.reduce((s, id) => recordKill(s, id, P).save, save);

test('the table validates: the three bosses in boss order, existing weapon ids, one weapon each', () => {
  assert.deepEqual(validateFile('progression', P), []);
  assert.deepEqual(validateProgression(P, IDS, isWeaponId), []);
  assert.deepEqual(P.bosses.map((b) => b.id), KINDS);
  assert.deepEqual(P.bosses.map((b) => b.weapon), ['gladius', 'cleaver', 'maul']);
  const bad = structuredClone(P); bad.bosses[0].weapon = 'excalibur'; bad.bosses[1].id = 'ghost'; bad.healthCap = 0.5; bad.bosses[2].weapon = 'cleaver';
  assert.equal(validateProgression(bad, IDS, isWeaponId).length, 4);
});

test('no save: the fight is byte for byte the one before (same tune object, the fight row weapon, identical practices)', () => {
  const fresh = freshSave();
  assert.deepEqual(escalation(fresh, P), {});
  const tuned = tuneFrom(TUNE, '');
  assert.equal(mergeTune(tuned, escalation(fresh, P)), tuned);
  assert.equal(heroWeapon(fresh, P, FIGHT.weapon, ['longsword', 'gladius', 'cleaver'], ''), FIGHT.weapon);
  assert.equal(heroWeapon(fresh, P, FIGHT.weapon, ['longsword', 'gladius', 'cleaver'], '?weapon=cleaver'), FIGHT.weapon, '?weapon= opens nothing that is not unlocked');
  const before = ctxOf(tuned), after = ctxOf(mergeTune(tuned, escalation(loadSave(memory(), P), P)), heroWeapon(loadSave(null, P), P, FIGHT.weapon, ['longsword'], ''));
  for (const kind of KINDS) assert.equal(digest(kindPractice(kindFightFor(kind, after), after, 7)), digest(kindPractice(kindFightFor(kind, before), before, 7)), kind);
});

test('a kill ladder: bosses in the order they fell, a weapon on the first kill only, repeat kills count', () => {
  let s = freshSave();
  const a = recordKill(s, 'arachne', P);
  assert.equal(a.unlocked.weapon, 'cleaver'); s = a.save;
  const g = recordKill(s, 'gargantua', P);
  assert.equal(g.unlocked.weapon, 'gladius'); s = g.save;
  const again = recordKill(s, 'arachne', P);
  assert.equal(again.unlocked, null); s = again.save;
  assert.deepEqual(s.ladder, ['arachne', 'gargantua']);
  assert.deepEqual(s.kills, { arachne: 2, gargantua: 1 });
  assert.deepEqual(s.unlocked, ['cleaver', 'gladius']);
  assert.equal(recordKill(s, 'goblin', P).unlocked, null);
  assert.equal(recordKill(s, 'goblin', P).save, s, 'a kind that is no ladder boss changes nothing');
  assert.equal(unlockText(g.unlocked), 'Unlocked: Gladius');
});

test('difficulty escalates per kill, additive, and stops at the caps', () => {
  const s1 = kill(freshSave(), 'gargantua'), e1 = escalation(s1, P);
  assert.deepEqual(Object.keys(e1), KINDS, 'every boss meets the raised scales');
  assert.ok(Math.abs(e1.arachne.health - 1.06) < 1e-9 && Math.abs(e1.arachne.damage - 1.04) < 1e-9);
  const s3 = kill(freshSave(), 'gargantua', 'arachne', 'pitborn'), e3 = escalation(s3, P);
  assert.ok(e3.pitborn.health > e1.pitborn.health && e3.pitborn.damage > e1.pitborn.damage);
  let s = freshSave(); for (let i = 0; i < 200; i++) s = kill(s, 'pitborn');
  assert.deepEqual(escalation(s, P).gargantua, { health: P.healthCap, damage: P.damageCap });
  // laid over the page's own ?tune=, not replacing it
  const merged = mergeTune(tuneFrom(TUNE, '?tune=gargantua.health:2,gargantua.speed:1.5'), e1);
  assert.ok(Math.abs(merged.gargantua.health - 2 * 1.06) < 1e-9 && merged.gargantua.speed === 1.5 && Math.abs(merged.arachne.damage - 1.04) < 1e-9);
  // and it reaches the boss: more health and damage than with no kills, on the same seed
  const before = ctxOf({}), after = ctxOf(e3);
  for (const kind of KINDS) {
    const a = kindFightFor(kind, before), b = kindFightFor(kind, after);
    assert.ok(b.resolved.foeHealthScale > a.resolved.foeHealthScale && b.resolved.foeDamageScale > a.resolved.foeDamageScale, kind);
  }
});

test('the unlocked weapon becomes his: the newest he can draw, ?weapon= picks among his, nothing undrawable', () => {
  const draw = ['longsword', 'gladius', 'cleaver'];
  const g = kill(freshSave(), 'gargantua'), ga = kill(g, 'arachne'), all = kill(ga, 'pitborn');
  assert.equal(P.autoEquip, false, 'shipped row: a kill never switches his weapon (Dom 2026-10-28)');
  for (const s of [freshSave(), g, ga, all]) assert.equal(heroWeapon(s, P, 'longsword', draw, ''), 'longsword', '0, 1, 2, 3 kills: the longsword');
  assert.deepEqual(ga.unlocked, ['gladius', 'cleaver'], 'the unlocks are still saved');
  assert.equal(heroWeapon(all, P, 'longsword', draw, '?weapon=gladius'), 'gladius');
  assert.equal(heroWeapon(all, P, 'longsword', draw, '?weapon=maul'), 'longsword');
  assert.equal(heroWeapon(g, P, 'longsword', draw, '?weapon=cleaver'), 'longsword', 'cleaver is not unlocked yet');
  const on = { ...P, autoEquip: true };   // the old newest-unlock rule, behind the row
  assert.equal(heroWeapon(g, on, 'longsword', draw, ''), 'gladius');
  assert.equal(heroWeapon(all, on, 'longsword', draw, ''), 'cleaver', 'the maul has no art for his hand: he keeps the cleaver');
  assert.equal(heroWeapon(all, on, 'longsword', ['longsword'], ''), 'longsword', 'nothing he can draw: the fight row weapon');
});

test('the save round-trips in its own key and touches no other key', () => {
  const st = memory(); st.setItem('frankendom.cues', 'seen'); st.setItem('other', '1');
  const s = kill(freshSave(), 'gargantua', 'arachne', 'arachne');
  assert.equal(writeSave(st, P, s), true);
  assert.deepEqual([...st.m.keys()].sort(), ['frankendom.cues', P.key, 'other'].sort());
  assert.equal(st.getItem('frankendom.cues'), 'seen'); assert.equal(st.getItem('other'), '1');
  assert.deepEqual(loadSave(st, P), s);
});

test('a bad save is a fresh game and nothing throws (corrupt, wrong version, wrong shape, unknown bosses)', () => {
  const fresh = freshSave();
  for (const raw of [null, '', 'not json', '{', '[]', 'null', '7', '"x"', '{"v":99,"kills":{},"ladder":[]}', '{"v":1}', '{"v":1,"kills":[],"ladder":[]}', '{"v":1,"kills":{"arachne":1},"ladder":"arachne"}'])
    assert.deepEqual(parseSave(raw, P), fresh, String(raw));
  // a table edited since: unknown bosses and bad counts are dropped, the rest kept, unlocked rebuilt from the ladder
  const kept = parseSave(JSON.stringify({ v: 1, kills: { arachne: 2, ghost: 5, gargantua: -1, pitborn: 'x' }, ladder: ['ghost', 'arachne', 'arachne', 'gargantua'], unlocked: ['excalibur'] }), P);
  assert.deepEqual(kept, { v: 1, kills: { arachne: 2 }, ladder: ['arachne'], unlocked: ['cleaver'], coins: 0, banked: 0, pile: null, lost: [] });
  // storage that throws on read, on write, or on the property itself
  const angry = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
  assert.deepEqual(loadSave(angry, P), fresh); assert.equal(writeSave(angry, P, kill(fresh, 'arachne')), false);
  assert.deepEqual(loadSave(null, P), fresh); assert.equal(writeSave(null, P, fresh), false);
  assert.equal(storageOf({ get localStorage() { throw new Error('blocked'); } }), null);
  assert.equal(storageOf({}), null);
  const m = memory(); assert.equal(storageOf({ localStorage: m }), m);
});

test('?save=off switches it off, anything else leaves it on', () => {
  assert.equal(progressionOn(P, ''), true);
  assert.equal(progressionOn(P, '?save=off'), false);
  assert.equal(progressionOn(P, '?x=1&save=off'), false);
  assert.equal(progressionOn(P, '?save=on'), true);
});

test('wiring: the page records kills in the zone loop, rebuilds the kinds, shows one discreet line, and the hero equip exists', () => {
  const main = readFileSync(new URL('../src/client/main.ts', import.meta.url), 'utf8'), scene = readFileSync(new URL('../src/fight/scene.ts', import.meta.url), 'utf8');
  assert.match(main, /onBossKilled\(spawns\[current\]!\.kind[,)]/); assert.match(main, /onBossKilled\(spawns\[a\.index\]!\.kind[,)]/);   // (the star bosses pass the dead one's star too, data/stars.json)
  assert.match(main, /KINDS = kindTable\(KIND_CTX\)/); assert.match(main, /opponentId, undefined, HERO_WEAPON,/);
  assert.match(scene, /weapons\/player\/cleaver\.glb/);
  assert.equal(P.bosses.some((b) => b.weapon === 'cleaver'), true);
});
