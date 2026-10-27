// ?feel=hitreact (src/fight/feel-hitreact.ts, data/feel-hitreact.json): the pure core (zone, side, impulse split, depth curve) and the stateful part against a mock ragdoll.
// Presentation only: nothing here touches the sim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHitReact, depthAt, feelHooks as HOOKS, planHit, sectorOf, strengthsAt } from '../src/fight/feel-hitreact.ts';
import { activeFeels } from '../src/fight/feel.ts';
import { FEEL_NAMES } from '../src/fight/feel-modules.ts';
import * as CHUNK from '../src/fight/feel-chunk.ts';
import { checkHitreact, SCHEMA, validateFile } from '../src/sim/validate.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const ROWS = read('feel-hitreact'), PHYSICS = read('physics');
const clone = (x) => JSON.parse(JSON.stringify(x));
const PARTS = Object.keys(PHYSICS.bones);
// He faces yaw 0 (+z). An attacker in front of him faces him: heading PI. Behind him: heading 0. On his right (-x), facing +x: heading PI/2. On his left: -PI/2.
const FRONT = Math.PI, BACK = 0, FROM_RIGHT = Math.PI / 2, FROM_LEFT = -Math.PI / 2;
const sum = (plan, part) => plan.impulses.filter((i) => i.part === part).reduce((a, i) => [a[0] + i.v[0], a[1] + i.v[1], a[2] + i.v[2]], [0, 0, 0]);

test('the shipped rows validate, with a schema registered', () => {
  assert.ok(SCHEMA['feel-hitreact']);
  assert.deepEqual(validateFile('feel-hitreact', ROWS), []);
});

test('validator: unknown keys, unknown parts, NaN and out-of-range numbers are rejected', () => {
  const t = (mut, re) => { const b = clone(ROWS); mut(b); assert.match(checkHitreact(b).join('\n') + validateFile('feel-hitreact', b).join('\n'), re); };
  t((b) => { b.zones.head.zoom = 1; }, /zones\.head\.zoom: unknown key/);
  t((b) => { b.zones.torso.dips.tail = 0.5; }, /zones\.torso\.dips\.tail: unknown part/);
  t((b) => { b.zones.legs.dips.thigh = 0.5; }, /zones\.legs\.dips\.thigh: a limb part needs \$near/);
  t((b) => { b.zones.head.dips['head$near'] = 0.5; }, /zones\.head\.dips\.head\$near: \$near only on a limb part/);
  t((b) => { b.zones.head.dips.neck = 1.5; }, /zones\.head\.dips\.neck: must be a finite number in \[0, 1\]/);
  t((b) => { b.zones.head.impulse = null; }, /zones\.head\.impulse: must be a finite number/);
  t((b) => { b.zones.torso.timing.backS = 0; }, /zones\.torso\.timing\.backS: must be a finite number in \(0, 3\]/);
  t((b) => { b.zones.legs.dirs.left.dip = NaN; }, /zones\.legs\.dirs\.left\.dip: must be a finite number/);
  t((b) => { delete b.zones.arms; }, /zones\.arms: missing/);
  t((b) => { b.zones.neck = {}; }, /zones\.neck: unknown zone/);
  t((b) => { b.frontCos = 1; }, /frontCos: must be a finite number in \(0, 1\)/);
  t((b) => { b.defaultSide = 'Up'; }, /defaultSide/);
});

test('every part a row names (after $near) is one of the package\'s 20 part ids', () => {
  for (const loc of Object.keys(ROWS.zones)) for (const heading of [FRONT, BACK, FROM_RIGHT, FROM_LEFT]) {
    const plan = planHit(ROWS, loc, heading, 0);
    for (const p of [...Object.keys(plan.dips), ...Object.keys(plan.blend), ...plan.impulses.map((i) => i.part)]) assert.ok(PARTS.includes(p), `${loc}/${plan.sector}: ${p}`);
  }
});

