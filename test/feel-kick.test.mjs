// M7 knockback, shove and kick (data/feel-kick.json, src/fight/feel-kick.ts), opt-in ?feel=kick (src/fight/feel.ts). Presentation only: these pin the rows (validator ranges), the registration,
// the pure core (force by mass and stance, stagger vs knockdown, push, window) against the package's own fall seconds and physics.json's hit impulse, and the controller's Presentation, event and cue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadRules } from '@frankendom/physics';
import { validateFile } from '../src/sim/validate.js';
import { activeFeels } from '../src/fight/feel.ts';
import { createFeelKick, feelHooks, kickResult, kindOf, massOf, presentationOf, stanceOf, windowAt } from '../src/fight/feel-kick.ts';
import { FEEL_NAMES } from '../src/fight/feel-modules.ts';
import * as chunk from '../src/fight/feel-chunk.ts';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const ROWS = read('../data/feel-kick.json'), PHYSICS = read('../data/physics.json');
const clone = (x) => JSON.parse(JSON.stringify(x));
const kick = (o = {}) => kickResult(ROWS, { kickerKg: massOf(ROWS, 'hero'), targetKg: massOf(ROWS, 'pitborn'), stance: 'open', ...o });
const hit = (o = {}) => ({ tick: 700, type: 'Hit', actor: 0, target: 1, move: 'kick', location: 'torso', heading: 0, weapon: 'gladius', damage: 4, ...o });
const NONE = { swing: 0, recover: 0 };

test('the rows validate, and a bad row is refused (finite, ordered, #rrggbb, a move is a kick or a shove)', () => {
  assert.deepEqual(validateFile('feel-kick', ROWS), []);
  const bad = (f) => { const r = clone(ROWS); f(r); return validateFile('feel-kick', r).join('\n'); };
  assert.match(bad((r) => { r.extra = 1; }), /feel-kick\.extra: unknown key/);
  assert.match(bad((r) => { r.stance.open = null; }), /stance\.open/);
  assert.match(bad((r) => { r.massClamp = [3, 1]; }), /massClamp/);
  assert.match(bad((r) => { r.push.impulseClamp = [50, 10]; }), /impulseClamp/);
  assert.match(bad((r) => { r.track.swingS = 0; }), /track\.swingS/);
  assert.match(bad((r) => { r.fall.down = NaN; }), /fall\.down/);
  assert.match(bad((r) => { delete r.massKg.default; }), /massKg\.default/);
  assert.match(bad((r) => { r.window.knockdown.lengthS = 0; }), /window\.knockdown\.lengthS/);
  assert.match(bad((r) => { r.push.pushS = 0; }), /push\.pushS/);
  assert.match(bad((r) => { r.cue.color = 'red;}x{'; }), /cue\.color/);
  assert.match(bad((r) => { r.cue.yPct = 140; }), /cue\.yPct/);
  assert.match(bad((r) => { r.shove.moves.kick = { forceMult: 1, canKnockdown: true }; }), /a kick or a shove, not both/);
  assert.match(bad((r) => { r.shove.moves.skill_pommel.canKnockdown = 'no'; }), /canKnockdown/);
  assert.match(bad((r) => { r.event.log = 'a b'; }), /event\.log/);
});

test('the module is in the feel chunk as `kick` and its name is in FEEL_NAMES; nothing is active without the query', () => {
  assert.ok(FEEL_NAMES.includes('kick')); assert.equal(typeof chunk.kick.hit, 'function'); assert.equal(typeof chunk.kick.frame, 'function'); assert.equal(typeof chunk.kick.kill, 'function');
  assert.equal(chunk.kick, feelHooks);
  assert.equal(activeFeels('').length, 0); assert.equal(activeFeels('?feel=v1').length, 0);
});

