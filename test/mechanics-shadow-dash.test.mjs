// Kachujin's SHADOW DASH (src/fight/mechanics/kachujin-shadow-dash.ts, data/mechanics.json "shadow-dash"): the row validates, the registry and the rows agree, and on the real duel sim the dash
// covers the right distance, stops at the cutting gap, cuts once if you stood on the line, cuts nothing if you left it, opens a recovery window, obeys the cooldown and is cancelled by a stagger or a kill.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkMechanics, validateFile } from '../src/sim/validate.js';
import { initialDuel, stepDuel, idleIntent } from '../src/fight/duel.ts';
import { OPPONENTS } from '../src/fight/moves.ts';
import { stepDash, freshDash, DASH_ROW as ROW } from '../src/fight/mechanics/kachujin-shadow-dash.ts';
import { MECHANICS, mechanicOfKind } from '../src/fight/mechanics/registry.ts';
import { M } from '../src/fight/detmath.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const FILE = read('mechanics'), RINGS = read('rings');
const STEP = 1 / 60;

// a duel with the hero at the origin and the boss `gap` metres ahead (+z), the open-world wall
const open = (gap) => ({ ...initialDuel(OPPONENTS.pitborn, undefined, null, { hero: { x: 0, z: 0 }, foe: { x: 0, z: gap }, heroFacing: 0 }), radius: 1e6 });
const placed = (gap) => { const d = open(6); return { ...d, fighters: [d.fighters[0], { ...d.fighters[1], body: { ...d.fighters[1].body, z: gap } }] }; };   // any gap, beyond the pose check
const dist = (d) => M.hypot(d.fighters[0].body.x - d.fighters[1].body.x, d.fighters[0].body.z - d.fighters[1].body.z);
// run n ticks; `hero(tick, s)` returns the hero's intent; the warden's own intent is idle (the brain is not under test)
function play(duel, s, n, hero = () => idleIntent(), row = ROW) {
  const log = [];
  for (let i = 0; i < n; i++) {
    const before = duel;
    duel = stepDash(s, duel, idleIntent(), (w) => stepDuel(before, [hero(before.tick, s, before), w]), row);
    log.push({ tick: before.tick, phase: s.phase, gap: dist(duel), bossX: duel.fighters[1].body.x, bossZ: duel.fighters[1].body.z, events: duel.events });
  }
  return { duel, log };
}
const started = (log) => log.filter((l) => l.events.some((e) => e.type === 'AttackStarted' && e.actor === 1));
const ready = (s) => ({ ...s, nextAt: 0 });

test('the shipped mechanics file validates, ids have checks, rings name only known ids, the registry has code for each row', () => {
  assert.deepEqual(validateFile('mechanics', FILE), []);
  for (const b of RINGS.bosses) if (b.mechanic !== null) assert.ok(FILE.mechanics[b.mechanic], `${b.kind}: ${b.mechanic} has a row`);
  assert.deepEqual(Object.keys(MECHANICS).sort(), Object.keys(FILE.mechanics).sort(), 'registry ids == row ids');
  assert.equal(mechanicOfKind('kachujin')?.id, 'shadow-dash');
  assert.equal(mechanicOfKind('minotaur'), undefined);
  assert.equal(mechanicOfKind('goblin-mob'), undefined, 'trash mobs have none');
  assert.equal(mechanicOfKind(undefined), undefined);
});

test('a bad row is refused with its name; a row with no check cannot ship', () => {
  const bad = (f) => { const j = clone(FILE); f(j.mechanics['shadow-dash']); return checkMechanics(j).join('\n'); };
  assert.match(bad((r) => { r.tellTicks = 3; }), /tellTicks/);
  assert.match(bad((r) => { r.lockBeforeTicks = r.tellTicks; }), /lockBeforeTicks must be below tellTicks/);
  assert.match(bad((r) => { r.stopGapM = 3; r.slashReachM = 2; }), /stopGapM must not exceed slashReachM/);
  assert.match(bad((r) => { r.dashSpeedMps = 4; r.dashMaxTicks = 4; }), /must cover triggerMaxM/);
  assert.match(bad((r) => { r.fx.ghostTint = 'blue'; }), /ghostTint/);
  assert.match(bad((r) => { r.typo = 1; }), /typo: unknown key/);
  assert.match(bad((r) => { r.slashAction = 'spin'; }), /slashAction/);
  const j = clone(FILE); j.mechanics.mystery = {}; assert.match(checkMechanics(j).join('\n'), /mystery: no row check/);
});

