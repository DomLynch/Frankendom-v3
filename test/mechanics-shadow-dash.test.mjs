// KACHUJIN'S SHADOW DASH (data/mechanics.json "shadow-dash", src/fight/mechanics/kachujin-shadow-dash.ts; Dom 2026-10-28: each boss its own fighting identity). The row validates, the registry and the rows agree, and the
// move plays through the real sim (stepPractice with the mechanic's layer, then settle, as the page does): the tell and its line, the lock, a dash of the right length that ends at the cutting gap, ONE cut at a hero who
// stood on the line, NO cut at a hero who left it (runs off it, or rolls off it), a recovery in which he starts nothing, the cooldown row, and a stagger, a kill or a new duel stopping it cleanly.
// The boss's own brain is not under test: whenever the mechanic is not acting the warden stands still, so every blow in these runs is the mechanic's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stepPractice } from '../src/fight/combat.ts';
import { distance, idleIntent } from '../src/fight/duel.ts';
import { kindFightFor, kindPractice } from '../src/fight/spawn-kind.ts';
import { createShadowDash } from '../src/fight/mechanics/kachujin-shadow-dash.ts';
import { MECHANICS, createMechanics } from '../src/fight/mechanics/index.ts';
import { validateMechanics, validateFile } from '../src/sim/validate.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const FIGHT = read('fight'), PROFILES = read('profiles'), DIFF = read('difficulty'), BRAINS = read('brains'), MECH = read('mechanics'), RINGS = read('rings');
const ROW = MECH.mechanics['shadow-dash'];
const ctx = { profiles: PROFILES.profiles, difficulty: DIFF, brains: BRAINS.brains, pick: DIFF.default, search: '', level: FIGHT.level, ai: FIGHT.ai, override: null, weapon: FIGHT.weapon, skill: FIGHT.skill, skill2: FIGHT.skill2, stance: FIGHT.stance, specials: FIGHT.specials };
const KACH = kindFightFor('kachujin', ctx);

/** A fight against Kachujin with the hero `gap` metres from him in the open (no pit wall). `row` overrides; `first` is the opening delay. `hero(tick, mech)` is the hero's intent each tick. */
function fight(gap, { row = {}, first = 10, hero = () => idleIntent() } = {}) {
  let practice = kindPractice(KACH, ctx, 731, { hero: { x: 0, z: gap }, foe: { x: 0, z: 0 }, heroFacing: Math.PI });
  const drawn = { ...practice.duel.fighters[0], phase: 'ready' };   // the hero has his sword out, as in the open world (a roll is legal)
  practice = { ...practice, duel: { ...practice.duel, radius: 1e6, fighters: [drawn, practice.duel.fighters[1]] } };
  const mech = createShadowDash({ ...ROW, firstTicks: first, ...row });
  const layer = (duel, warden) => { const out = mech.layer(duel, warden); return out === warden ? idleIntent() : out; };
  const stages = [], starts = [], hits = [], dashes = [];   // stages: [tick, name]; starts: ticks his attacks began; hits: what reached the hero
  const step = () => {
    const it = hero(practice.duel.tick, mech, api);
    const prior = practice, before = mech.view();
    practice = stepPractice(prior, it, KACH.ai, layer);
    const moved = mech.settle(prior.duel, practice.duel);
    if (moved !== practice.duel) practice = { ...practice, duel: moved, fighters: moved.fighters, fighter: moved.fighters[0].body, enemy: moved.fighters[1].body };
    const v = mech.view(), st = v ? v.stage : 'idle', tick = practice.duel.tick;
    if (stages.at(-1)?.[1] !== st) stages.push([tick, st]);
    if (before?.stage === 'lunge' || v?.stage === 'lunge') dashes.push({ tick, hero: { x: practice.duel.fighters[0].body.x, z: practice.duel.fighters[0].body.z }, boss: { x: practice.duel.fighters[1].body.x, z: practice.duel.fighters[1].body.z }, gap: distance(practice.duel.fighters[0].body, practice.duel.fighters[1].body) });
    for (const e of practice.duel.events) {
      if (e.type === 'AttackStarted' && e.actor === 1) starts.push(tick);
      if ((e.type === 'Hit' || e.type === 'GuardBroken') && e.actor === 1 && e.target === 0) hits.push([tick, e.type, e.move, e.damage]);
    }
    return v;
  };
  const api = { mech, stages, starts, hits, dashes, step, get practice() { return practice; }, set practice(p) { practice = p; } };
  return api;
}
const runFor = (f, n) => { for (let i = 0; i < n; i++) f.step(); return f; };
/** Put the hero at (x, z) in the open (a test's own placement: the pose check of a fresh duel refuses short gaps, and a hero left beside him never leaves the trigger band). */
const place = (f, x, z) => { const d = f.practice.duel, hero = { ...d.fighters[0], body: { ...d.fighters[0].body, x, z } }; f.practice = { ...f.practice, duel: { ...d, fighters: [hero, d.fighters[1]] }, fighter: hero.body }; };
/** A hero who steps back to `gap` metres from him between moves (the mechanic is idle and he stands too close to trigger it again). */
const backOff = (gap) => (t, m, f) => {
  const [h, b] = f.practice.duel.fighters, lunge = f.stages.findLast((s) => s[1] === 'lunge');   // the cut and the recovery draw nothing: wait out the whole move (it ends well inside 150 ticks of the dash)
  if (!m.view() && (!lunge || t - lunge[0] > 150) && distance(h.body, b.body) < gap - 0.5) place(f, b.body.x, b.body.z + gap);
  return idleIntent();
};
const sideways = (run = true) => ({ ...idleIntent(), move: { x: 1, z: 0, yaw: 0, run } });

