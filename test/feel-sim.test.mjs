// The SIM knockdown + finish window (data/feel-sim.json, src/fight/knock-sim.ts, the step in duel.ts), behind ?feel=kick. Pins: the rows validate and a bad row is refused; the pure core (mass band x stance x move,
// whole integers); with the flag OFF a kick steps byte for byte as before (no KnockedDown, no `down` field); with it ON a kick on an open man knocks him down for knockdown + getUp seconds of his own ticks,
// opens the attacker's finish window (Fighter.critical), cannot knock him again while he rises, survives a later stagger, and a second fight's clock is untouched (per-boss real time, no dilation).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFile } from '../src/sim/validate.js';
import { KNOCK_TICK_HZ, bandOf, knockForce, knockSimFor, knockStance, knockdownOf, legCount, legHitsAfter, setKnockSim } from '../src/fight/knock-sim.ts';
import { createFighter, idleIntent, opponentFighter, stepDuel } from '../src/fight/duel.ts';
import { OPPONENTS } from '../src/fight/moves.ts';
import { STEP } from '../src/fight/sim.ts';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const ROWS = read('../data/feel-sim.json'), clone = (x) => JSON.parse(JSON.stringify(x));
const ON = () => knockSimFor(ROWS, '?feel=kick'), TICKS = (s) => Math.round(s * ROWS.tickHz);
afterEach(() => setKnockSim(null));

test('the rows validate; a bad row is refused (ticks, per-mille, bands from 0, the window inside the time he is down)', () => {
  assert.deepEqual(validateFile('feel-sim', ROWS), []);
  const bad = (f) => { const r = clone(ROWS); f(r); return validateFile('feel-sim', r).join('\n'); };
  assert.match(bad((r) => { r.extra = 1; }), /feel-sim\.extra: unknown key/);
  assert.match(bad((r) => { r.knockdown.seconds = 0; }), /knockdown\.seconds/);
  assert.match(bad((r) => { r.getUp.seconds = 0.001; }), /getUp\.seconds/);
  assert.match(bad((r) => { r.finishWindow.seconds = 9; }), /finishWindow\.seconds: must be <=/);
  assert.match(bad((r) => { r.finishWindow.seconds = r.knockdown.seconds + 0.1; }), /finishWindow\.seconds: must be <= knockdown\.seconds/, 'a window longer than the fall alone would run into the rise');
  assert.deepEqual(validateFile('feel-sim', (() => { const r = clone(ROWS); r.finishWindow.seconds = r.knockdown.seconds; return r; })()), [], 'equal to the fall is allowed');
  assert.match(bad((r) => { r.tickHz = 30; }), /tickHz/);
  assert.match(bad((r) => { r.targets = ['boss']; }), /targets/);
  assert.match(bad((r) => { r.knockdownAtPerMille = 1.5; }), /knockdownAtPerMille/);
  assert.match(bad((r) => { r.massBands[0].minRatioPct = 5; }), /massBands\[0\]/);
  assert.match(bad((r) => { r.massBands[2].minRatioPct = 10; }), /strictly rising/);
  assert.match(bad((r) => { r.stance.open = NaN; }), /stance\.open/);
  assert.match(bad((r) => { delete r.massKg.default; }), /massKg\.default/);
  assert.match(bad((r) => { r.moves.kick.extra = 1; }), /moves\.kick\.extra/);
  assert.match(bad((r) => { r.moves.kick.perMille = 1000; }), /moves\.kick\.perMille.*must be 0/, '(a) a kick row that knocks down by force is refused');
  assert.match(bad((r) => { r.kick.interruptSeconds = 0; }), /kick\.interruptSeconds/); assert.match(bad((r) => { r.kick.resistanceSeconds = -1; }), /kick\.resistanceSeconds/);
  assert.match(bad((r) => { r.kick.cooldownSeconds = 99; }), /kick\.cooldownSeconds/); assert.match(bad((r) => { r.kick.extra = 1; }), /kick\.extra/);
  assert.match(bad((r) => { r.kickOnInjuredLeg.hits = 0; }), /kickOnInjuredLeg\.hits/); assert.match(bad((r) => { r.kickOnInjuredLeg.hits = 1.5; }), /kickOnInjuredLeg\.hits/);
  assert.match(bad((r) => { r.kickOnInjuredLeg.windowS = 0; }), /kickOnInjuredLeg\.windowS/); assert.match(bad((r) => { delete r.kickOnInjuredLeg; }), /kickOnInjuredLeg/);
  assert.match(bad((r) => { r.knockdown.minSecondsBetween = -1; }), /knockdown\.minSecondsBetween/);
  assert.throws(() => knockSimFor({ ...ROWS, kick: { ...ROWS.kick, interruptSeconds: 0 } }, '?feel=kick'), /kick\.interruptSeconds/); assert.throws(() => knockSimFor({ ...ROWS, kickOnInjuredLeg: { hits: 0, windowS: 15 } }, '?feel=kick'), /kickOnInjuredLeg/);
  assert.deepEqual([ON().interrupt, ON().resist, ON().kickCd, ON().gap, ON().legHits, ON().legWin], [TICKS(ROWS.kick.interruptSeconds), TICKS(ROWS.kick.resistanceSeconds), TICKS(ROWS.kick.cooldownSeconds), TICKS(ROWS.knockdown.minSecondsBetween), ROWS.kickOnInjuredLeg.hits, TICKS(ROWS.kickOnInjuredLeg.windowS)], 'the rows as ticks');
  assert.match(bad((r) => { r.moves = {}; }), /moves/);
});