test('presentation numbers match their sources: the fall seconds are the package\'s (0.5 s then 2 s down), the reference impulse is physics.json hit.impulse', () => {
  const pkg = loadRules().knockdown.fall_seconds;
  assert.equal(ROWS.fall.push, pkg.push); assert.equal(ROWS.fall.down, pkg.down); assert.deepEqual([pkg.push, pkg.down], [0.5, 2]);
  assert.equal(ROWS.push.refImpulse, PHYSICS.hit.impulse); assert.equal(ROWS.push.part, 'spine2');
  assert.equal(massOf(ROWS, 'hero'), 85); assert.equal(massOf(ROWS, 'nobody'), ROWS.massKg.default);
});

test('stance: a raised guard (the Hit flag) wins, then recovering, then mid-swing, else open', () => {
  assert.equal(stanceOf(NONE), 'open'); assert.equal(stanceOf({ swing: 0.3, recover: 0 }), 'midSwing'); assert.equal(stanceOf({ swing: 0.3, recover: 0.2 }), 'recovering');
  assert.equal(stanceOf({ swing: 0.3, recover: 0.2 }, true), 'guarding');
});

test('the hero\'s kick on the Pitborn: knockdown when he is open, mid-swing or recovering; only a stagger into a guard', () => {
  for (const s of ['open', 'midSwing', 'recovering']) assert.equal(kick({ stance: s }).outcome, 'knockdown', s);
  assert.equal(kick({ stance: 'guarding' }).outcome, 'stagger');
  assert.equal(kick().downS, 2.5, 'a knockdown lies the package\'s push fall + down'); assert.equal(kick({ stance: 'guarding' }).downS, 0);
  assert.ok(kick().force >= ROWS.knockdownAt && kick({ stance: 'guarding' }).force < ROWS.knockdownAt);
});

test('force grows with the kicker\'s mass and shrinks with the target\'s; the mass ratio and the impulse are clamped', () => {
  assert.ok(kick({ kickerKg: 40 }).force < kick().force && kick().force < kick({ kickerKg: 200 }).force);
  assert.ok(kick({ targetKg: 60 }).force > kick({ targetKg: 200 }).force);
  assert.equal(kick({ kickerKg: 1e9 }).massRatio, ROWS.massClamp[1]); assert.equal(kick({ kickerKg: 1e-9 }).massRatio, ROWS.massClamp[0]);
  assert.equal(kick({ kickerKg: 1e9 }).impulse, ROWS.push.impulseClamp[1]);
  const tight = kickResult({ ...ROWS, push: { ...ROWS.push, impulseClamp: [30, 40] } }, { kickerKg: 1e-9, targetKg: 80, stance: 'guarding' });
  assert.equal(tight.impulse, 30, 'the lower clamp holds');
});

test('a light man cannot drop a heavy one open-footed; a heavy one drops a light one open, but a raised guard still braces it', () => {
  assert.equal(kick({ kickerKg: 40, targetKg: 200 }).outcome, 'stagger');
  assert.equal(kick({ kickerKg: 200, targetKg: 60 }).outcome, 'knockdown');
  assert.equal(kick({ kickerKg: 200, targetKg: 60, stance: 'guarding' }).outcome, 'stagger');
});

test('push: distance and velocity follow the force and the push seconds; a knockdown pushes further and lifts', () => {
  const k = kick(), g = kick({ stance: 'guarding' });
  assert.ok(k.pushDistanceM > g.pushDistanceM && k.lift > g.lift && k.impulse > g.impulse);
  assert.ok(Math.abs(k.pushVelocityMs - k.pushDistanceM / ROWS.push.pushS) < 1e-9);
  for (const v of [k.force, k.impulse, k.lift, k.pushDistanceM, k.pushVelocityMs]) assert.ok(Number.isFinite(v));
});

test('the finisher window: a stagger\'s opens at once, a knockdown\'s after he has fallen, both close, and a knockdown\'s ends before he is back up', () => {
  const s = kick({ stance: 'guarding' }).window, d = kick().window;
  assert.equal(windowAt(s, 0), true); assert.equal(windowAt(s, s.startS + s.lengthS), false);
  assert.equal(windowAt(d, 0), false); assert.equal(windowAt(d, d.startS + 0.01), true); assert.equal(windowAt(d, d.startS + d.lengthS + 0.01), false);
  assert.ok(d.startS + d.lengthS <= ROWS.fall.push + ROWS.fall.down);
});