test('stood still on the line: tell, a dash of the right length that ends at the cutting gap, one cut, a recovery window, then the cooldown', () => {
  const s = ready(freshDash()), { log } = play(open(6), s, 400);
  const phases = log.map((l) => l.phase), firstDash = phases.indexOf('dash'), tell = phases.indexOf('tell');
  assert.ok(tell >= 0 && firstDash - tell >= ROW.tellTicks - 1, 'a readable tell comes before the dash');
  const dashTicks = log.filter((l) => l.phase === 'dash' || (l.phase === 'slash' && l.tick < log[firstDash].tick + ROW.dashMaxTicks + 2)).length;
  assert.ok(dashTicks <= ROW.dashMaxTicks + 2);
  const atEnd = log[phases.indexOf('slash') - 1];
  assert.ok(Math.abs(atEnd.gap - ROW.stopGapM) < 0.15, `ends ${atEnd.gap} m from the hero, stop gap ${ROW.stopGapM}`);
  const travelled = 6 - atEnd.gap, perTick = ROW.dashSpeedMps * STEP;
  assert.ok(travelled > 4 && travelled <= ROW.dashMaxTicks * perTick + 1e-6, `dash distance ${travelled}`);
  assert.equal(started(log).length >= 1, true, 'he cuts');
  assert.equal(started(log).filter((l) => l.tick < log[firstDash].tick + 120).length, 1, 'exactly one cut in the cycle');
  assert.ok(phases.includes('recover'), 'a recovery window follows');
  const rec = log.filter((l) => l.phase === 'recover'), cutAt = started(log)[0].tick;
  assert.equal(rec.length <= ROW.recoverTicks + 1, true);
  assert.ok(rec.every((l) => !l.events.some((e) => e.type === 'AttackStarted' && e.actor === 1)), 'he starts nothing while recovering');
  assert.ok(cutAt > log[firstDash].tick, 'the cut comes after the dash');
});

test('he waits out the cooldown, then dashes again; the first dash waits firstDelayTicks', () => {
  const s = freshDash(), d = open(6), { log } = play(d, s, 80);
  assert.ok(log.every((l) => l.phase === 'idle'), 'nothing before firstDelayTicks');
  // the hero holds about 5 m from him between dashes (walks back out when close, in when far)
  const s2 = ready(freshDash()), back = (tick, st, d) => { const at = dist(d); return st.phase !== 'idle' ? idleIntent() : { ...idleIntent(), move: { x: 0, z: at < 4.5 ? -1 : at > 5.5 ? 1 : 0, yaw: 0, run: false } }; };
  const { log: l2 } = play(open(6), s2, 1400, back);
  const tells = l2.filter((l, i) => l.phase === 'tell' && (i === 0 || l2[i - 1].phase !== 'tell')).map((l) => l.tick);
  assert.ok(tells.length >= 2 && tells[1] - tells[0] >= ROW.cooldownTicks, `tells at ${tells.join(', ')}`);
});

test('outside the trigger band he does not start (too near, too far)', () => {
  for (const gap of [ROW.triggerMinM - 0.8, ROW.triggerMaxM + 2]) {
    const { log } = play(placed(gap), ready(freshDash()), 40);
    assert.ok(log.every((l) => l.phase === 'idle'), `gap ${gap}`);
  }
});

test('leaving the line after it locks: the dash overshoots, no cut, and he is open for the whole recovery', () => {
  const s = ready(freshDash());
  const away = (tick, st) => (st.locked ? { ...idleIntent(), move: { x: 1, z: 0, yaw: 0, run: true } } : idleIntent());   // run sideways the moment the line locks
  const { log } = play(open(6), s, 300, away);
  assert.ok(log.some((l) => l.phase === 'dash'));
  assert.equal(started(log).length, 0, 'no cut at a hero who left the line');
  const rec = log.filter((l) => l.phase === 'recover');
  assert.ok(rec.length >= ROW.recoverTicks - 2, `recovery window ${rec.length} ticks`);
});

test('the line follows you until it locks, then stays put', () => {
  const s = ready(freshDash());
  let d = open(6);
  const seen = [];
  for (let i = 0; i < ROW.tellTicks + 2; i++) {
    const before = d, hero = i < 10 ? { ...idleIntent(), move: { x: 0.5, z: 0, yaw: 0, run: false } } : idleIntent();
    d = stepDash(s, d, idleIntent(), (w) => stepDuel(before, [hero, w]));
    seen.push({ phase: s.phase, locked: s.locked, lineX: s.lineX });
  }
  const lockedAt = seen.findIndex((x) => x.locked);
  assert.ok(lockedAt >= ROW.tellTicks - ROW.lockBeforeTicks - 2 && seen.slice(lockedAt).every((x) => x.lineX === seen[lockedAt].lineX));
});

test('a stagger cancels it into the cooldown; a kill or a finished duel stops it dead', () => {
  const s = ready(freshDash()), d0 = open(6), { duel } = play(d0, s, 20);
  assert.equal(s.phase, 'tell');
  const hurt = { ...duel, fighters: [duel.fighters[0], { ...duel.fighters[1], phase: 'hurt' }] };
  stepDash(s, hurt, idleIntent(), (w) => stepDuel(hurt, [idleIntent(), w]));
  assert.equal(s.phase, 'idle'); assert.ok(s.nextAt > duel.tick);
  const t = ready(freshDash()), { duel: mid } = play(open(6), t, 20);
  const dead = { ...mid, finish: { victim: 1, location: 'torso', move: 'light', heading: 0 } };
  stepDash(t, dead, idleIntent(), (w) => stepDuel(dead, [idleIntent(), w]));
  assert.equal(t.phase, 'idle', 'the corpse is not dashed');
});

test('the same fight twice is the same fight (deterministic)', () => {
  const a = play(open(6), ready(freshDash()), 300), b = play(open(6), ready(freshDash()), 300);
  assert.deepEqual(a.log.map((l) => [l.phase, l.bossX, l.bossZ]), b.log.map((l) => [l.phase, l.bossX, l.bossZ]));
});