test('the row tickHz is the sim step; every entry move is a move the sim can start; every mass row is the hero, the default or a real opponent', () => {
  assert.equal(ROWS.tickHz, KNOCK_TICK_HZ); assert.equal(STEP, 1 / ROWS.tickHz);
  const STARTABLE = ['kick', 'heavy_overhead', 'heavy_riposte', 'heavy_counter', 'heavy_right', 'heavy_left', 'heavy_thrust'];   // duel.ts moveOf: the kick and the heavy class (not the critical, which is the finisher)
  for (const m of Object.keys(ROWS.moves)) assert.ok(STARTABLE.includes(m), `${m} is an entry move`);
  for (const id of Object.keys(ROWS.massKg)) assert.ok(id === 'default' || id === 'hero' || OPPONENTS[id], `${id} is an opponent`);
});

test('the page parses the rows only when asked: ?feel=kick (also among others); a bad row throws, never defaults', () => {
  assert.equal(knockSimFor(ROWS, ''), null); assert.equal(knockSimFor(ROWS, '?feel=clash'), null); assert.equal(knockSimFor(undefined, '?feel=kick'), null);
  const k = knockSimFor(ROWS, '?feel=clash,kick');
  assert.deepEqual([k.down, k.getUp, k.window, k.at, k.foe, k.hero], [TICKS(ROWS.knockdown.seconds), TICKS(ROWS.getUp.seconds), TICKS(ROWS.finishWindow.seconds), ROWS.knockdownAtPerMille, true, false]);
  assert.throws(() => knockSimFor({ ...ROWS, tickHz: 30 }, '?feel=kick'), /tickHz/);
  assert.throws(() => knockSimFor({ ...ROWS, finishWindow: { seconds: 9 } }, '?feel=kick'), /longer than knockdown\.seconds/);
  assert.throws(() => knockSimFor({ ...ROWS, finishWindow: { seconds: ROWS.knockdown.seconds + 0.1 } }, '?feel=kick'), /longer than knockdown\.seconds/);
  assert.throws(() => knockSimFor({ ...ROWS, massBands: [{ minRatioPct: 10, perMille: 900 }] }, '?feel=kick'), /start at minRatioPct 0/);
});

