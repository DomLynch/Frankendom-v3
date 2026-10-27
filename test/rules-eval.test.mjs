// The physics package's M4 hit/cut rules evaluator on the opponent's ragdoll (data/rules.json, src/fight/rules-eval.ts), the default (?rules=v1 = V1's rules).
// Presentation only: these pin the rows against the package and the sim's own weapons, the query (M4 is the default), the mapping
// from a sim Hit event to the evaluator's input (light/heavy, head/torso/legs, counter-hit, stab, blunt) and the outcome the package gives for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEvaluator, createFighterState, loadRules } from '@frankendom/physics';
import { validateFile } from '../src/sim/validate.js';
import { createHandSpeed, createRulesEval, cutPrecedence, evaluatorTakesKill, handSpeedOf, hitInput, present, rulesOnFor } from '../src/fight/rules-eval.ts';
import { foeRagdollFor, ragdollFinisher } from '../src/fight/ragdoll.ts';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const ROWS = read('../data/rules.json'), WEAPONS = read('../src/fight/weapon-defs.json').weapons.map((w) => w.id);
const BODY = read('../node_modules/@frankendom/physics/data/bodies/minotaur-106.measure.json');
const pkg = { loadRules, createEvaluator, createFighterState };
const hit = (o = {}) => ({ tick: 600, type: 'Hit', actor: 0, target: 1, move: 'light_right', location: 'torso', heading: 0, weapon: 'gladius', damage: 5, ...o });
const rules = loadRules();

test('the package\'s rows pass its own lint (M6), and V3\'s rows pass V3\'s closed key set', () => {
  assert.equal(rules.schema.length > 0, true);
  assert.deepEqual(validateFile('rules', ROWS), []);
  assert.deepEqual(validateFile('rules', { ...ROWS, extra: 1 }), ['rules.extra: unknown key']);
});

test('every weapon V3 fights with has a row, and each row names a package weapon with a length and slash and stab sharpness (the nearest one, where V3 has no exact match)', () => {
  for (const id of ['longsword', 'cleaver', 'gladius', 'trident']) assert.ok(ROWS.weapons[id], `${id} has a row`);
  for (const id of WEAPONS) assert.ok(ROWS.weapons[id], `weapon-defs.json ${id} has a row in data/rules.json`);
  for (const id of Object.keys(ROWS.weapons)) assert.ok(WEAPONS.includes(id), `${id} is a weapon-defs.json id`);
  for (const [id, w] of Object.entries(ROWS.weapons)) {
    const p = rules.weapons[w.rule];
    assert.ok(p, `${id} -> ${w.rule} is a package weapon`);
    assert.equal(typeof p.length_m, 'number', `${w.rule} has a length (a hand speed needs the lever)`);
    assert.equal(typeof p.slash_sharpness, 'number'); assert.equal(typeof p.stab_sharpness, 'number');
  }
  assert.equal(ROWS.weapons.gladius.rule, 'gm_gladius'); assert.equal(ROWS.weapons.longsword.rule, 'gm_katana');
  assert.equal(ROWS.weapons.cleaver.rule, 'gm_battleaxe'); assert.equal(ROWS.weapons.trident.rule, 'gm_rapier');
  assert.ok(ROWS.armour.pitborn in rules.armour_tiers && ROWS.armour.default in rules.armour_tiers);
  assert.ok(ROWS.handSpeedRef in rules.swing.hand_speed_ref_m_s && ROWS.impulseAt in rules.strength_scale);
});

test('M4 is the default (Dom 2026-10-27, data/rules.json default row); ?rules=v1 is V1\'s rules', () => {
  assert.equal(ROWS.on, true);
  assert.equal(ROWS.default, ROWS.m4);
  assert.equal(rulesOnFor(ROWS, ''), true);
  assert.equal(rulesOnFor(ROWS, '?rules=v1'), false);
  assert.equal(rulesOnFor(ROWS, '?x=1&rules=v1'), false);
  assert.equal(rulesOnFor(ROWS, '?rules=sometimes'), true);
  assert.equal(rulesOnFor(ROWS, '?physics=v1&foo=m4'), true);
  assert.equal(rulesOnFor(ROWS, '?rules=m4'), true);
  assert.equal(rulesOnFor(ROWS, '?x=1&rules=m4'), true);
  assert.equal(rulesOnFor({ ...ROWS, on: false }, '?rules=m4'), false);
  assert.equal(rulesOnFor({ ...ROWS, on: false }, ''), false);
  assert.equal(rulesOnFor({ ...ROWS, default: ROWS.v1 }, ''), false);   // the default is the row, not a constant in the code
  assert.equal(rulesOnFor({ ...ROWS, default: ROWS.v1 }, '?rules=m4'), true);
});