test('the row validates, every row has a maker, and the boss that names it is the row\'s boss', () => {
  assert.deepEqual(validateFile('mechanics', MECH), []);
  assert.deepEqual(validateMechanics(MECH, PROFILES.profiles.map((p) => p.id)), []);
  for (const [id, row] of Object.entries(MECH.mechanics)) assert.ok(MECHANICS[row.type], `${id}: code for type ${row.type}`);
  assert.equal(RINGS.bosses.find((b) => b.kind === 'kachujin').mechanic, 'shadow-dash', 'Kachujin wears the Shadow Dash');
  assert.equal(MECH.mechanics['shadow-dash'].boss, 'kachujin');
  const reg = createMechanics();
  assert.equal(reg.of('kachujin').boss, 'kachujin');
  assert.equal(typeof reg.of('kachujin').layer, 'function');
  assert.equal(typeof reg.of('kachujin').settle, 'function');
  assert.ok(ROW.stopGapM <= ROW.slashReachM, 'he stops inside his own cut');
});

test('the validator names a bad row', () => {
  for (const [key, bad] of [['tellTicks', 3], ['lockBeforeTicks', 42], ['stopGapM', 3], ['dashSpeedMps', 4], ['dashMaxTicks', 4], ['slashAction', 'spin'], ['lineColour', 'orange'], ['extra', 1], ['triggerMinM', 9], ['cooldownTicks', 1.5]]) {
    const rows = clone(MECH); rows.mechanics['shadow-dash'][key] = bad;
    assert.ok(validateMechanics(rows).length > 0, `${key}=${bad} is refused`);
  }
  const noAbout = clone(MECH); delete noAbout.mechanics['shadow-dash'].about;
  assert.match(validateMechanics(noAbout).join('\n'), /shadow-dash\.about/);
});