test('a shove (the pommel strike) is a smaller push that never knocks down; other moves are not ours', () => {
  const s = kindOf(ROWS, 'skill_pommel'); assert.equal(s.canKnockdown, false);
  const r = kick({ ...s, kickerKg: 400 });
  assert.equal(r.outcome, 'stagger'); assert.ok(r.force > ROWS.knockdownAt, 'the force alone would have dropped him: only the row stops it');
  assert.ok(kick({ ...s }).impulse < kick().impulse);
  assert.equal(kindOf(ROWS, 'kick').canKnockdown, true); assert.equal(kindOf(ROWS, 'light_right'), null); assert.equal(kindOf(ROWS, undefined), null);
});

test('the Presentation is what ragdoll.ts react() takes: a knockdown by push for the fall + down seconds, the impulse scaled over the hit impulse', () => {
  const p = presentationOf(ROWS, kick()), g = presentationOf(ROWS, kick({ stance: 'guarding' }));
  assert.deepEqual([p.action, p.cause, p.downS, p.cut, p.deferredKill], ['knockdown', 'push', 2.5, null, false]);
  assert.ok(Math.abs(p.scale * PHYSICS.hit.impulse - kick().impulse) < 1e-9);
  assert.deepEqual([g.action, g.downS], ['stagger', 0]);
});

function rig() {
  const emitted = [], shown = [], ctl = createFeelKick(ROWS, { cueHost: { show: (on) => shown.push(on) } });
  return { emitted, shown, ctl, ctx: { emit: (n, p) => emitted.push([n, p]), foeId: 'pitborn' } };
}

test('the controller: a kick on an open foe is a knockdown Presentation, emits feel:kick_result, opens the cue after the fall and closes it', () => {
  delete globalThis[ROWS.event.log];
  const { emitted, shown, ctl, ctx } = rig(), p = ctl.react(hit(), ctx);
  assert.equal(p.action, 'knockdown');
  assert.equal(emitted.length, 1); assert.equal(emitted[0][0], 'feel:kick_result');
  assert.deepEqual([emitted[0][1].outcome, emitted[0][1].finisherWindowS, emitted[0][1].stance], ['knockdown', ROWS.window.knockdown.lengthS, 'open']);
  assert.equal(globalThis[ROWS.event.log].length, 1); assert.equal(emitted[0][1].presentationOnly, true, 'the event promises no sim window');
  for (const k of ['about']) assert.match(ROWS[k], /PLACEHOLDER/); assert.match(ROWS.stance.about, /PLACEHOLDER/); assert.match(ROWS.window.about, /PLACEHOLDER/);
  assert.doesNotMatch(JSON.stringify(ROWS), /feel-sim\.json/, 'no wording that points at a file that does not exist yet');
  ctl.frame(0.1); assert.deepEqual(shown, [], 'not yet: he is still falling');
  ctl.frame(ROWS.window.knockdown.startS); assert.deepEqual(shown, [true]);
  ctl.frame(ROWS.window.knockdown.lengthS + 0.1); assert.deepEqual(shown, [true, false]); assert.equal(ctl.debug.windowOpen, false);
});

test('the controller tracks his stance from the sim\'s events: mid-swing after AttackStarted, recovering after Staggered, guarding on a guarded Hit; other hits and targets are left alone', () => {
  delete globalThis[ROWS.event.log];
  const { emitted, ctl, ctx } = rig(), stance = () => emitted.at(-1)[1].stance;
  ctl.frame(0.016, [{ tick: 1, type: 'AttackStarted', actor: 1, move: 'light_right' }]); ctl.react(hit(), ctx); assert.equal(stance(), 'midSwing');
  ctl.frame(1.0, []); ctl.react(hit(), ctx); assert.equal(stance(), 'open', 'the swing timer ran out');
  ctl.frame(0.016, [{ tick: 2, type: 'Staggered', actor: 1, ticks: 20 }]); ctl.react(hit(), ctx); assert.equal(stance(), 'recovering');
  ctl.frame(1.0, []); ctl.react(hit({ guarded: true }), ctx); assert.equal(stance(), 'guarding');
  const n = emitted.length;
  assert.equal(ctl.react(hit({ move: 'light_right' }), ctx), null); assert.equal(ctl.react(hit({ target: 0 }), ctx), null); assert.equal(ctl.react(hit({ type: 'Blocked' }), ctx), null);
  assert.equal(emitted.length, n);
});