test('hit event -> evaluator input: light and heavy, head / torso / legs, counter-hit, stab, blunt, time', () => {
  const at = (o) => hitInput(ROWS, rules, hit(o), 'pitborn');
  const light = at({});
  assert.deepEqual(light, { weapon: 'gm_gladius', kind: 'slash', zone: 'torso', armour: 'none', handSpeed: 6.25, swing: 'light', counterHit: false, t: 10 });
  assert.equal(at({ move: 'heavy_overhead' }).swing, 'heavy');
  assert.equal(at({ move: 'heavy_counter' }).swing, 'heavy');
  assert.equal(at({ move: 'critical' }).swing, 'heavy');
  assert.equal(at({ move: 'light_left', charged: true }).swing, 'heavy');
  assert.equal(at({ move: 'heavy_thrust' })?.swing ?? 'heavy', 'heavy');   // a directional heavy stab (move-defs.json) is a heavy too
  assert.equal(at({ move: 'light_left' }).swing, 'light');
  assert.equal(at({ location: 'head' }).zone, 'head');
  assert.equal(at({ location: 'head' }).side, undefined);
  assert.deepEqual([at({ location: 'legs' }).zone, at({ location: 'legs' }).side], ['legs', 'left']);
  assert.equal(at({ counter: true }).counterHit, true);   // the sim's counter / stop-hit flag
  assert.equal(at({ counter: false }).counterHit, false);
  assert.equal(at({ move: 'thrust' }).kind, 'stab');
  assert.equal(at({ weapon: 'warhammer' }).kind, 'blunt');
  assert.equal(at({ weapon: 'longsword' }).weapon, 'gm_katana');
  assert.equal(at({ tick: 90 }).t, 1.5);   // sim seconds from the tick, never a clock
  assert.equal(at({ missile: true }), null); assert.equal(at({ location: undefined }), null); assert.equal(at({ weapon: 'wand' }), null);
  assert.equal(hitInput(ROWS, rules, { tick: 1, type: 'Staggered', actor: 1 }, 'pitborn'), null);
});

test('the heavy is not counted twice: the same light hand speed with swing heavy, strength = tip x sharpness x heavy_mult', () => {
  const ev = createEvaluator(rules), state = createFighterState(rules, BODY, { sword_side: 'right', leg_hp: 60 });
  const light = hitInput(ROWS, rules, hit(), 'pitborn'), heavy = hitInput(ROWS, rules, hit({ move: 'heavy_overhead' }), 'pitborn');
  assert.equal(light.handSpeed, heavy.handSpeed);
  const r = ev.evaluateHit(heavy, state);
  assert.ok(Math.abs(r.strength - r.tipSpeed * r.sharpness * rules.swing.heavy_mult) < 1e-9);
  assert.equal(r.swing, 'heavy');
});

test('the outcomes the package gives (docs/M4-CALIBRATION.md): the baseline blade sticks on a light torso hit, a heavy leg hit cuts, a counter-hit light leg hit cuts', () => {
  const run = (o) => { const r = createRulesEval(ROWS, pkg, BODY, 'pitborn', () => 0); return [r.hit(hit({ weapon: 'longsword', ...o }), true), r]; };   // at the typical light swing (handSpeedRef light_p50)
  assert.equal(run({})[0].outcome, 'stick');
  assert.equal(run({ weapon: 'gladius' })[0].outcome, 'hit');   // the baseline blade at the typical swing is only a hit
  const [p, r] = run({ location: 'legs', move: 'heavy_overhead' });
  assert.equal(p.outcome, 'cut'); assert.equal(p.cut, 'leg_left'); assert.equal(p.action, 'stagger');   // a cut on a living body: the list for now (M5's rd.cut joins), the blow staggers
  assert.deepEqual(r.debug.cuts, [{ unit: 'leg_left', tick: 600, weapon: 'gm_katana' }]);
  const [c] = run({ location: 'legs', counter: true });
  assert.equal(c.outcome, 'cut');
  assert.equal(run({ weapon: 'knife', move: 'light_left' })[0].action, 'none');   // the dagger: slash sharpness 0.34, a light slash is under the hit rung: a miss
  const [h] = run({ weapon: 'gladius' });
  assert.equal(h.action, 'stagger'); assert.ok(h.scale >= ROWS.impulseClamp[0] && h.scale <= ROWS.impulseClamp[1]);
});