test('stood still on the line: a readable tell, the line locks, a dash that ends at the cutting gap, ONE cut that lands, a recovery in which he starts nothing, then the cooldown', () => {
  const f = runFor(fight(6, { hero: backOff(6) }), 900);
  const names = f.stages.map((s) => s[1]);
  assert.deepEqual(names.slice(0, 4), ['idle', 'tell', 'lunge', 'idle'], JSON.stringify(f.stages));
  const at = (n) => f.stages.find((s) => s[1] === n)[0];
  assert.ok(at('lunge') - at('tell') >= ROW.tellTicks - 1, 'a tell of tellTicks comes before the dash');
  const dash = f.dashes.filter((d) => d.tick >= at('lunge') && d.tick <= at('lunge') + ROW.dashMaxTicks + 1), end = dash.at(-1);
  assert.ok(dash.length <= ROW.dashMaxTicks + 1, 'the dash runs no longer than dashMaxTicks');
  assert.ok(Math.abs(end.gap - ROW.stopGapM) < 0.2, `he ends ${end.gap.toFixed(2)} m from the hero (stop gap ${ROW.stopGapM})`);
  assert.ok(6 - end.gap > 3.5 && 6 - end.gap <= ROW.dashMaxTicks * ROW.dashSpeedMps / 60 + 1e-6, `dash distance ${(6 - end.gap).toFixed(2)}`);
  const cycle = f.starts.filter((t) => t < at('lunge') + 120);
  assert.equal(cycle.length, 1, `exactly one cut in the cycle (${cycle})`);
  assert.ok(cycle[0] >= end.tick, 'the cut comes after the dash');
  assert.ok(f.hits.some((h) => h[0] < at('lunge') + 120 && h[3] > 0), 'the cut landed through the sim\'s own hit row');
  assert.ok(f.practice.duel.fighters[0].health > 0, 'no instant kill');
  const tells = f.stages.filter((s) => s[1] === 'tell');
  assert.ok(tells.length >= 2 && tells[1][0] - tells[0][0] >= ROW.cooldownTicks, `the cooldown row spaces the next one (tells at ${tells.map((t) => t[0])})`);
});

test('the first dash waits firstTicks; outside the trigger band he does not start', () => {
  const f = runFor(fight(6, { first: ROW.firstTicks }), ROW.firstTicks - 5);
  assert.ok(f.stages.every((s) => s[1] === 'idle'), 'nothing before firstTicks');
  for (const gap of [ROW.triggerMinM - 0.8, ROW.triggerMaxM + 2]) {
    const g = fight(6); place(g, 0, gap); runFor(g, 60);
    assert.ok(g.stages.every((s) => s[1] === 'idle'), `gap ${gap}: no tell`);
  }
});

test('leaving the line after it locks: the dash overshoots, no cut at a hero who left the line, and he is open for the whole recovery', () => {
  for (const [name, hero] of [['running off it', (t, m) => (m.view()?.lock ? sideways(true) : idleIntent())], ['walking off it', (t, m) => (m.view()?.lock ? sideways(false) : idleIntent())]]) {
    const f = runFor(fight(6, { hero }), 120);
    assert.ok(f.stages.some((s) => s[1] === 'lunge'), `${name}: he dashed`);
    assert.equal(f.starts.length, 0, `${name}: no cut at a hero who left the line (cuts at ${f.starts})`);
    assert.equal(f.hits.length, 0, `${name}: nothing landed`);
  }
});

test('a roll off the line when it locks: he dashes and the hero is not hurt (a roll off the line must dodge the cut)', () => {
  for (const side of [1, -1]) {
    let rolled = false;
    const hero = (t, m) => { if (m.view()?.lock && !rolled) { rolled = true; return { ...idleIntent(), move: { x: side, z: 0, yaw: 0, run: false }, action: 'dodge' }; } return idleIntent(); };
    const f = runFor(fight(6, { hero }), 140);
    assert.ok(rolled, 'the line locked');
    assert.ok(Math.abs(f.dashes.at(-1).hero.x) > ROW.slashReachM, `the roll really moved him off the line (${f.dashes.at(-1).hero.x.toFixed(2)} m)`);   // a roll that never happened (a sheathed hero) would be cut, and the check would pass for the wrong reason
    assert.ok(f.stages.some((s) => s[1] === 'lunge'), `side ${side}: he dashed`);
    assert.equal(f.hits.length, 0, `side ${side}: the roll took the hero clear (hits ${JSON.stringify(f.hits)}, cuts at ${f.starts})`);
  }
});