test('the core: mass band x stance x move in whole per-mille; a held guard braces a kick, an open man falls; no second knockdown while he rises; the hero is out until the row lists him', () => {
  const k = ON();
  assert.equal(bandOf(k.bands, 85, 120), 800); assert.equal(bandOf(k.bands, 120, 80), 1250); assert.equal(bandOf(k.bands, 80, 80), 950); assert.equal(bandOf(k.bands, 10, 80), 600);
  const f = (o) => knockForce(k, { move: 'kick', attackerId: 'hero', targetId: 'default', stance: 'open', ...o });
  assert.equal(f({}), 0, '(b) a kick is an interrupt: its force row is 0, whatever the masses and the stance');
  assert.equal(f({ targetId: 'pitborn' }), 0, '(b) not even on an open Pitborn (the old 1120 that dropped him on every kick)');
  assert.equal(f({ move: 'heavy_overhead' }), 1064, 'a heavy is 800 per mille of 950 x 1400');
  assert.equal(f({ move: 'light_right' }), 0, 'a light blow is not an entry');
  assert.equal(f({ targetId: 'pitborn', move: 'heavy_overhead' }), 896, 'a plain heavy on an open Pitborn does not drop him');
  const hit = (o) => knockdownOf(k, { move: 'heavy_overhead', attackerId: 'hero', targetId: 'default', stance: 'open', targetIsHero: false, rising: false, ...o });
  assert.deepEqual(hit({}), { force: 1064, ticks: k.down + k.getUp, window: k.window, leg: false });
  assert.equal(hit({ stance: 'guarding' }), null, 'a held guard braces the heavy');
  assert.equal(hit({ move: 'kick' }), null, '(b) a clean kick on an open man never drops him');
  assert.equal(hit({ rising: true }), null); assert.equal(hit({ targetIsHero: true }), null);
  assert.equal(hit({ cooling: true }), null, '(g) inside minSecondsBetween no cause drops him again');
  assert.equal(hit({ cooling: true, injured: true }), null, '(g) not even the injured leg');
  assert.deepEqual(hit({ move: 'kick', injured: true, stance: 'guarding' }), { force: 0, ticks: k.down + k.getUp, window: k.window, leg: true }, '(f) an injured leg drops him on the next blow, a kick included, guard or not');
  assert.ok(knockdownOf({ ...k, hero: true }, { move: 'heavy_overhead', attackerId: 'default', targetId: 'hero', stance: 'open', targetIsHero: true, rising: false }), 'the hero can be a target when the row lists him');
  assert.equal(knockStance('guard', true), 'guarding'); assert.equal(knockStance('attack', false), 'midSwing'); assert.equal(knockStance('hurt', false), 'recovering'); assert.equal(knockStance('ready', false), 'open');
});

// A hero at the origin facing +z and a foe 0.9 m ahead facing him, both ready.
const duelOf = (foeId = 'veteran') => {
  const hero = createFighter({ x: 0, z: 0, heading: 0, distance: 0 }, 'ready'), foe = opponentFighter(OPPONENTS[foeId], { x: 0, z: 0.9, heading: Math.PI, distance: 0 }, 'ready');
  return { tick: 0, fighters: [hero, foe], finish: null, events: [] };
};
const KICK = { ...idleIntent(), action: 'kick' };
const runKick = (max = 120) => {   // step until the kick's Hit lands on the foe; returns the duel at that tick and every event seen
  let d = duelOf(), seen = [];
  for (let t = 0; t < max; t++) { d = stepDuel(d, [t === 0 ? KICK : idleIntent(), idleIntent()]); seen = seen.concat(d.events); if (seen.some((e) => e.type === 'Hit' && e.target === 1)) return { d, seen, t }; }
  throw new Error('the kick never landed');
};

test('flag OFF: a whole short run is identical whether the page never asked or asked for another feel; a kick lands as before (no KnockedDown, no down field, no finish window)', () => {
  const run = () => { let d = duelOf(), out = []; for (let t = 0; t < 150; t++) { d = stepDuel(d, [t % 40 === 0 ? KICK : idleIntent(), idleIntent()]); out.push(JSON.stringify(d)); } return out; };
  setKnockSim(null); const base = run();
  setKnockSim(knockSimFor(ROWS, '?feel=clash')); assert.deepEqual(run(), base, 'a page without ?feel=kick steps the baseline, tick for tick');
  assert.ok(base.every((s) => !s.includes('KnockedDown') && !s.includes('"down"')));
  setKnockSim(ON()); assert.notDeepEqual(run(), base, 'the flag does change the run (the test can tell)');
  setKnockSim(null);
  const { d, seen } = runKick();
  assert.ok(!seen.some((e) => e.type === 'KnockedDown')); assert.equal(d.fighters[1].down, undefined); assert.equal(d.fighters[0].critical, 0);
});