test('knockdown: light leg blows add up to the fall (60 of the counter); it carries the evaluator\'s fall + down seconds', () => {
  const r = createRulesEval(ROWS, pkg, BODY, 'pitborn', () => 0);
  const outcomes = [];
  for (let i = 0; i < 8; i++) outcomes.push(r.hit(hit({ weapon: 'longsword', location: 'legs', tick: 60 * (i + 1) }), true));
  assert.deepEqual(outcomes.map((o) => o.outcome), [...Array(7).fill('stick'), 'knockdown']);
  // Dom 2026-10-27 (one light hit laid the Minotaur down, often): the evaluator's own fall is a LIGHT swing's flinch (knockdownSwing 'heavy'), not a lie-down
  assert.equal(outcomes[7].action, 'stagger', 'a light swing never lays him down, even when the counter says fall');
  assert.deepEqual(outcomes.map((o) => o.action), Array(8).fill('stagger'));
  assert.equal(r.debug.byOutcome.knockdown, 1);
  // the same leg blows with a HEAVY swing: the 8th lays him down, carrying the evaluator's fall + down seconds
  const h = createRulesEval(ROWS, pkg, BODY, 'pitborn', () => 0), hv = [];
  for (let i = 0; i < 8; i++) hv.push(h.hit(hit({ weapon: 'longsword', location: 'legs', move: 'heavy_overhead', tick: 60 * (i + 1) }), true));
  const k = hv.find((o) => o.outcome === 'knockdown');
  assert.ok(k, 'a heavy swing reaches the evaluator\'s fall'); assert.equal(k.action, 'knockdown'); assert.equal(k.cause, 'damage');
  assert.equal(k.downS, rules.knockdown.fall_seconds.damage + rules.knockdown.fall_seconds.down);
});

test('twenty light torso swings never lay the foe down, however his own pool runs (Dom 2026-10-27: one light hit and the Minotaur falls, often)', () => {
  const r = createRulesEval(ROWS, pkg, BODY, 'pitborn', () => 0, { foe: 76, man: 60 });   // the live Minotaur's pool: the sim's 76 over a man's 60
  const acts = [];
  for (let i = 0; i < 20; i++) acts.push(r.hit(hit({ move: 'light_right', location: 'torso', tick: 60 * (i + 1) }), true, 13)?.action);   // measured 13 m/s x speedScale 0.5 = the 6.5 light swing of the live runs
  assert.equal(acts.filter((a) => a === 'knockdown').length, 0, JSON.stringify(acts));
  assert.ok(r.debug.deferredKills >= 1, 'his pool did run dry at least once in 20 swings: that is the old falls, now flinches');
});

test('a kill is the sim\'s: while it lives the evaluator\'s kill is a knockdown, counted, and the fighter renewed; on the killing blow it is the kill', () => {
  const alive = createRulesEval(ROWS, pkg, BODY, 'pitborn', () => 0);
  assert.equal(createRulesEval(ROWS, pkg, BODY, 'pitborn', () => 0).hit(hit({ location: 'head', move: 'heavy_overhead' }), true).outcome, 'stick');   // head budget 40: a gladius heavy (31 damage) no longer takes it in one blow
  const p = alive.hit(hit({ weapon: 'longsword', location: 'head', move: 'heavy_overhead' }), true);   // a longsword heavy still does (a cut-rung blow removes the whole part)
  assert.equal(p.outcome, 'kill'); assert.equal(p.deferredKill, true); assert.equal(p.action, 'stagger');   // killAs 'stagger': his pool running dry while the sim says he lives is a flinch, never a lie-down
  assert.equal(alive.debug.deferredKills, 1); assert.equal(alive.debug.renewals, 1);
  const torso = createRulesEval(ROWS, pkg, BODY, 'pitborn', () => 0), t = torso.hit(hit({ weapon: 'longsword', move: 'heavy_overhead' }), true);   // a torso cut is a kill: neither happened
  assert.deepEqual([t.outcome, t.deferredKill, t.cut, torso.debug.cuts.length], ['kill', true, null, 0]);
  assert.equal(alive.hit(hit({ weapon: 'longsword', location: 'head', move: 'heavy_overhead', tick: 1200 }), true).outcome, 'kill');   // whole again: the head can be struck again
  const dead = createRulesEval(ROWS, pkg, BODY, 'pitborn', () => 0).hit(hit({ weapon: 'longsword', location: 'head', move: 'heavy_overhead' }), false);
  assert.equal(dead.deferredKill, false);
});