test('the controller: the event list keeps the newest rows.event.keep; a kill ends the window; rows.on false is silent', () => {
  delete globalThis[ROWS.event.log];
  const { shown, ctl, ctx } = rig();
  for (let i = 0; i < ROWS.event.keep + 5; i++) ctl.react(hit({ tick: i }), ctx);
  const list = globalThis[ROWS.event.log]; assert.equal(list.length, ROWS.event.keep); assert.equal(list.at(-1).tick, ROWS.event.keep + 4);
  ctl.frame(ROWS.window.knockdown.startS + 0.1); ctl.kill(); assert.deepEqual(shown, [true, false]);
  assert.equal(createFeelKick({ ...ROWS, on: false }).react(hit(), ctx), null);
});

function fakeCtx(state = 'alive') {
  const calls = [], blends = [], c = { rd: { state, knockdown: (k, h) => calls.push(['knockdown', k, h]), stagger: (h) => calls.push(['stagger', h]) }, group: { rotation: { y: 0 } }, partBones: { hips: {}, head: {} }, emit() {}, blendToward: (s) => blends.push(s) };
  return { calls, blends, c };
}

test('the hit hook drives the ragdoll: a knockdown by push along his facing (turned by the group\'s yaw), a stagger into a guard', () => {
  const { calls, c } = fakeCtx(), ctl = createFeelKick(ROWS, { cueHost: { show() {} } });
  ctl.hit(hit({ heading: Math.PI / 2 }), { ...c, group: { rotation: { y: Math.PI / 2 } } });
  assert.deepEqual(calls[0].slice(0, 2), ['knockdown', 'push']); assert.equal(calls[0][2].part, 'spine2');
  assert.ok(Math.abs(calls[0][2].impulse[0]) < 1e-9 && calls[0][2].impulse[2] > 0 && calls[0][2].impulse[1] === ROWS.push.lift.knockdown);
  ctl.hit(hit({ guarded: true }), c); assert.equal(calls[1][0], 'stagger');
  const n = calls.length; ctl.hit(hit({ move: 'light_right' }), c); ctl.hit(hit({ heading: undefined }), c); assert.equal(calls.length, n, 'only kicks and shoves reach the ragdoll');
  assert.equal(calls.filter((x) => x[0] === 'knockdown').length, 1);
});

test('the frame hook: bones follow the ragdoll every frame he is knocked down, then ease back to the clip over getUpS', () => {
  const ctl = createFeelKick(ROWS, { cueHost: { show() {} } }), down = fakeCtx('knockdown'), up = fakeCtx('alive');
  ctl.hit(hit(), down.c);
  ctl.frame(0.016, [], down.c); ctl.frame(0.016, [], down.c);
  assert.equal(down.blends.length, 2); assert.deepEqual(down.blends[0], { hips: 1, head: 1 });
  ctl.frame(ROWS.getUpS / 2, [], up.c); ctl.frame(ROWS.getUpS, [], up.c);
  assert.equal(up.blends.length, 2); assert.ok(up.blends[0].hips < 1 && up.blends[0].hips > 0, 'easing'); assert.equal(up.blends[1].hips, 0);
  ctl.frame(0.016, [], up.c); assert.equal(up.blends.length, 2, 'then the clip alone');
  const { c } = fakeCtx(); ctl.hit(hit(), c); ctl.kill(); const k = fakeCtx('knockdown'); ctl.frame(0.016, [], k.c); assert.equal(k.blends.length, 0, 'a kill ends it');
});
