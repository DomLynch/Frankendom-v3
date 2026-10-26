// The physics package's M4 hit/cut rules evaluator on the opponent's ragdoll (data/rules.json, src/fight/rules-eval.ts), opt-in ?rules=m4.
// Presentation only: these pin the rows against the package and the sim's own weapons, the query (V1's rules are the default), the mapping
// from a sim Hit event to the evaluator's input (light/heavy, head/torso/legs, counter-hit, stab, blunt) and the outcome the package gives for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEvaluator, createFighterState, loadRules } from '@frankendom/physics';
import { validateFile } from '../src/sim/validate.js';
import { createRulesEval, hitInput, present, rulesOnFor } from '../src/fight/rules-eval.ts';

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

test('V1\'s rules are the default: only ?rules=m4 turns the evaluator on', () => {
  assert.equal(ROWS.on, true);
  assert.equal(rulesOnFor(ROWS, ''), false);
  assert.equal(rulesOnFor(ROWS, '?rules=v1'), false);
  assert.equal(rulesOnFor(ROWS, '?rules=sometimes'), false);
  assert.equal(rulesOnFor(ROWS, '?physics=v1&foo=m4'), false);
  assert.equal(rulesOnFor(ROWS, '?rules=m4'), true);
  assert.equal(rulesOnFor(ROWS, '?x=1&rules=m4'), true);
  assert.equal(rulesOnFor({ ...ROWS, on: false }, '?rules=m4'), false);
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
  const k = outcomes[7];
  assert.equal(k.action, 'knockdown'); assert.equal(k.cause, 'damage');
  assert.equal(k.downS, rules.knockdown.fall_seconds.damage + rules.knockdown.fall_seconds.down);
  assert.deepEqual(outcomes.slice(0, 7).map((o) => o.action), Array(7).fill('stagger'));
  assert.equal(r.debug.byOutcome.knockdown, 1);
});

test('a kill is the sim\'s: while it lives the evaluator\'s kill is a knockdown, counted, and the fighter renewed; on the killing blow it is the kill', () => {
  const alive = createRulesEval(ROWS, pkg, BODY, 'pitborn', () => 0);
  const p = alive.hit(hit({ location: 'head', move: 'heavy_overhead' }), true);   // head budget 20: gone in one heavy
  assert.equal(p.outcome, 'kill'); assert.equal(p.deferredKill, true); assert.equal(p.action, 'knockdown'); assert.equal(p.cause, ROWS.killAs);
  assert.equal(alive.debug.deferredKills, 1); assert.equal(alive.debug.renewals, 1);
  const torso = createRulesEval(ROWS, pkg, BODY, 'pitborn', () => 0), t = torso.hit(hit({ weapon: 'longsword', move: 'heavy_overhead' }), true);   // a torso cut is a kill: neither happened
  assert.deepEqual([t.outcome, t.deferredKill, t.cut, torso.debug.cuts.length], ['kill', true, null, 0]);
  assert.equal(alive.hit(hit({ location: 'head', move: 'heavy_overhead', tick: 1200 }), true).outcome, 'kill');   // whole again: the head can be struck again
  const dead = createRulesEval(ROWS, pkg, BODY, 'pitborn', () => 0).hit(hit({ location: 'head', move: 'heavy_overhead' }), false);
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