test('a blow below the speed gate or the hit rung is a miss: no reaction', () => {
  const ev = createEvaluator(rules), state = createFighterState(rules, BODY);
  const r = ev.evaluateHit({ weapon: 'gm_dagger', kind: 'slash', zone: 'torso', armour: 'none', handSpeed: 1, swing: 'light', counterHit: false, t: 1 }, state);
  assert.equal(r.outcome, 'miss'); assert.equal(present(ROWS, rules, r, true).action, 'none');
});

test('deterministic: the same hits twice give the same results and the same debug list', () => {
  const play = () => {
    const r = createRulesEval(ROWS, pkg, BODY, 'pitborn', () => 0);
    for (let i = 0; i < 12; i++) r.hit(hit({ location: ['head', 'torso', 'legs'][i % 3], move: i % 4 === 3 ? 'heavy_overhead' : 'light_right', counter: i % 5 === 4, tick: 45 * (i + 1) }), true);
    return JSON.stringify(r.debug);
  };
  assert.equal(play(), play());
});

test('per-hit hand speed: a measured speed replaces the reference; a heavy is brought to its light-equivalent (divided by heavy_mult) so it is not counted twice; clamped to the package range; none = light_p50', () => {
  const at = (o, m) => hitInput(ROWS, rules, hit(o), 'pitborn', m);
  assert.equal(at({}, null).handSpeed, rules.swing.hand_speed_ref_m_s.light_p50);   // no sample: the reference row
  assert.equal(at({}, 0).handSpeed, rules.swing.hand_speed_ref_m_s.light_p50);
  assert.ok(Math.abs(at({}, 11).handSpeed - 11 * ROWS.speedScale) < 1e-12);   // a light: as measured, in the package's units (speedScale)
  assert.ok(Math.abs(at({ move: 'heavy_overhead' }, 11.52).handSpeed - 11.52 * ROWS.speedScale / ROWS.heavyDivisor) < 1e-12);   // a heavy: the same scale, over heavyDivisor
  assert.equal(at({}, 99).handSpeed, rules.swing.hand_speed_ref_m_s[ROWS.speedMaxRef]);   // clamped high
  assert.equal(at({}, 0.5).handSpeed, ROWS.speedMin);   // clamped low
  assert.ok(ROWS.speedScale > 0 && ROWS.speedScale <= 1 && ROWS.heavyDivisor >= 1);
  // an absent row is the identity, not NaN (the page still gets a finite speed)
  const { speedScale: _s, heavyDivisor: _h, ...bare } = ROWS;
  for (const heavy of [false, true]) { const v = handSpeedOf(bare, rules, 7, heavy).speed; assert.ok(Number.isFinite(v) && v === 7, `absent rows: ${v}`); }
  assert.equal(handSpeedOf({ ...ROWS, speedScale: NaN, heavyDivisor: 'x' }, rules, 7, true).speed, 7);
});

test('the hand-speed rows are checked at load: absent, non-finite, out-of-range values are errors', () => {
  const bad = (o) => validateFile('rules', { ...ROWS, ...o });
  assert.deepEqual(bad({}), []);
  const { speedScale: _s, heavyDivisor: _h, ...bare } = ROWS;
  assert.deepEqual(validateFile('rules', bare), ['rules.speedScale: must be a finite number in (0, 1]', 'rules.heavyDivisor: must be a finite number >= 1']);
  for (const v of [0, -1, 1.5, NaN, Infinity, '0.5', null]) assert.deepEqual(bad({ speedScale: v }), ['rules.speedScale: must be a finite number in (0, 1]'], `speedScale ${v}`);
  for (const v of [0.5, 0, NaN, Infinity, '1', null]) assert.deepEqual(bad({ heavyDivisor: v }), ['rules.heavyDivisor: must be a finite number >= 1'], `heavyDivisor ${v}`);
  assert.deepEqual(bad({ speedSpanS: 0 }), ['rules.speedSpanS: must be a finite number > 0']);
  assert.deepEqual(bad({ speedWindow: 2.5 }), ['rules.speedWindow: must be an integer >= 1']);
  assert.deepEqual(bad({ speedScale: 1, heavyDivisor: 2 }), []);
  assert.equal(handSpeedOf(ROWS, rules, 8, false).source, 'measured'); assert.equal(handSpeedOf(ROWS, rules, null, false).source, 'ref');
});