const HEAVY = { ...idleIntent(), action: 'heavy' };
const runBlow = (intent, max = 200, foeId = 'veteran') => {   // step until the blow lands on the foe; the foe never defends
  let d = duelOf(foeId), seen = [];
  for (let t = 0; t < max; t++) { d = stepDuel(d, [t === 0 ? intent : idleIntent(), idleIntent()]); seen = seen.concat(d.events); if (seen.some((e) => e.type === 'Hit' && e.target === 1)) return { d, seen, t }; }
  throw new Error('the blow never landed');
};

test('flag ON (c): a kick on an open foe INTERRUPTS him (KickInterrupted, the row\'s stagger) and never knocks him down', () => {
  setKnockSim(ON());
  const { d, seen } = runKick(), ev = seen.find((e) => e.type === 'KickInterrupted');
  assert.ok(ev, 'a KickInterrupted event'); assert.deepEqual([ev.actor, ev.target, ev.move, ev.ticks], [0, 1, 'kick', TICKS(ROWS.kick.interruptSeconds)]);
  assert.ok(!seen.some((e) => e.type === 'KnockedDown'), 'no fall'); assert.equal(d.fighters[1].down, undefined); assert.equal(d.fighters[0].critical, 0, 'no finish window');
  assert.equal(d.fighters[1].phase, 'hurt'); assert.equal(d.fighters[1].interruptCd, TICKS(ROWS.kick.resistanceSeconds));
});

test('flag ON (d)(e): he resists the next interrupt for resistanceSeconds (the kick still hits, no stagger); the kicker waits cooldownSeconds for his next kick', () => {
  setKnockSim(ON());
  const kicks = []; let d = duelOf(), seen = [];   // spam a kick every tick; the sim refuses it while the kicker cools down or is busy
  for (let t = 0; t < TICKS(6); t++) { d = stepDuel(d, [KICK, idleIntent()]); for (const e of d.events) { seen.push(e); if (e.type === 'AttackStarted' && e.move === 'kick') kicks.push(e.tick); } }
  const interrupts = seen.filter((e) => e.type === 'KickInterrupted').map((e) => e.tick), hits = seen.filter((e) => e.type === 'Hit' && e.move === 'kick');
  assert.ok(kicks.length >= 3, 'the kicker kicked again and again'); for (let i = 1; i < kicks.length; i++) assert.ok(kicks[i] - kicks[i - 1] >= TICKS(ROWS.kick.cooldownSeconds), `(e) kicks ${kicks[i - 1]} and ${kicks[i]} are at least cooldownSeconds apart`);
  assert.ok(hits.length > interrupts.length, '(d) more kicks landed than interrupted: the rest were resisted');
  for (let i = 1; i < interrupts.length; i++) assert.ok(interrupts[i] - interrupts[i - 1] >= TICKS(ROWS.kick.resistanceSeconds), `(d) interrupts ${interrupts[i - 1]} and ${interrupts[i]} are at least resistanceSeconds apart`);
  assert.ok(interrupts.length >= 2, '(d) once the resistance ran out a kick interrupts again');
  assert.ok(!seen.some((e) => e.type === 'KnockedDown'), '(b) spammed kicks are interrupts only: not one fall');
});

test('flag ON (f): the 7th leg hit inside the window injures the leg; the NEXT blow, a kick, drops him (KnockedDown injured), and the count resets', () => {
  setKnockSim(ON());
  const K = ON(), drop = (legHits) => { const d0 = duelOf(); d0.fighters[1].legHits = legHits; setKnockSim(ON()); let d = d0, seen = []; for (let t = 0; t < 120; t++) { d = stepDuel(d, [t === 0 ? KICK : idleIntent(), idleIntent()]); seen = seen.concat(d.events); if (seen.some((e) => e.type === 'Hit' && e.target === 1)) break; } return { d, seen }; };
  const stamp = (n) => Array.from({ length: n }, () => 0);   // leg hits at tick 0: the kick lands a few ticks later, well inside the window
  const six = drop(stamp(K.legHits - 1)); assert.ok(!six.seen.some((e) => e.type === 'KnockedDown'), 'one hit short of the row: a kick is only an interrupt');
  const seven = drop(stamp(K.legHits)), ev = seven.seen.find((e) => e.type === 'KnockedDown');
  assert.ok(ev && ev.injured === true && ev.move === 'kick', 'the blow after the 7th drops him'); assert.equal(ev.ticks, K.down + K.getUp);
  assert.equal(seven.d.fighters[1].legHits, undefined, 'the count resets'); assert.equal(seven.d.fighters[1].downCd, K.gap, '(g) the no-chain guard starts');
  assert.equal(seven.d.fighters[0].critical, K.window);
  const old = drop(Array.from({ length: K.legHits }, () => -(K.legWin + 100)));
  assert.ok(!old.seen.some((e) => e.type === 'KnockedDown'), 'seven hits that left the window do not count');
  assert.ok(!seven.seen.some((e) => e.type === 'LegInjured'), 'a torso kick is not a leg hit: no LegInjured');
});