test('a hero who stands on the line is cut; a roll through the cut as it starts dodges it', () => {
  const stand = runFor(fight(6), 140);
  assert.equal(stand.starts.length, 1, 'he cuts a hero who stands on the line');
  assert.ok(stand.hits.length >= 1, 'and it lands');
  let rolled = false;
  const hero = (t, m, f) => {   // stand on the line; the moment the cut starts, roll sideways through it
    const foe = f.practice.duel.fighters[1];
    if (!rolled && f.starts.length === 1 && foe.phase === 'attack') { rolled = true; return { ...idleIntent(), move: { x: 1, z: 0, yaw: 0, run: false }, action: 'dodge' }; }
    return idleIntent();
  };
  const f = runFor(fight(6, { hero }), 140);
  assert.ok(rolled, 'the cut started');
  assert.equal(f.hits.length, 0, `the roll took the hero through it (${JSON.stringify(f.hits)})`);
});

test('the line follows the hero until it locks, then stays put', () => {
  const f = fight(6, { hero: (t, m, g) => { if (!m.view()?.lock) { const h = g.practice.duel.fighters[0].body; place(g, h.x + 0.05, h.z); } return idleIntent(); } });   // he drifts sideways until the lock
  const seen = [];
  for (let i = 0; i < ROW.tellTicks + 4; i++) { const v = f.step(); if (v?.stage === 'tell') seen.push({ lock: v.lock, dx: v.dx, dz: v.dz, x: v.x, z: v.z, len: v.length }); }
  const lockedAt = seen.findIndex((x) => x.lock);
  assert.ok(lockedAt > 0 && lockedAt >= ROW.tellTicks - ROW.lockBeforeTicks - 2, `locked after ${lockedAt} ticks of tell`);
  const first = seen[lockedAt];
  assert.ok(seen.slice(lockedAt).every((x) => x.dx === first.dx && x.dz === first.dz && x.len === first.len), 'frozen once locked');
  assert.ok(seen.slice(0, lockedAt).some((x) => x.dx !== first.dx), 'it followed the hero before the lock');
});

test('a stagger cancels it into the cooldown; a kill, a dead hero or a new duel stops it dead', () => {
  const w = idleIntent();
  const midTell = () => { const f = fight(6); for (let i = 0; i < 400 && f.mech.view()?.stage !== 'tell'; i++) f.step(); for (let i = 0; i < 5; i++) f.step(); assert.equal(f.mech.view()?.stage, 'tell'); return f; };
  const a = midTell(), d = a.practice.duel;
  a.practice = { ...a.practice, duel: { ...d, fighters: [d.fighters[0], { ...d.fighters[1], phase: 'hurt' }] } };
  a.step();
  assert.equal(a.mech.view(), null, 'staggered: cancelled');
  const stagedAt = a.practice.duel.tick;
  runFor(a, ROW.cooldownTicks - 30);
  assert.ok(!a.stages.some((s) => s[1] === 'tell' && s[0] > stagedAt), 'the cooldown follows a stagger');
  const b = midTell(), db = b.practice.duel;
  assert.equal(b.mech.layer({ ...db, fighters: [db.fighters[0], { ...db.fighters[1], phase: 'dead', health: 0 }] }, w), w, 'a fallen boss: the warden\'s own intent');
  assert.equal(b.mech.view(), null);
  const c = midTell(), dc = c.practice.duel;
  assert.equal(c.mech.layer({ ...dc, fighters: [{ ...dc.fighters[0], health: 0, phase: 'dead' }, dc.fighters[1]] }, w), w, 'a dead hero');
  const e = midTell(), de = e.practice.duel;
  assert.equal(e.mech.layer({ ...de, finish: { victim: 1, location: 'torso', move: 'light', heading: 0 } }, w), w, 'a finished duel');
  const g = midTell();
  g.mech.layer({ ...g.practice.duel, tick: 0 }, w);   // the clock ran backwards: a new duel
  assert.equal(g.mech.view(), null, 'a new duel starts the mechanic over');
});

test('the layer and settle leave an idle fight alone; the same fight twice is the same fight', () => {
  const f = fight(6, { first: 500 });
  const w = idleIntent();
  assert.equal(f.mech.layer(f.practice.duel, w), w, 'idle: the same object');
  assert.equal(f.mech.settle(f.practice.duel, f.practice.duel), f.practice.duel, 'nothing moved: the same duel');
  const trace = () => { const g = runFor(fight(6), 200); return [g.stages, g.dashes.map((d) => [d.tick, d.boss.x, d.boss.z])]; };
  assert.deepEqual(trace(), trace());
});