test('light and heavy differ with different speeds: a slow light is a hit, a fast light sticks, a heavy at the same animation speed as a light is equal (not counted twice), a faster heavy is stronger',() => {
  const run = (o, m) => { const r = createRulesEval(ROWS, pkg, BODY, 'pitborn', () => 0, { foe: 190, man: 150 }); const p = r.hit(hit({ weapon: 'gladius', ...o }), true, m); return [p, r.debug.last[0]]; };
  const K = 1 / ROWS.speedScale;   // animation m/s that read as 1 m/s in the package's units
  const [slow] = run({}, 5 * K), [fast] = run({}, 9.5 * K), [heavy, hd] = run({ move: 'heavy_overhead' }, 9.5 * K);
  assert.ok(slow.strength < fast.strength);
  assert.ok(Math.abs(heavy.strength / fast.strength - rules.swing.heavy_mult / ROWS.heavyDivisor) < 1e-9);   // the same animation speed: the heavy is the light x heavy_mult / heavyDivisor
  assert.ok(heavy.strength > fast.strength || ROWS.heavyDivisor >= rules.swing.heavy_mult);   // a heavy reads higher than the light at the same clip speed unless the divisor takes the charge back out
  assert.ok(run({ move: 'heavy_overhead' }, 9.5 * K * 1.2)[0].strength >= heavy.strength);   // a faster heavy is not weaker
  assert.deepEqual([slow.outcome, fast.outcome], ['hit', 'stick']);
  assert.equal(hd.result.swing, 'heavy'); assert.equal(hd.source, 'measured'); assert.equal(hd.measured, 9.5 * K);
  const spread = new Set([4.5, 6, 7.5, 9.7].map((m) => run({ weapon: 'longsword' }, m * K)[0].outcome));
  assert.ok(spread.size >= 2, `a spread of outcomes over speeds, got ${[...spread]}`);
});

test('the hand sampler: speed of the last steps (peak of the window), snaps dropped, a stopped clock keeps the last, reset', () => {
  const s = createHandSpeed(ROWS);
  assert.equal(s.speed(), null);
  const n = Math.round(ROWS.speedSpanS * 60);   // ticks in the span
  s.push(0, 0, 0, 1 / 60); assert.equal(s.speed(), null);   // not a full span yet
  for (let i = 1; i < n; i++) s.push(0, 0, 0, 1 / 60);
  assert.equal(s.speed(), null);
  s.push(0.3, 0, 0, 1 / 60); assert.ok(Math.abs(s.speed() - 0.3 / ROWS.speedSpanS) < 1e-9);   // 0.3 m over the span
  s.push(0.3, 0, 0, 0); assert.ok(Math.abs(s.speed() - 0.3 / ROWS.speedSpanS) < 1e-9);   // dt 0 (stills): unchanged
  // a 20 fps clip on a 60 Hz page: stair steps (0, 0, then a jump) read the same speed over the span, not 3x on the jump frame
  const st = createHandSpeed(ROWS); let x = 0, peak = 0;
  for (let f = 0; f < 60; f++) { if (f % 3 === 0) x += 0.3; st.push(x, 0, 0, 1 / 60); peak = Math.max(peak, st.speed() ?? 0); }
  assert.ok(Math.abs(peak - 6) < 0.5, `stair-stepped 6 m/s reads about 6, got ${peak}`);
  for (let i = 0; i < ROWS.speedWindow + n; i++) s.push(0.3, 0, 0, 1 / 60);
  assert.equal(s.speed(), 0);   // the peak left the window
  s.push(50, 0, 0, 1 / 60); assert.equal(s.speed(), 0);   // a pose snap (over snapOver) is dropped
  s.reset(); assert.equal(s.speed(), null);
});