test('opt-in: listed in FEEL_NAMES and exported by the chunk as hitreact, so only ?feel=hitreact (alone or in a comma list) loads it; armfeel\'s high|low|off do not', async () => {
  assert.ok(FEEL_NAMES.includes('hitreact')); assert.equal(CHUNK.hitreact, HOOKS);
  for (const s of ['', '?feel=high', '?feel=off', '?feel=hitreacts', '?hitreact=1']) assert.equal(activeFeels(s).includes(HOOKS), false, s);
  const list = activeFeels('?physics=v1&feel=low,hitreact');
  await new Promise((r) => setTimeout(r, 200));   // the chunk arrives a moment later and is pushed onto the same list
  assert.equal(list.includes(HOOKS), true);
});

test('direction: front, back, left, right of HIM, and it follows his own turn', () => {
  const c = ROWS.frontCos;
  assert.equal(sectorOf(FRONT, 0, c).sector, 'front');
  assert.equal(sectorOf(BACK, 0, c).sector, 'back');
  assert.equal(sectorOf(FROM_RIGHT, 0, c).sector, 'right');
  assert.equal(sectorOf(FROM_LEFT, 0, c).sector, 'left');
  assert.equal(sectorOf(FRONT + 1.2, 1.2, c).sector, 'front', 'turning him and the attacker together changes nothing');
  assert.equal(sectorOf(FRONT, Math.PI, c).sector, 'back', 'he turned his back on the same blow');
  assert.equal(sectorOf(FRONT + 0.5, 0, c).sector, 'front', 'inside the 45 degree cone');
});

test('a head blow from the front: head and neck take the impulse along the blow, neck and head motors fall furthest', () => {
  const p = planHit(ROWS, 'head', FRONT, 0);
  assert.equal(p.sector, 'front');
  const h = sum(p, 'head');
  assert.ok(h[2] < -1 && Math.abs(h[0]) < 1e-6, `head pushed back along the blow (-z): ${h}`);
  assert.ok(p.dips.head < p.dips.spine2 && p.dips.neck < p.dips.spine1, 'the head and neck dip deepest');
  assert.equal(p.impulses.some((i) => i.part === 'spine'), false, 'no couple on a front blow');
});

test('a stomach blow from the front folds him: belly pushed back, head and chest pulled the other way (over the blow)', () => {
  const p = planHit(ROWS, 'torso', FRONT, 0);
  assert.ok(sum(p, 'spine')[2] < 0, 'belly follows the blow (-z, away from the attacker)');
  assert.ok(sum(p, 'head')[2] > 0 && sum(p, 'spine2')[2] > 0, 'head and chest tip toward the attacker');
  assert.ok(p.dips.spine < 0.5 && p.blend.spine === 1, 'the spine motors give and the bones show it');
  const back = planHit(ROWS, 'torso', BACK, 0);
  assert.ok(sum(back, 'spine')[2] > 0 && sum(back, 'head')[2] < 0, 'from behind the same row arches him the other way');
});

test('a side blow bends him sideways and twists him, and the near limb is the side it came from', () => {
  const r = planHit(ROWS, 'torso', FROM_RIGHT, 0), l = planHit(ROWS, 'torso', FROM_LEFT, 0);
  assert.equal(r.side, 'Right'); assert.equal(l.side, 'Left');
  assert.ok('armRight' in r.dips && !('armLeft' in r.dips) && 'armLeft' in l.dips);
  assert.ok(sum(r, 'spine')[0] > 0 && sum(l, 'spine')[0] < 0, 'belly goes the way the blow travels (right blow: +x)');
  const twistR = r.impulses.filter((i) => i.part === 'spine2').at(-1).v, twistL = l.impulses.filter((i) => i.part === 'spine2').at(-1).v;
  assert.ok(Math.abs(twistR[2]) > 1 && Math.sign(twistR[2]) === -Math.sign(twistL[2]), 'the couple turns him opposite ways for left and right');
  const thighR = planHit(ROWS, 'legs', FROM_RIGHT, 0), thighL = planHit(ROWS, 'legs', FROM_LEFT, 0);
  assert.ok('thighRight' in thighR.dips && 'thighLeft' in thighL.dips, 'a leg blow from the right buckles his right leg');
  assert.equal(planHit(ROWS, 'legs', FRONT, 0).side, ROWS.defaultSide);
});

