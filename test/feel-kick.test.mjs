// M7 knockback, shove and kick (data/feel-kick.json, src/fight/feel-kick.ts), opt-in ?feel=kick. Presentation only: these pin the rows (validator ranges), the query,
// the pure core (force by mass and stance, stagger vs knockdown, push, window) against the package's own fall seconds, and the controller's calls and event.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadRules } from '@frankendom/physics';
import { validateFile } from '../src/sim/validate.js';
import { createFeelKick, feelKickOn, kickResult, kindOf, massOf, stanceOf, windowAt } from '../src/fight/feel-kick.ts';

const ROWS = JSON.parse(readFileSync(new URL('../data/feel-kick.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const pkg = loadRules().knockdown.fall_seconds, FALL = { push: pkg.push, down: pkg.down };
const kick = (o = {}) => kickResult(ROWS, FALL, { kickerKg: massOf(ROWS, 'hero'), targetKg: massOf(ROWS, 'pitborn'), stance: 'open', ...o });
const hit = (o = {}) => ({ tick: 700, type: 'Hit', actor: 0, target: 1, move: 'kick', location: 'torso', heading: 0, weapon: 'gladius', damage: 4, ...o });

test('the rows validate, and a bad row is refused (finite, ordered, known stance, #rrggbb)', () => {
  assert.deepEqual(validateFile('feel-kick', ROWS), []);
  const bad = (f) => { const r = clone(ROWS); f(r); return validateFile('feel-kick', r).join('\n'); };
  assert.match(bad((r) => { r.extra = 1; }), /feel-kick\.extra: unknown key/);
  assert.match(bad((r) => { r.stance.open = null; }), /stance\.open/);
  assert.match(bad((r) => { r.massClamp = [3, 1]; }), /massClamp/);
  assert.match(bad((r) => { r.push.impulseClamp = [50, 10]; }), /impulseClamp/);
  assert.match(bad((r) => { r.phase.guard = 'blocking'; }), /phase\.guard: unknown stance/);
  assert.match(bad((r) => { delete r.massKg.default; }), /massKg\.default/);
  assert.match(bad((r) => { r.window.knockdown.lengthS = 0; }), /window\.knockdown\.lengthS/);
  assert.match(bad((r) => { r.push.pushS = 0; }), /push\.pushS/);
  assert.match(bad((r) => { r.cue.color = 'red;}x{'; }), /cue\.color/);
  assert.match(bad((r) => { r.shove.moves.kick = { forceMult: 1, canKnockdown: true }; }), /a kick or a shove, not both/);
  assert.match(bad((r) => { r.shove.moves.skill_pommel.canKnockdown = 'no'; }), /canKnockdown/);
  assert.match(bad((r) => { r.event.log = 'a b'; }), /event\.log/);
});

test('the query: only ?feel=kick turns it on (the default fight is unchanged)', () => {
  assert.equal(feelKickOn(ROWS, '?feel=kick'), true);
  for (const s of ['', '?feel=v1', '?feel=', '?rules=m4', '?feel=Kick']) assert.equal(feelKickOn(ROWS, s), false, s);
  assert.equal(feelKickOn({ ...ROWS, on: false }, '?feel=kick'), false);
});

test('mass: rows by id, the default for an unknown one; the package falls 0.5 s then stays down 2 s', () => {
  assert.equal(massOf(ROWS, 'hero'), 85); assert.equal(massOf(ROWS, 'nobody'), ROWS.massKg.default);
  assert.deepEqual(FALL, { push: 0.5, down: 2 });
});

test('stance: a raised guard (the Hit flag) wins, then the sim phase through the rows, else open', () => {
  assert.equal(stanceOf(ROWS, 'ready'), 'open'); assert.equal(stanceOf(ROWS, 'guard'), 'guarding'); assert.equal(stanceOf(ROWS, 'attack'), 'midSwing');
  for (const p of ['hurt', 'roll', 'backstep']) assert.equal(stanceOf(ROWS, p), 'recovering');
  assert.equal(stanceOf(ROWS, 'ready', true), 'guarding'); assert.equal(stanceOf(ROWS, undefined), 'open'); assert.equal(stanceOf(ROWS, 'weird'), 'open');
});

test('the hero\'s kick on the Pitborn: knockdown when he is open, mid-swing or recovering; only a stagger into a guard', () => {
  for (const s of ['open', 'midSwing', 'recovering']) assert.equal(kick({ stance: s }).outcome, 'knockdown', s);
  assert.equal(kick({ stance: 'guarding' }).outcome, 'stagger');
  const k = kick();
  assert.equal(k.downS, 2.5, 'a knockdown lies the package\'s push fall + down');
  assert.equal(kick({ stance: 'guarding' }).downS, 0);
  assert.ok(k.force >= ROWS.knockdownAt && kick({ stance: 'guarding' }).force < ROWS.knockdownAt);
});

test('force grows with the kicker\'s mass and shrinks with the target\'s; the mass ratio is clamped', () => {
  const light = kick({ kickerKg: 40 }).force, mid = kick().force, heavy = kick({ kickerKg: 200 }).force;
  assert.ok(light < mid && mid < heavy);
  assert.ok(kick({ targetKg: 60 }).force > kick({ targetKg: 200 }).force);
  assert.equal(kick({ kickerKg: 1e9 }).massRatio, ROWS.massClamp[1]); assert.equal(kick({ kickerKg: 1e-9 }).massRatio, ROWS.massClamp[0]);
  assert.equal(kick({ kickerKg: 1e9 }).impulse, ROWS.push.impulseClamp[1], 'the impulse is clamped');
  assert.ok(kick({ kickerKg: 1e-9, stance: 'guarding' }).impulse >= ROWS.push.impulseClamp[0]);
  const tight = kickResult({ ...ROWS, push: { ...ROWS.push, impulseClamp: [30, 40] } }, FALL, { kickerKg: 1e-9, targetKg: 80, stance: 'guarding' });
  assert.equal(tight.impulse, 30, 'the lower clamp holds');
});

test('a light man cannot drop a heavy one open-footed; a heavy one drops a light one open, but a raised guard still braces it', () => {
  assert.equal(kick({ kickerKg: 40, targetKg: 200 }).outcome, 'stagger');
  assert.equal(kick({ kickerKg: 200, targetKg: 60 }).outcome, 'knockdown');
  assert.equal(kick({ kickerKg: 200, targetKg: 60, stance: 'guarding' }).outcome, 'stagger');
});

test('push: distance and velocity follow the force and the push seconds; a knockdown pushes further and lifts', () => {
  const k = kick(), g = kick({ stance: 'guarding' });
  assert.ok(k.pushDistanceM > g.pushDistanceM);
  assert.ok(Math.abs(k.pushVelocityMs - k.pushDistanceM / ROWS.push.pushS) < 1e-9);
  assert.ok(k.lift > g.lift && k.impulse > g.impulse);
  for (const v of [k.force, k.impulse, k.lift, k.pushDistanceM, k.pushVelocityMs]) assert.ok(Number.isFinite(v));
});

test('the finisher window: a stagger\'s opens at once, a knockdown\'s after he has fallen, and both close', () => {
  const s = kick({ stance: 'guarding' }).window, d = kick().window;
  assert.equal(windowAt(s, 0), true); assert.equal(windowAt(s, s.startS + s.lengthS), false);
  assert.equal(windowAt(d, 0), false); assert.equal(windowAt(d, d.startS + 0.01), true); assert.equal(windowAt(d, d.startS + d.lengthS + 0.01), false);
  assert.ok(d.startS + d.lengthS <= FALL.push + FALL.down, 'the window ends before he is back up (the package\'s fall + down)');
});

test('a shove (the pommel strike) is a smaller push that never knocks down; other moves are not ours', () => {
  const s = kindOf(ROWS, 'skill_pommel'); assert.equal(s.canKnockdown, false);
  const r = kick({ ...s, kickerKg: 400, stance: 'open' });
  assert.equal(r.outcome, 'stagger'); assert.ok(r.force > ROWS.knockdownAt, 'the force alone would have dropped him: only the row stops it');
  assert.ok(kick({ ...s }).impulse < kick().impulse);
  assert.equal(kindOf(ROWS, 'kick').canKnockdown, true); assert.equal(kindOf(ROWS, 'light_right'), null); assert.equal(kindOf(ROWS, undefined), null);
});

function rig() {
  const calls = [], shown = [];
  const rd = { stagger: (h) => calls.push(['stagger', h]), knockdown: (k, h) => calls.push(['knockdown', k, h]) };
  const ctl = createFeelKick(ROWS, { cueHost: { show: (on) => shown.push(on) } });
  return { calls, shown, rd, ctl };
}

test('the controller: a kick on an open foe knocks him down (push), emits the named event, opens then closes the cue', () => {
  delete globalThis[ROWS.event.log];
  const { calls, shown, rd, ctl } = rig();
  assert.equal(ctl.hit(hit(), { foeId: 'pitborn', foePhase: 'ready', frameYaw: 0, rd, fall: FALL }), true);
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'knockdown'); assert.equal(calls[0][1], 'push');
  assert.equal(calls[0][2].part, ROWS.push.part); assert.ok(calls[0][2].impulse[2] > 0 && Math.abs(calls[0][2].impulse[0]) < 1e-9, 'pushed along the kicker\'s facing (heading 0 = +z)');
  const [ev] = globalThis[ROWS.event.log];
  assert.equal(ev.type, 'feel:kick_result'); assert.equal(ev.outcome, 'knockdown'); assert.equal(ev.finisherWindowS, ROWS.window.knockdown.lengthS); assert.equal(ev.stance, 'open');
  ctl.frame(0.1); assert.deepEqual(shown, [], 'not yet: he is still falling');
  ctl.frame(ROWS.window.knockdown.startS); assert.deepEqual(shown, [true]);
  ctl.frame(ROWS.window.knockdown.lengthS + 0.1); assert.deepEqual(shown, [true, false]);
  assert.equal(ctl.debug.windowOpen, false);
});

test('the controller: into a raised guard it is a stagger, the heading turns by the frame, other hits and other targets are left alone', () => {
  delete globalThis[ROWS.event.log];
  const { calls, rd, ctl } = rig();
  assert.equal(ctl.hit(hit({ guarded: true, heading: Math.PI / 2 }), { foeId: 'pitborn', frameYaw: Math.PI / 2, rd, fall: FALL }), true);
  assert.equal(calls[0][0], 'stagger'); assert.ok(calls[0][1].impulse[2] > 0, 'heading minus the frame\'s yaw');
  assert.equal(globalThis[ROWS.event.log][0].stance, 'guarding');
  const ctx = { foeId: 'pitborn', frameYaw: 0, rd, fall: FALL };
  assert.equal(ctl.hit(hit({ move: 'light_right' }), ctx), false); assert.equal(ctl.hit(hit({ target: 0 }), ctx), false); assert.equal(ctl.hit(hit({ type: 'Blocked' }), ctx), false);
  assert.equal(calls.length, 1);
});

test('the controller: the event list keeps the newest rows.event.keep; a kill ends the window', () => {
  delete globalThis[ROWS.event.log];
  const { shown, rd, ctl } = rig();
  for (let i = 0; i < ROWS.event.keep + 5; i++) ctl.hit(hit({ tick: i }), { foeId: 'pitborn', frameYaw: 0, rd, fall: FALL });
  const list = globalThis[ROWS.event.log]; assert.equal(list.length, ROWS.event.keep); assert.equal(list.at(-1).tick, ROWS.event.keep + 4);
  ctl.frame(ROWS.window.knockdown.startS + 0.1); ctl.kill(); assert.deepEqual(shown, [true, false]);
});