test('budgets: hp_scale from his sim health, a head budget that no non-cut blow kills in one hit; a cut still takes the part', () => {
  assert.deepEqual(validateFile('rules', { ...ROWS, budgets: { head: 40, wing: 1 } }), ['rules.budgets.wing: unknown key']);
  const ev = createEvaluator(rules), man = createFighterState(rules, BODY, { sword_side: 'right', leg_hp: 60 }), foe = createFighterState(rules, BODY, { sword_side: 'right', leg_hp: 60, hp_scale: 190 / 150, budgets: ROWS.budgets });
  const blow = { weapon: 'gm_gladius', kind: 'slash', zone: 'head', armour: 'none', handSpeed: 6.25, swing: 'heavy', counterHit: false, t: 1 };   // a heavy gladius head blow at the typical swing
  assert.equal(ev.evaluateHit(blow, man).outcome, 'kill');   // the package's 20: one blow
  const r = ev.evaluateHit({ ...blow, t: 2 }, foe);
  assert.notEqual(r.outcome, 'kill'); assert.ok(r.partHpAfter > 0);   // his head (40) survives it
  // the worst non-cut head blow (strength just under the cut rung) is under the head budget, for every weapon row, at the fastest light-equivalent
  const top = rules.swing.hand_speed_ref_m_s[ROWS.speedMaxRef];
  for (const w of new Set(Object.values(ROWS.weapons).map((x) => x.rule))) for (const swing of ['light', 'heavy']) {
    const r2 = ev.evaluateHit({ ...blow, weapon: w, handSpeed: top, swing, t: 3 }, createFighterState(rules, BODY, { sword_side: 'right', leg_hp: 60, hp_scale: 190 / 150, budgets: ROWS.budgets }));
    if (r2.outcome !== 'cut' && r2.outcome !== 'kill') assert.ok(r2.partHpAfter > 0, `${w} ${swing}`);
    if (r2.cut) assert.equal(r2.cut.unit, 'head');   // a big enough blow still cuts
  }
  assert.ok(ROWS.budgets.head > rules.strength_scale.rung_cut * rules.zones.head.body_part_mult * rules.global.damage_scale);   // a blow just under the cut rung
  const rig = read('../data/rig.json');
  assert.ok(ROWS.handBone in rig.bones, 'handBone is a data/rig.json bones key');
});

// ---- cut.precedence (Strategy's ruling (b)): who wins a KILLING blow, the evaluator's cut or the sim's finisher rotation ----
const killingBlow = (rows, o) => { const p = createRulesEval(rows, pkg, BODY, 'pitborn', () => 0).hit(hit({ weapon: 'longsword', move: 'heavy_overhead', ...o }), false); return { p, takes: evaluatorTakesKill(rows, o?.location ?? 'torso', [p]) }; };

test('cut.precedence is a validated data row: the head is the evaluator\'s, torso and legs keep the rotation', () => {
  assert.deepEqual(ROWS.cut.precedence, { head: 'evaluator' });
  assert.deepEqual(validateFile('rules', ROWS), []);
  assert.deepEqual(validateFile('rules', { ...ROWS, cut: { ...ROWS.cut, precedence: { head: 'finisher', torso: 'evaluator', legs: 'finisher' } } }), []);   // every choice stays a row
  assert.deepEqual(validateFile('rules', { ...ROWS, cut: { ...ROWS.cut, precedence: { head: 'sometimes' } } }), ['rules.cut.precedence.head: must be \'evaluator\' or \'finisher\'']);
  assert.deepEqual(validateFile('rules', { ...ROWS, cut: { ...ROWS.cut, precedence: { neck: 'evaluator' } } }), ['rules.cut.precedence.neck: unknown zone (head, torso, legs)']);
  assert.deepEqual(validateFile('rules', { ...ROWS, cut: { about: 'x' } }), ['rules.cut.precedence: must be an object of zone -> \'evaluator\' | \'finisher\'']);
  assert.deepEqual(validateFile('rules', { ...ROWS, cut: { ...ROWS.cut, extra: 1 } }), ['rules.cut.extra: unknown key']);
  const { cut, ...without } = ROWS;
  assert.ok(validateFile('rules', without).length > 0, 'the row is required');
  assert.equal(cutPrecedence(ROWS, 'head'), 'evaluator');
  for (const z of ['torso', 'legs', undefined, 'neck']) assert.equal(cutPrecedence(ROWS, z), 'finisher', `${z} keeps the rotation`);
  assert.equal(cutPrecedence({ cut: { precedence: { head: 'finisher' } } }, 'head'), 'finisher');
  assert.equal(cutPrecedence({ cut: { precedence: {} } }, 'head'), 'finisher');
  assert.equal(cutPrecedence({}, 'head'), 'finisher');   // no row = today's behaviour
});

