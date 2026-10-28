// DAILY PIT (data/daily-pit.json, src/daily-pit.ts, src/daily-pit-ui.ts; Dom 2026-10-28): one seeded boss fight a day with ONE chaos modifier, the same for everyone. This pins the table, the
// date -> boss + modifier pick (fixed dates, the UTC rollover), that every modifier is something the existing tune and star rows express, the score and the tracker, the optional save field (old saves load),
// the one-boss zone, and the hook the share clip and a later leaderboard listen to. The page itself (the button, the banner, the result screen, the real input layer) is scripts/daily-pit-check.mjs on the built dist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attemptsLeft, cleanDaily, clock, dailyZone, dayKey, emitResult, fill, finishAttempt, freshTracker, onResult, pickFor, recordFor, runFor, scoreOf, spendAttempt, stepTracker, validateDaily } from '../src/daily-pit.ts';
import { checkDailyPit, validateFile } from '../src/sim/validate.js';
import { escalation, freshSave, loadSave, mergeTune, parseSave, recordKill, writeSave } from '../src/progression.ts';
import { tuneFrom } from '../src/tune.ts';
import { kindFightFor, kindPractice } from '../src/fight/spawn-kind.ts';
import { dropPile, earn } from '../src/corpse-run.ts';
import { CORPSE } from '../src/corpse-run.ts';
import { validateZone } from '../src/sim/validate.js';
import { ringedZoneFor, zoneFor } from '../src/zone/zone-rows.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const D = read('daily-pit'), PROFILES = read('profiles'), TUNE = read('tune'), PHYSICS = read('physics'), ZONE1 = read('zones/zone1.row'), PROG = read('progression'), STARS = read('stars');
const DIFF = read('difficulty'), BRAINS = read('brains'), FIGHT = read('fight'), RESPAWN = read('respawn');
const CTX = { profiles: PROFILES, tune: TUNE, physics: PHYSICS, zone: ZONE1 };
const clone = (x) => JSON.parse(JSON.stringify(x));
const memory = () => { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; };
const ctxOf = (tune) => ({ stars: STARS, profiles: PROFILES.profiles, difficulty: DIFF, brains: BRAINS.brains, pick: DIFF.default, search: '', level: FIGHT.level, ai: FIGHT.ai, override: null,
  weapon: FIGHT.weapon, skill: FIGHT.skill, skill2: FIGHT.skill2, stance: FIGHT.stance, specials: FIGHT.specials, tune });

test('the table validates, with the cross-file rows: wired, cuttable bosses and tune keys inside the clamps', () => {
  assert.deepEqual(validateFile('daily-pit', D), []);
  assert.deepEqual(validateDaily(D, CTX), []);
  assert.deepEqual(D.bosses, ['gargantua', 'arachne', 'pitborn']);
  assert.equal(D.attemptsPerDay, 3, 'attempts per day is a data row, default 3');
  assert.equal(D.modifiers.length, 7);
  assert.equal(D.cutLog, PHYSICS.cut.log);
  assert.ok(ZONE1.spawns.some((s) => s.id === D.spawnId));
  assert.ok(RESPAWN.openers.spawns.includes(D.spawnId), 'the day\'s slot is the opener spawn: the fight opens by itself');
  const later = D.later.map((l) => l.id);
  assert.deepEqual(later, ['low-gravity', 'fists-only', 'tiny-arena', 'hero-half-health', 'big-head']);
  for (const id of later) assert.ok(!D.modifiers.some((m) => m.id === id), `${id} is listed as later, not shipped`);
});

test('every boss in the pool is cuttable: a physics opponents row with a 106 measure AND a cut manifest in physics-chunk.ts', () => {
  const chunk = readFileSync(new URL('../src/fight/physics-chunk.ts', import.meta.url), 'utf8');
  const manifests = /export const cutManifests[^=]*=\s*\{([^}]*)\}/.exec(chunk)?.[1] ?? '';
  for (const id of D.bosses) {
    const body = PROFILES.profiles.find((p) => p.id === id).body ?? PROFILES.defaultBody;
    assert.ok(PHYSICS.opponents.some((o) => o.body === body && o.measure['106']), `${id}: ${body} has a physics row`);
    assert.match(manifests, new RegExp(`\\b${body}\\b`), `${id}: ${body} has a cut manifest`);
  }
});