test('the impulses add up to the row\'s total along the blow; the hit\'s strength scales every one; the sum of an arm blow is not a leg blow', () => {
  const p = planHit(ROWS, 'head', FRONT, 0), q = planHit(ROWS, 'head', FRONT, 0, 0.5);
  const split = Object.values(ROWS.zones.head.split).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(p.impulses.reduce((a, i) => a + Math.abs(i.v[2]), 0) - ROWS.zones.head.impulse * split * ROWS.zones.head.dirs.front.impulse) < 1e-9);
  p.impulses.forEach((i, k) => i.v.forEach((v, a) => assert.ok(Math.abs(v * 0.5 - q.impulses[k].v[a]) < 1e-9)));
  assert.notDeepEqual(Object.keys(planHit(ROWS, 'arms', FRONT, 0).dips), Object.keys(planHit(ROWS, 'legs', FRONT, 0).dips));
});

test('no zone row or no heading = no plan (the generic stagger is all he gets)', () => {
  assert.equal(planHit(ROWS, undefined, FRONT, 0), null);
  assert.equal(planHit(ROWS, 'tail', FRONT, 0), null);
  assert.equal(planHit(ROWS, 'head', undefined, 0), null);
});

test('depth: eased in, held, back over backS, -1 after; strengths run from 1 to the dip and back', () => {
  const p = planHit(ROWS, 'torso', FRONT, 0), end = p.easeInS + p.holdS + p.backS;
  assert.equal(depthAt(p, 0), 0); assert.equal(depthAt(p, p.easeInS), 1); assert.equal(depthAt(p, p.easeInS + p.holdS / 2), 1);
  assert.ok(Math.abs(depthAt(p, end - p.backS / 2) - 0.5) < 1e-9); assert.equal(depthAt(p, end), -1); assert.equal(depthAt(p, -1), -1);
  assert.equal(strengthsAt(p, 0).spine, 1); assert.equal(strengthsAt(p, 1).spine, p.dips.spine);
});

test('the stateful part: impulses once, motors dip then come back to 1, the bones\' blend reported, a second blow takes over', () => {
  const calls = [], rd = { setMotorStrength: (r) => calls.push(['s', r]), applyImpulse: (p, v) => calls.push(['i', p, v]) };
  const hr = createHitReact();
  assert.equal(hr.frame(rd, 0.016), null, 'idle: nothing written');
  assert.equal(calls.length, 0);
  assert.ok(hr.hit(rd, 'torso', FRONT, 0));
  const impulses = calls.filter((c) => c[0] === 'i').length; assert.ok(impulses >= 3);
  let f, guard = 0, deepest = 1;
  while ((f = hr.frame(rd, 1 / 60)) && guard++ < 1000) { assert.ok(f.w >= 0 && f.w <= 1); assert.equal(f.share.spine, 1); deepest = Math.min(deepest, calls.at(-1)[1].spine); }
  assert.ok(deepest <= ROWS.zones.torso.dips.spine + 1e-9, 'reached the dip');
  assert.equal(hr.active, false);
  assert.equal(calls.filter((c) => c[0] === 'i').length, impulses, 'no impulse after the blow');
  const last = calls.at(-1)[1]; assert.ok(Object.values(last).every((v) => v === 1), 'every dipped motor put back to full');
  assert.deepEqual(Object.keys(last).sort(), Object.keys(planHit(ROWS, 'torso', FRONT, 0).dips).sort());
  // second blow mid-reaction: the first one's dips are put back (those not dipped again) before the new ones
  hr.hit(rd, 'legs', FROM_LEFT, 0); hr.frame(rd, 0.1);
  const before = calls.length; hr.hit(rd, 'head', FRONT, 0);
  const restore = calls[before][1]; assert.equal(calls[before][0], 's'); assert.ok(Object.values(restore).every((v) => v === 1) && 'thighLeft' in restore);
  hr.reset(rd); assert.equal(hr.active, false); assert.ok(Object.values(calls.at(-1)[1]).every((v) => v === 1));
  assert.equal(hr.hit(rd, 'tail', FRONT, 0), null);
});