test('a head-zone killing blow at or above the cut rung is the evaluator\'s: the head leaves with the kill; a torso kill, a leg kill and a blow below the rung keep the finisher rotation', () => {
  const head = killingBlow(ROWS, { location: 'head' });
  assert.ok(head.p.strength >= rules.strength_scale.rung_cut, `strength ${head.p.strength} is at the cut rung ${rules.strength_scale.rung_cut}`);
  assert.deepEqual([head.p.outcome, head.p.cut, head.takes], ['kill', 'head', true]);
  const torso = killingBlow(ROWS, { location: 'torso' });   // the evaluator would cut the waist here, but the rotation keeps a torso kill
  assert.deepEqual([torso.p.outcome, torso.p.cut, torso.takes], ['kill', 'torso_waist', false]);
  const legs = killingBlow(ROWS, { location: 'legs' });
  assert.deepEqual([legs.p.cut, legs.takes], ['leg_left', false]);
  const light = killingBlow(ROWS, { location: 'head', weapon: 'gladius', move: 'light_right' });   // below the cut rung: no cut, so no precedence to take
  assert.ok(light.p.strength < rules.strength_scale.rung_cut); assert.deepEqual([light.p.cut, light.takes], [null, false]);
  assert.equal(evaluatorTakesKill(ROWS, 'head', []), false); assert.equal(evaluatorTakesKill(ROWS, 'head', [null]), false);   // no verdict, no take
  assert.equal(evaluatorTakesKill(ROWS, 'head', [null, head.p]), true);   // any Hit of the killing batch that cuts
});

test('row \'finisher\' is today\'s behaviour, row \'evaluator\' on another zone is a data choice: only the row decides', () => {
  const finisher = { ...ROWS, cut: { ...ROWS.cut, precedence: { head: 'finisher' } } };
  assert.equal(killingBlow(finisher, { location: 'head' }).takes, false);   // the rotation as before, the same blow
  const torsoToo = { ...ROWS, cut: { ...ROWS.cut, precedence: { head: 'evaluator', torso: 'evaluator' } } };
  assert.equal(killingBlow(torsoToo, { location: 'torso' }).takes, true);
  assert.equal(killingBlow(torsoToo, { location: 'legs' }).takes, false);
});

test('without ?rules=m4 nothing changes: the pick is the rotation\'s (null) whatever the killing blow, and a ragdoll that is not ready never takes a kill', () => {
  const kill = [hit({ weapon: 'longsword', move: 'heavy_overhead', location: 'head' }), { tick: 600, type: 'Killed', actor: 0, target: 1, move: 'heavy_overhead', location: 'head', heading: 0 }];
  assert.equal(ragdollFinisher(), null); assert.equal(ragdollFinisher(kill), null);   // no ragdoll on the page at all
  for (const search of ['', '?rules=v1', '?rules=m4']) {
    foeRagdollFor(search, 'pitborn');   // built but not attached (no chunk): not armed, no evaluator
    assert.equal(ragdollFinisher(kill), null, search || '(default)');
  }
});

test('debug.setPartHp (the stills\' WRITE of a part\'s HP) exists on local hosts and in node, not on a live host; the read (debug.fighter) stays', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'location');
  try {
    globalThis.location = { hostname: 'www.example.com' };
    const live = createRulesEval(ROWS, pkg, BODY, 'pitborn', () => 0);
    assert.equal(live.debug.setPartHp, undefined); assert.equal(typeof live.debug.fighter, 'function');
    const copy = live.debug.fighter(); copy.parts.leg_left.hp = 0; copy.weapon_dropped = true;   // the read is a copy: a console cannot change the live state through it
    assert.ok(live.debug.fighter().parts.leg_left.hp > 0); assert.notEqual(live.debug.fighter().weapon_dropped, true); assert.equal(live.debug.partFractions().leg_left, 1);
    globalThis.location = { hostname: 'localhost' };
    assert.equal(typeof createRulesEval(ROWS, pkg, BODY, 'pitborn', () => 0).debug.setPartHp, 'function');
  } finally { if (had) Object.defineProperty(globalThis, 'location', had); else delete globalThis.location; }
});