test('bad rows are refused: a ring boss that is not cuttable, a ghost, bad tune keys and values, a modifier that changes nothing', () => {
  const bad = (mut) => { const x = clone(D); mut(x); return checkDailyPit(x, CTX).join('\n'); };
  assert.match(bad((x) => { x.bosses.push('pumpkinhulk'); }), /bosses\.pumpkinhulk: not a wired boss/);
  assert.match(bad((x) => { x.bosses.push('ghost'); }), /ghost: no data\/profiles\.json row/);
  assert.match(bad((x) => { x.modifiers[0].tune = { gravity: 0.5 }; }), /tune\.gravity: no data\/tune\.json key/);
  assert.match(bad((x) => { x.modifiers[0].tune = { health: 9 }; }), /outside data\/tune\.json's 0\.25 to 4/);
  assert.match(bad((x) => { x.modifiers[0].tune = { health: 1 }; }), /1 is no change/);
  assert.match(bad((x) => { x.modifiers[0].tune = {}; x.modifiers[0].stars = 0; }), /a modifier changes something/);
  assert.match(bad((x) => { x.modifiers[1].id = x.modifiers[0].id; }), /unique lower-case id/);
  assert.match(bad((x) => { x.cutLog = 'nope'; }), /not data\/physics\.json cut\.log/);
  assert.match(bad((x) => { x.spawnId = 'nowhere'; }), /no spawn of the zone row/);
  assert.match(bad((x) => { x.later.push({ id: 'berserker', why: 'x' }); }), /not a shipped modifier/);
  assert.match(bad((x) => { x.attemptsPerDay = 0; }), /attemptsPerDay/);
  assert.match(bad((x) => { x.score.fields = ['time', 'time', 'parts']; }), /score\.fields/);
  assert.match(bad((x) => { x.ui.text.won = ''; }), /ui\.text\.won/);
  const unknown = clone(D); unknown.surprise = 1; unknown.modifiers[0].fists = true;
  assert.equal(validateFile('daily-pit', unknown).filter((m) => /unknown key/.test(m)).length, 2, 'a typo key is an error, not a silent no-op');
  const noPhysics = clone(PHYSICS); noPhysics.opponents = noPhysics.opponents.filter((o) => o.body !== 'arachne');
  assert.match(checkDailyPit(D, { ...CTX, physics: noPhysics }).join('\n'), /bosses\.arachne: body "arachne" has no data\/physics\.json opponents row/);
});

test('the UTC day: it rolls over at 00:00 UTC, whatever the machine\'s time zone', () => {
  assert.equal(dayKey(Date.UTC(2026, 9, 28, 0, 0, 0, 0)), '2026-10-28');
  assert.equal(dayKey(Date.UTC(2026, 9, 28, 23, 59, 59, 999)), '2026-10-28');
  assert.equal(dayKey(Date.UTC(2026, 9, 28, 23, 59, 59, 999) + 1), '2026-10-29');
  assert.equal(dayKey(Date.UTC(2026, 11, 31, 23, 59, 59, 999) + 1), '2027-01-01');
  assert.equal(dayKey(Date.UTC(2028, 1, 29, 12)), '2028-02-29');
  assert.notDeepEqual(pickFor(D, '2026-10-31'), pickFor(D, '2026-11-01'), 'a rollover can change the fight');
});

test('fixed dates give a fixed boss and modifier (pinned), and the pick is a pure function', () => {
  const pins = [['2026-01-01', 'arachne', 'glass-boss'], ['2026-02-28', 'pitborn', 'star-born'], ['2026-03-01', 'gargantua', 'double-damage'], ['2026-06-15', 'pitborn', 'iron-hide'], ['2026-10-28', 'pitborn', 'glass-boss'],
    ['2026-10-29', 'pitborn', 'glass-boss'], ['2026-12-31', 'arachne', 'double-damage'], ['2027-01-01', 'arachne', 'double-damage'], ['2028-02-29', 'arachne', 'slow-giant']];
  for (const [date, boss, modifier] of pins) { const p = pickFor(D, date); assert.deepEqual([p.boss, p.modifier.id], [boss, modifier], date); assert.deepEqual(pickFor(clone(D), date), p); }
  const salted = clone(D); salted.salt = 'dailypit2';
  assert.ok(Array.from({ length: 30 }, (_, i) => dayKey(Date.UTC(2026, 9, 1 + i))).some((d) => JSON.stringify(pickFor(salted, d)) !== JSON.stringify(pickFor(D, d))), 'the salt reshuffles the calendar');
  const seen = { b: new Set(), m: new Set() };
  for (let i = 0; i < 365; i++) { const p = pickFor(D, dayKey(Date.UTC(2026, 0, 1 + i))); seen.b.add(p.boss); seen.m.add(p.modifier.id); }
  assert.equal(seen.b.size, D.bosses.length, 'every boss comes round in a year'); assert.equal(seen.m.size, D.modifiers.length, 'every modifier comes round in a year');
});

test('a modifier is only ?tune= multipliers and a star level: the fight is built from the existing rows', () => {
  const base = tuneFrom(TUNE, '');
  for (const m of D.modifiers) {
    const run = runFor(D, '2026-10-28'); void run;
    const day = { ...runFor(D, '2026-10-28'), modifier: m, tune: Object.keys(m.tune).length ? { gargantua: { ...m.tune } } : {}, stars: m.stars };
    const merged = mergeTune(base, day.tune);
    const plain = kindFightFor('gargantua', ctxOf(base)), mod = kindFightFor('gargantua', ctxOf(merged), day.stars);
    const mult = (key) => m.tune[key] ?? 1;
    assert.ok(Math.abs(mod.resolved.foeHealthScale - plain.resolved.foeHealthScale * mult('health') * (STARS.levels[day.stars].healthX)) < 1e-9, `${m.id} health`);
    assert.ok(Math.abs(mod.resolved.foeDamageScale - plain.resolved.foeDamageScale * mult('damage') * (STARS.levels[day.stars].damageX)) < 1e-9, `${m.id} damage`);
    assert.ok(Math.abs((mod.opponent.speed ?? 1) - (plain.opponent.speed ?? 1) * mult('speed')) < 1e-9, `${m.id} speed`);
    assert.equal(mod.star ?? 0, day.stars);
    if (Object.keys(m.tune).length || m.stars) assert.notEqual(JSON.stringify(kindPractice(mod, ctxOf(merged), 7)), JSON.stringify(kindPractice(plain, ctxOf(base), 7)), `${m.id} changes the fight`);
  }
  const dd = D.modifiers.find((m) => m.id === 'double-damage');
  const p1 = kindPractice(kindFightFor('gargantua', ctxOf(base)), ctxOf(base), 7), p2 = kindPractice(kindFightFor('gargantua', ctxOf(mergeTune(base, { gargantua: dd.tune }))), ctxOf(mergeTune(base, { gargantua: dd.tune })), 7);
  assert.ok(Math.abs(p2.health - p1.health * 0.5) <= 1, `double damage both ways: he has half the health (my blows land twice as hard): ${p2.health} vs ${p1.health}`);   // the sim rounds his health to a whole number
});

test('a run lays the day\'s tune over the page\'s tune and escalation never enters: the daily is the same for everyone', () => {
  const run = runFor(D, '2026-10-28');
  assert.equal(run.boss, 'pitborn'); assert.equal(run.modifier.id, 'glass-boss');
  assert.deepEqual(run.tune, { pitborn: { health: 0.6, damage: 1.5 } });
  const urlTune = tuneFrom(TUNE, '?tune=minotaur.health:2');
  assert.deepEqual(mergeTune(urlTune, run.tune), { pitborn: { health: 1.2, damage: 1.5 } }, 'multiplied over ?tune=, not replacing it');
  const starRun = runFor(D, '2026-02-28');
  assert.deepEqual(starRun.tune, {}); assert.equal(starRun.stars, 1);
  assert.equal(mergeTune(urlTune, starRun.tune), urlTune, 'a modifier with no tune returns the page\'s tune itself');
  let s = freshSave(); for (const id of ['gargantua', 'arachne', 'pitborn']) s = recordKill(s, id, PROG).save;
  assert.notDeepEqual(escalation(s, PROG), {}, 'a save with kills would escalate (the page ignores it inside the daily)');
});

test('the daily zone is the day\'s one boss in the opener slot, and nothing else; the shipped zone rows are untouched', () => {
  const before = JSON.stringify(ringedZoneFor('')), run = runFor(D, '2026-11-01');
  const z = dailyZone(ringedZoneFor(''), run);
  assert.equal(z.spawns.length, 1);
  assert.deepEqual([z.spawns[0].id, z.spawns[0].kind, z.spawns[0].respawnSeconds], [D.spawnId, run.boss, D.respawnSeconds]);
  assert.deepEqual(z.spawns[0].position, ZONE1.spawns.find((s) => s.id === D.spawnId).position, 'same place as the opener\'s boss');
  assert.deepEqual(validateZone(z, PROFILES.profiles.map((p) => p.id), read('rig')), []);
  assert.equal(JSON.stringify(ringedZoneFor('')), before, 'the zone row is never mutated');
  assert.equal(JSON.stringify(zoneFor('')), JSON.stringify(zoneFor('')));
  const none = dailyZone(ZONE1, { ...run, spawnId: 'nowhere' });
  assert.equal(none, ZONE1, 'a missing slot leaves the zone as it is');
});

test('the score: a win is base less time and damage plus parts, held to min..max; a defeat is min', () => {
  const s = D.score;
  assert.equal(scoreOf(D, { timeSeconds: 60, damage: 50, parts: 6, won: true }), s.base - 60 * s.perSecond - 50 * s.perDamage + 6 * s.perPart);
  assert.equal(scoreOf(D, { timeSeconds: 0, damage: 0, parts: 99, won: true }), s.max);
  assert.equal(scoreOf(D, { timeSeconds: 9999, damage: 9999, parts: 0, won: true }), s.min);
  assert.equal(scoreOf(D, { timeSeconds: 10, damage: 0, parts: 6, won: false }), s.min);
  assert.ok(scoreOf(D, { timeSeconds: 40, damage: 20, parts: 6, won: true }) > scoreOf(D, { timeSeconds: 80, damage: 20, parts: 6, won: true }), 'faster scores more');
  assert.ok(scoreOf(D, { timeSeconds: 40, damage: 20, parts: 6, won: true }) > scoreOf(D, { timeSeconds: 40, damage: 90, parts: 6, won: true }), 'less damage scores more');
  assert.ok(scoreOf(D, { timeSeconds: 40, damage: 20, parts: 6, won: true }) > scoreOf(D, { timeSeconds: 40, damage: 20, parts: 0, won: true }), 'more parts score more');
  assert.equal(clock(95.34), '1:35.3'); assert.equal(clock(0), '0:00.0'); assert.equal(fill('{left} of {max} left', { left: 2, max: 3 }), '2 of 3 left');
});

const WHO = { boss: 'arachne', modifier: 'berserker' };
const frame = (dt, o = {}) => ({ dt, engaged: false, heroHealth: 150, won: false, lost: false, cuts: 0, ...o });
function play(frames) {
  let t = freshTracker(), spent = 0, row = null; const rows = [];
  for (const f of frames) { const out = stepTracker(t, f, D, WHO); t = out.t; if (out.spent) spent++; if (out.row) { row = out.row; rows.push(out.row); } }
  return { t, spent, row, rows };
}

test('the tracker: the attempt is spent at the first engage, time counts only while engaged, damage is every hit point lost, parts are the cut log\'s growth', () => {
  const idle = play(Array.from({ length: 100 }, () => frame(0.1)));
  assert.equal(idle.spent, 0); assert.equal(idle.t.phase, 'idle'); assert.equal(idle.row, null);
  const frames = [frame(0.1), frame(0.1, { engaged: true }), ...Array.from({ length: 99 }, (_, i) => frame(0.1, { engaged: true, heroHealth: i < 8 ? 150 : 120 }))];   // one blow of 30
  frames.push(frame(0.1, { engaged: true, heroHealth: 100 }));   // a second blow of 20
  frames.push(frame(0.1, { won: true, heroHealth: 100, cuts: 2 }));
  for (let i = 0; i < 70; i++) frames.push(frame(0.1, { won: true, heroHealth: 100, cuts: 2 + (i > 30 ? 3 : 0) }));
  const r = play(frames);
  assert.equal(r.spent, 1, 'spent once, at the first engage');
  assert.equal(r.rows.length, 1, 'one result, once');
  assert.equal(r.row.won, true);
  assert.equal(r.row.damage, 50);
  assert.equal(r.row.parts, 5, 'the cuts made while the result waits count');
  assert.ok(Math.abs(r.row.timeSeconds - 10.1) < 0.15, `time ${r.row.timeSeconds}`);
  assert.equal(r.row.score, scoreOf(D, r.row));
  assert.deepEqual([r.row.boss, r.row.modifier], ['arachne', 'berserker']);
  assert.equal(r.t.phase, 'done');
});

test('the tracker: the result waits resultDelaySeconds after the kill, and a fall is a defeat that scores nothing', () => {
  const won = [frame(0.1), frame(0.1, { engaged: true }), ...Array.from({ length: 20 }, () => frame(0.1, { won: true }))];
  const early = play(won);
  assert.equal(early.row, null, 'two seconds after the kill: no result yet'); assert.equal(early.t.phase, 'won');
  assert.ok(play([...won, ...Array.from({ length: 45 }, () => frame(0.1, { won: true }))]).row, 'after 6 seconds: the result');
  const lost = play([frame(0.1), frame(0.1, { engaged: true }), frame(0.1, { engaged: true, heroHealth: 0 }), ...Array.from({ length: 40 }, () => frame(0.1, { lost: true, heroHealth: 0, cuts: 4 }))]);
  assert.equal(lost.row.won, false); assert.equal(lost.row.score, D.score.min); assert.equal(lost.row.damage, 150);
  assert.equal(lost.rows.length, 1);
  const walkedOff = play([frame(0.1), frame(0.1, { engaged: true }), ...Array.from({ length: 50 }, () => frame(0.1, { engaged: false })), frame(0.1, { engaged: true }), frame(0.1, { won: true })]);
  assert.ok(Math.abs(walkedOff.t.time - 0.1) < 1e-9, 'time pauses while he is not engaged (a boss walking home): only the one engaged frame after the first counts');
});

test('the record: attempts per day, the best win of the day, the best ever, a new day resets the day but keeps the best ever', () => {
  const day = '2026-10-28', row = (score, won = true) => ({ score, timeSeconds: 50, damage: 10, parts: 6, won, boss: 'arachne', modifier: 'berserker' });
  let rec; assert.equal(attemptsLeft(D, rec, day), 3);
  rec = spendAttempt(rec, day); rec = spendAttempt(rec, day); assert.equal(attemptsLeft(D, rec, day), 1);
  let f = finishAttempt(rec, day, row(5000)); assert.equal(f.newBest, true); rec = f.rec;
  f = finishAttempt(rec, day, row(4000)); assert.equal(f.newBest, false); assert.equal(f.rec.best.score, 5000); assert.equal(f.rec.last.score, 4000); rec = f.rec;
  f = finishAttempt(rec, day, row(0, false)); assert.equal(f.newBest, false); assert.equal(f.rec.best.score, 5000, 'a defeat never replaces the best');
  f = finishAttempt(rec, day, row(7000)); assert.equal(f.newBest, true); rec = f.rec; assert.equal(rec.bestEver, 7000);
  rec = spendAttempt(rec, day); assert.equal(attemptsLeft(D, rec, day), 0); assert.equal(attemptsLeft(D, rec, '2026-10-29'), 3, 'the next UTC day has all its attempts');
  const next = recordFor(rec, '2026-10-29'); assert.deepEqual([next.attempts, next.best, next.bestEver], [0, null, 7000]);
  const wide = clone(D); wide.attemptsPerDay = 5; assert.equal(attemptsLeft(wide, undefined, day), 5, 'attempts per day is a data row');
});

test('the save: an old save loads without a daily field and writes back without one; a daily field round-trips; a corrupt one is dropped; the other fields survive', () => {
  const old = JSON.stringify({ v: 1, kills: { gargantua: 2 }, ladder: ['gargantua'], unlocked: ['gladius'], coins: 5, banked: 1, pile: null, lost: [] });
  const a = parseSave(old, PROG);
  assert.equal('daily' in a, false); assert.equal(a.kills.gargantua, 2);
  const store = memory(); store.setItem(PROG.key, old); assert.equal(writeSave(store, PROG, loadSave(store, PROG)), true);
  assert.equal('daily' in JSON.parse(store.getItem(PROG.key)), false, 'no daily field is written until there is one');
  const rec = finishAttempt(spendAttempt(undefined, '2026-10-28'), '2026-10-28', { score: 6100, timeSeconds: 45.5, damage: 30, parts: 4, won: true, boss: 'pitborn', modifier: 'glass-boss' }).rec;
  writeSave(store, PROG, { ...loadSave(store, PROG), daily: rec });
  const back = loadSave(store, PROG);
  assert.deepEqual(back.daily, rec); assert.equal(back.coins, 5); assert.deepEqual(back.ladder, ['gargantua']);
  const kept = recordKill(earn(back, CORPSE, 'arachne'), 'arachne', PROG).save;
  assert.deepEqual(kept.daily, rec, 'a kill and coins in the world leave the daily record alone');
  assert.deepEqual(dropPile(kept, CORPSE, { x: 1, z: 2 }, 'arachne', null).save.daily, rec);
  for (const bad of [null, 5, 'x', [], {}, { date: 'today', attempts: 1, bestEver: 0 }, { date: '2026-10-28', attempts: -1, bestEver: 0 }, { date: '2026-10-28', attempts: 1.5, bestEver: 0 }, { date: '2026-10-28', attempts: 1 }])
    assert.deepEqual(cleanDaily({ daily: bad }), {}, JSON.stringify(bad));
  const half = cleanDaily({ daily: { date: '2026-10-28', attempts: 2, bestEver: 10, best: { score: 'x' }, last: null } }).daily;
  assert.deepEqual([half.attempts, half.best, half.last], [2, null, null], 'a bad row is dropped, the counts stay');
  const corrupt = JSON.parse(old); corrupt.daily = { date: 'never' };
  assert.equal('daily' in parseSave(JSON.stringify(corrupt), PROG), false);
});

test('the hook: a finished attempt reaches every listener, one that throws never stops the rest, and unsubscribing works', () => {
  const got = [];
  const off1 = onResult((r) => got.push(['a', r.row.score])), off2 = onResult(() => { throw new Error('boom'); }), off3 = onResult((r) => got.push(['c', r.attempt]));
  const warn = console.warn; console.warn = () => {};
  try { emitResult({ date: '2026-10-28', boss: 'arachne', modifier: 'berserker', attempt: 2, row: { score: 123, timeSeconds: 1, damage: 0, parts: 0, won: true, boss: 'arachne', modifier: 'berserker' }, best: null, bestEver: 123, newBest: true }); } finally { console.warn = warn; }
  assert.deepEqual(got, [['a', 123], ['c', 2]]);
  off1(); off2(); off3();
  emitResult({ date: 'x', boss: 'b', modifier: 'm', attempt: 1, row: { score: 1, timeSeconds: 0, damage: 0, parts: 0, won: true, boss: 'b', modifier: 'm' }, best: null, bestEver: 1, newBest: false });
  assert.equal(got.length, 2);
  assert.match(D.event, /^frankendom:daily-pit-result$/);
});