test('the registered hooks: a Hit plans from the event and his own yaw; frame runs only alive; kill forgets the blow', () => {
  const calls = [], rd = { state: 'alive', setMotorStrength: (r) => calls.push(['s', r]), applyImpulse: (p, v) => calls.push(['i', p, v]) };
  const blends = [], ctx = (mode, yaw = 0) => ({ rd, mode, group: { rotation: { y: yaw } }, blendToward: (s) => blends.push(s) });
  globalThis.__hitreactLog = [];
  HOOKS.hit({ type: 'Hit', tick: 7, location: 'head', heading: FRONT + 0.4 }, ctx('alive', 0.4));   // he is turned 0.4: the same front blow
  assert.deepEqual(globalThis.__hitreactLog, [{ tick: 7, zone: 'head', sector: 'front', side: ROWS.defaultSide, cls: 'light' }]);   // an event with no move or charge is a light
  HOOKS.frame(1 / 60, [], ctx('alive')); assert.ok(calls.some((c) => c[0] === 's'));
  assert.equal(blends.length, 1); assert.ok(blends[0].head > 0 && blends[0].head <= 1 && blends[0].neck > 0, 'the head and neck bones are blended toward the ragdoll by depth');
  const n = calls.length; HOOKS.frame(1 / 60, [], ctx('dead')); assert.equal(calls.length, n, 'dead: nothing written to the motors');
  HOOKS.frame(1 / 60, [], ctx('alive')); assert.equal(calls.length, n, 'and the blow is forgotten');
  HOOKS.hit({ type: 'Hit', tick: 8, location: 'head', heading: FRONT }, ctx('alive')); HOOKS.kill(); HOOKS.frame(1 / 60, [], ctx('alive'));
  assert.equal(calls.filter((c) => c[0] === 's').length, 1, 'kill: no further strength writes (the one before was the first frame)');
});

test('?rules=m4 knockdown: no motor write, no impulse and no blend while he is down or getting up; the held dips go back to full once; a blow then is ignored', () => {
  const calls = [], blends = [], rd = { state: 'alive', setMotorStrength: (r) => calls.push(['s', r]), applyImpulse: (p, v) => calls.push(['i', p, v]) };
  const ctx = { rd, mode: 'alive', group: { rotation: { y: 0 } }, blendToward: (s) => blends.push(s) };
  HOOKS.kill();
  HOOKS.hit({ type: 'Hit', tick: 1, location: 'torso', heading: FRONT }, ctx); HOOKS.frame(1 / 60, [], ctx);   // a blow, one frame of dips
  const held = calls.filter((c) => c[0] === 's').at(-1)[1]; assert.ok(Object.values(held).some((v) => v < 1));
  rd.state = 'knockdown';   // the rules path knocked him down
  const before = calls.length, blendsBefore = blends.length;
  HOOKS.frame(1 / 60, [], ctx);
  const restore = calls[before]; assert.equal(restore[0], 's'); assert.ok(Object.values(restore[1]).every((v) => v === 1), 'every held dip put back to full, once');
  for (let i = 0; i < 60; i++) HOOKS.frame(1 / 60, [], ctx);   // a second of lying down
  HOOKS.hit({ type: 'Hit', tick: 2, location: 'head', heading: FRONT }, ctx);
  assert.equal(calls.length, before + 1, 'down: nothing more written, no impulse for a blow on a man on the floor'); assert.equal(blends.length, blendsBefore);
  rd.state = 'alive';   // the package says alive again: the get-up blend back to the clip is ragdoll.ts's
  const quiet = Math.ceil(ROWS.knockdownQuietS * 60) - 1;
  for (let i = 0; i < quiet; i++) HOOKS.frame(1 / 60, [], ctx);
  HOOKS.hit({ type: 'Hit', tick: 3, location: 'head', heading: FRONT }, ctx);
  assert.equal(calls.length, before + 1, 'getting up: still nothing written'); assert.equal(blends.length, blendsBefore);
  for (let i = 0; i < 5; i++) HOOKS.frame(1 / 60, [], ctx);   // the get-up is over
  HOOKS.hit({ type: 'Hit', tick: 4, location: 'head', heading: FRONT }, ctx); HOOKS.frame(1 / 60, [], ctx);
  assert.ok(calls.length > before + 1 && blends.length === blendsBefore + 1, 'standing again: the reactions are back');
  HOOKS.kill();
});