test('flag ON (f): the leg count is the sim\'s own ticks: a hit exactly a window old has dropped out; the next hit joins the live ones', () => {
  const K = ON(), at = (n, t) => Array.from({ length: n }, () => t);
  assert.equal(legCount(at(K.legHits, 0), K.legWin, K.legWin), 0); assert.equal(legCount(at(K.legHits, 0), K.legWin - 1, K.legWin), K.legHits); assert.equal(legCount(undefined, 5, K.legWin), 0);
  assert.deepEqual(legHitsAfter([0, 5, 100], 5 + K.legWin, K.legWin), [100, 5 + K.legWin], 'the hits a window old or older drop out, the new one joins');
  assert.deepEqual(legHitsAfter([0, 5], 10, K.legWin), [0, 5, 10], 'inside the window every hit is kept');
});

test('flag ON (g): a clean heavy on an open foe drops him for knockdown + getUp seconds of his own ticks and opens the finish window; no second fall inside minSecondsBetween', () => {
  setKnockSim(ON());
  const { d, seen } = runBlow(HEAVY), ev = seen.find((e) => e.type === 'KnockedDown');
  assert.ok(ev, 'a KnockedDown event'); assert.deepEqual([ev.actor, ev.target, ev.move], [0, 1, 'heavy_overhead']); assert.equal(ev.injured, undefined);
  assert.equal(d.fighters[1].downCd, TICKS(ROWS.knockdown.minSecondsBetween), 'the no-chain guard runs');
  const total = TICKS(ROWS.knockdown.seconds) + TICKS(ROWS.getUp.seconds);
  assert.equal(ev.ticks, total); assert.equal(ev.window, TICKS(ROWS.finishWindow.seconds));
  assert.equal(d.fighters[1].phase, 'hurt'); assert.equal(d.fighters[1].down, total); assert.ok(d.fighters[1].stun >= total);
  assert.equal(d.fighters[0].critical, TICKS(ROWS.finishWindow.seconds), 'the hero\'s next heavy is the critical');
  let e = d, n = 0, windowEnd = -1;
  while (e.fighters[1].phase === 'hurt' && n < total + 5) { e = stepDuel(e, [idleIntent(), idleIntent()]); n++; if (windowEnd < 0 && e.fighters[0].critical === 0) windowEnd = n; }
  assert.equal(n, total, 'down + getUp, to the tick'); assert.equal(windowEnd, TICKS(ROWS.finishWindow.seconds), 'the window runs its own seconds'); assert.equal(e.fighters[1].down, undefined);
});

test('flag ON: a stagger on a downed man does not stand him up early; another fight is on its own clock (no dilation, no lock)', () => {
  setKnockSim(ON());
  const { d } = runBlow(HEAVY), total = d.fighters[1].down;
  let e = d; for (let i = 0; i < 10; i++) e = stepDuel(e, [idleIntent(), idleIntent()]);
  const left = e.fighters[1].down; assert.equal(left, total - 10);
  let p = { ...e, fighters: [e.fighters[0], { ...e.fighters[1], phase: 'hurt', age: 0, stun: 5 }] }, n = 0;   // the sim's own stagger resets age and sets a short stun
  while (p.fighters[1].phase === 'hurt' && n < total + 5) { p = stepDuel(p, [idleIntent(), idleIntent()]); n++; }
  assert.equal(n, left, `he stays down his remaining ${left} ticks, not 5`);
  let o = duelOf(); for (let i = 0; i < 30; i++) o = stepDuel(o, [idleIntent(), idleIntent()]);
  assert.equal(o.tick, 30); assert.equal(o.fighters[1].down, undefined, 'a second boss is untouched by the first one\'s count');
});