test('the quiet window after a knockdown is at least the rules package\'s get-up blend (data/rules.json getUpS)', () => {
  assert.ok(ROWS.knockdownQuietS >= read('rules').getUpS, `${ROWS.knockdownQuietS} >= ${read('rules').getUpS}`);
});

test('the module imports only TYPES from feel.ts (the feel chunk is its own bundle) and nothing back into the ragdoll or three', () => {
  const src = readFileSync(new URL('../src/fight/feel-hitreact.ts', import.meta.url), 'utf8');
  assert.match(src, /import type \{ FeelCtx, FeelHooks \} from '\.\/feel\.ts'/); assert.doesNotMatch(src, /registerFeel/);
  assert.doesNotMatch(src, /from '\.\/ragdoll/, 'no import back into ragdoll.ts');
  assert.doesNotMatch(src, /from 'three'/, 'the core has no three dependency');
});

// ---- blow classes (Dom 2026-10-27: "every hit he sways left and right; tone it down"): a light is a small quick flinch, a heavy and a counter keep the full reaction ----
import { classOf } from '../src/fight/feel-hitreact.ts';
const CL = ROWS.classes, mag = (plan) => Math.max(...plan.impulses.map((i) => Math.hypot(...i.v)));
const lateral = (plan) => Math.max(...plan.impulses.map((i) => Math.abs(i.v[0])));   // along his side-to-side axis (he faces +z, so x)

test('classes: counter beats heavy beats light; a charged blow, a heavy move and the directional heavies are heavy', () => {
  assert.equal(classOf(ROWS, { move: 'light_left' }), 'light');
  assert.equal(classOf(ROWS, {}), 'light');
  assert.equal(classOf(ROWS, { move: 'heavy_overhead' }), 'heavy');
  assert.equal(classOf(ROWS, { move: 'light_left', charged: true }), 'heavy');
  assert.equal(classOf(ROWS, { move: 'critical' }), 'heavy');
  assert.equal(classOf(ROWS, { move: 'light_left', counter: true }), 'counter');
  assert.equal(classOf(ROWS, { move: 'heavy_overhead', counter: true }), 'counter');
});

test('classes: a LIGHT side blow sways him less than a third as far as before (impulse, couple) and lets go faster; heavy and counter are the old reaction exactly', () => {
  for (const loc of ['torso', 'head']) for (const heading of [FROM_RIGHT, FROM_LEFT]) {
    const full = planHit(ROWS, loc, heading, 0), light = planHit(ROWS, loc, heading, 0, 1, CL.light);
    assert.ok(lateral(light) <= lateral(full) * 0.35, `${loc}: lateral ${lateral(light)} vs ${lateral(full)}`);
    assert.ok(light.holdS + light.backS <= (full.holdS + full.backS) * 0.5, `${loc}: settle ${light.holdS + light.backS} vs ${full.holdS + full.backS}`);
    for (const [p, s] of Object.entries(light.dips)) assert.ok(s >= full.dips[p], `${loc} ${p}: the motors fall less`);
    assert.deepEqual(planHit(ROWS, loc, heading, 0, 1, CL.heavy), full, 'heavy = unchanged');
    assert.deepEqual(planHit(ROWS, loc, heading, 0, 1, CL.counter), full, 'counter = unchanged');
  }
  assert.ok(mag(planHit(ROWS, 'torso', FRONT, 0, 1, CL.light)) <= mag(planHit(ROWS, 'torso', FRONT, 0)) * 0.35);
});

test('classes: through the hook, a light blow writes a smaller push than a heavy one; ?sway=v1 gives every blow the full reaction back', () => {
  const impulse = (e) => { const calls = []; const ctx = { rd: { state: 'alive', setMotorStrength() {}, applyImpulse: (p, v) => calls.push(Math.hypot(...v)) }, mode: 'alive', group: { rotation: { y: 0 } }, blendToward() {} }; HOOKS.hit({ type: 'Hit', tick: 1, location: 'torso', heading: FROM_RIGHT, ...e }, ctx); HOOKS.kill(); return Math.max(...calls); };
  const light = impulse({ move: 'light_left' }), heavy = impulse({ move: 'heavy_overhead', charged: true });
  assert.ok(light < heavy * 0.4, `${light} vs ${heavy}`);
  globalThis.location = { search: '?sway=v1' };
  try { assert.ok(Math.abs(impulse({ move: 'light_left' }) - heavy) < 1e-9, '?sway=v1: a light is planned as a heavy'); } finally { delete globalThis.location; }
});

test('classes: the hook softens the package\'s own stagger for a light (impulse, blend, time) and leaves heavy, counter and ?sway=v1 at 1; no soften field on the ctx is fine', () => {
  const run = (e) => { const soften = { impulse: 1, blend: 1, time: 1 }; HOOKS.hit({ type: 'Hit', tick: 1, location: 'torso', heading: FRONT, ...e }, { rd: { state: 'alive', setMotorStrength() {}, applyImpulse() {} }, mode: 'alive', group: { rotation: { y: 0 } }, blendToward() {}, soften }); HOOKS.kill(); return soften; };
  const L = run({ move: 'light_left' });
  assert.deepEqual(L, { impulse: CL.light.staggerImpulse, blend: CL.light.staggerBlend, time: CL.light.staggerTime });
  assert.ok(L.impulse <= 0.6 && L.blend <= 0.6 && L.time >= 1.5, 'a light flinch: a smaller push, less of the pose, faster');
  for (const e of [{ move: 'heavy_overhead', charged: true }, { move: 'light_left', counter: true }]) assert.deepEqual(run(e), { impulse: 1, blend: 1, time: 1 }, JSON.stringify(e));
  globalThis.location = { search: '?sway=v1' };
  try { assert.deepEqual(run({ move: 'light_left' }), { impulse: 1, blend: 1, time: 1 }, '?sway=v1'); } finally { delete globalThis.location; }
  HOOKS.hit({ type: 'Hit', tick: 1, location: 'torso', heading: FRONT, move: 'light_left' }, { rd: { state: 'alive', setMotorStrength() {}, applyImpulse() {} }, mode: 'alive', group: { rotation: { y: 0 } }, blendToward() {} }); HOOKS.kill();
});

test('classes: ragdoll.ts reads ctx.soften in all three stagger places and puts it back to 1 after every blow', () => {
  const src = readFileSync(new URL('../src/fight/ragdoll.ts', import.meta.url), 'utf8');
  assert.match(src, /p\.scale \* soften\.impulse/); assert.match(src, /\* staggerK\.time\)/); assert.match(src, /\* staggerK\.blend, blend\)/);
  assert.match(src, /soften\.impulse = soften\.blend = soften\.time = 1;/);
});

test('classes: the validator rejects a missing, unknown or out-of-range class row', () => {
  const t = (mut, re) => { const b = clone(ROWS); mut(b); assert.match(checkHitreact(b).join('\n'), re); };
  t((b) => { delete b.classes; }, /classes: must be an object/);
  t((b) => { b.classes.light.impulse = 0; }, /classes\.light\.impulse: must be a finite number in \(0, 3\]/);
  t((b) => { b.classes.light.sway = 1; }, /classes\.light\.sway: unknown key/);
  t((b) => { delete b.classes.counter; }, /classes\.counter: must be an object/);
});
