// A strike cuts the fallen body (data/physics.json cut.strike, src/fight/cut-strike.ts; Dom 2026-10-28, phone: the hint said "Strike to dismember" and nothing cut).
// Pinned through the REAL input layer (src/fight/input.ts, the DOM faked as test/kbm.test.mjs does): a touch press on STRIKE, the heavy, the stab, the kick, a spell, the keys and a mouse click all
// reach env.strike; guard, parry and steps do not; the mouse click carries its point and cuts once. Then the strike rows: the AIMED pass (the part under the point), the NEXT pass (the next unit of
// cut.tap.order still on a body within nearM), repeated presses take all six units in order, a far body is not cut, a tap cuts once however many ragdolls listen, and the page wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInput } from '../src/fight/input.ts';
import { initialPractice } from '../src/fight/combat.ts';
import { validateFile } from '../src/sim/validate.js';
import { kbmFor } from '../src/fight/kbm.ts';
import { corpseCutState, isAttackAction, isNear, nextUnit, registerCorpseSource, registerDyingSource, registerStrikeSource, setHeroLocator, setPendingWindow, strikeBinds, strikeCut, strikeOnce, strikePending, strikeReplay } from '../src/fight/cut-strike.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const PHYSICS = JSON.parse(read('../data/physics.json')), STRIKE = PHYSICS.cut.strike, ORDER = PHYSICS.cut.tap.order;

function fake() {
  const handlers = {};
  return {
    handlers, dataset: {}, style: {}, offsetWidth: 0, tagName: 'DIV',
    addEventListener: (t, f) => { (handlers[t] ??= []).push(f); },
    fire(t, e = {}) { for (const f of handlers[t] ?? []) f({ button: 0, pointerId: 1, pointerType: 'touch', preventDefault() {}, ...e }); },
    setPointerCapture() {}, setAttribute() {}, click() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 72, height: 72 }),
  };
}
function rig(opts = {}) {
  const els = {}, win = fake(), calls = [];
  let now = 0;
  const practice = initialPractice();
  const p = { ...practice, duel: { ...practice.duel, fighters: [{ ...practice.duel.fighters[0], phase: 'ready', stamina: 100 }, practice.duel.fighters[1]] } };
  const controls = createInput({
    element: (id) => (els[id] ??= fake()), window: win, now: () => now, matchMedia: () => ({ matches: true }), innerWidth: () => 375,
    paused: () => false, ready: () => true, practice: () => p, quiet: () => {},
    strike: (aim) => calls.push(aim),
    ...(opts.kbm ? { kbm: opts.kbm, free: () => false } : {}),
  });
  return { controls, els, win, calls, at(t) { now = t; }, key: (type, code) => win.fire(type, { code, repeat: false, target: { tagName: 'BODY' } }) };
}

test('the strike row validates; a bad row is refused', () => {
  assert.deepEqual(validateFile('physics', PHYSICS), []);
  assert.equal(STRIKE.on, true);
  assert.ok(STRIKE.nearM > 0 && STRIKE.nearM <= 20);
  const bad = structuredClone(PHYSICS); bad.cut.strike.nearM = 'close';
  assert.match(validateFile('physics', bad).join('|'), /strike\.nearM/);
  const stray = structuredClone(PHYSICS); stray.cut.strike2 = {};
  assert.match(validateFile('physics', stray).join('|'), /strike2/);
});

test('which actions are attacks', () => {
  for (const a of ['light', 'light_left', 'light_right', 'heavy', 'heavy_left', 'heavy_right', 'heavy_thrust', 'heavy_overhead', 'thrust', 'kick', 'skill', 'skill2']) assert.ok(isAttackAction(a), a);
  for (const a of ['parry', 'dodge', 'backstep', 'guard']) assert.ok(!isAttackAction(a), a);
});

test('touch: a press on STRIKE reaches the strike, with no aim; so does the heavy, the stab, the kick and a spell', () => {
  const r = rig();
  r.at(0); r.els['attack-button'].fire('pointerdown', { clientX: 36, clientY: 36 });
  r.at(40); r.els['attack-button'].fire('pointerup', { clientX: 36, clientY: 36 });
  assert.deepEqual(r.calls, [null], 'one tap on STRIKE = one strike, no point');
  for (const id of ['kick-button', 'skill-button', 'skill2-button']) { const n = r.calls.length; r.els[id].fire('pointerdown'); assert.equal(r.calls.length, n + 1, id); }
  r.key('keydown', 'KeyF');   // the keyboard's strike
  assert.ok(r.calls.length >= 5, 'F strikes');
  assert.ok(r.calls.every((a) => a === null));
});

test('after a kill #attack-button has no box and the thumb lands on the cluster itself: that press strikes; a press on a button is not counted twice', () => {
  const r = rig();
  r.els.actions.fire('pointerdown', { target: { closest: () => null } });
  assert.deepEqual(r.calls, [null], 'a press on #actions, not on a button, is the strike');
  r.els.actions.fire('pointerdown', { target: { closest: () => ({}) } });   // bubbled up from a button: its own handler already asked
  assert.equal(r.calls.length, 1);
  r.els.actions.fire('pointerdown', { button: 2, target: { closest: () => null } });
  assert.equal(r.calls.length, 1, 'not a secondary button');
});

test('regression (fails on e9685c3): after a kill a press at the STRIKE circle\'s centre cuts: the thumb lands on #actions, #attack-button has no box', () => {
  const r = rig(), centre = { target: { closest: () => null }, clientX: 271, clientY: 684 };
  r.els['attack-button'].getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 });   // the measured state after a kill
  setHeroLocator(() => ({ x: 0, z: 0 }));
  const b = body({ at: { x: 1, z: 0 } }), leave = registerStrikeSource(b.src);
  try {
    // main.ts: strike -> strikeCut; here the env's strike is the page's
    const page = createInput({ element: (id) => (r.els[id] ??= fake()), window: r.win, now: () => 0, matchMedia: () => ({ matches: true }), innerWidth: () => 375, paused: () => false, ready: () => true, practice: () => initialPractice(), quiet: () => {}, strike: (aim) => strikeCut(aim) });
    assert.ok(page);
    r.els.actions.fire('pointerdown', centre);
    assert.deepEqual([...b.done], ['head'], 'one press, the head (the next unit)');
    r.els.actions.fire('pointerdown', centre);
    assert.deepEqual([...b.done], ['head', 'arm_left']);
  } finally { leave(); }
});

test('corpseCutState: the frozen bodies with units left, read-only, one reused array; empty when none', () => {
  assert.deepEqual([...corpseCutState()], []);
  let left = 3;
  const leave = registerCorpseSource((push) => { if (left > 0) push(4, -2, left); });
  try {
    const a = corpseCutState();
    assert.deepEqual(a.map((c) => ({ ...c })), [{ x: 4, z: -2, remainingUnits: 3 }]);
    left = 0;
    assert.equal(corpseCutState(), a, 'the same array every call');
    assert.deepEqual([...a], [], 'a body with nothing left is not listed');
  } finally { leave(); }
  assert.deepEqual([...corpseCutState()], []);
});

test('guard, parry, backstep and roll are not attacks: no strike', () => {
  const r = rig();
  r.els['guard-button'].fire('pointerdown'); r.els['guard-button'].fire('pointerup');
  r.els['dodge-button'].fire('pointerdown'); r.els['dodge-button'].fire('pointerup');
  assert.deepEqual(r.calls, []);
});

test('mouse: a click carries its point and strikes once; with ?input=v1 (no KBM) the mouse is not bound', () => {
  const kbm = kbmFor('');
  strikeBinds.mouse = false;
  const r = rig({ kbm });
  assert.equal(strikeBinds.mouse, true, 'building the mouse strike tells the ragdoll to leave mouse taps to it');
  const canvas = r.els.world;
  r.at(0); canvas.fire('pointerdown', { pointerType: 'mouse', button: 0, clientX: 120, clientY: 340 });
  r.at(60); canvas.fire('pointerup', { pointerType: 'mouse', button: 0, clientX: 120, clientY: 340 });
  assert.deepEqual(r.calls, [{ x: 120, y: 340 }], 'one click, one strike, at the click');
  r.calls.length = 0; r.key('keydown', 'KeyF');
  assert.deepEqual(r.calls, [null], 'the next key press does not reuse the click point');
  strikeBinds.mouse = false;
  rig({ kbm: null });
  assert.equal(strikeBinds.mouse, false);
});

// A stand-in for a ragdoll's two passes with the contract ragdoll.ts keeps: the aimed pass cuts the unit under the point (any distance), the next pass the next unit of the order within nearM.
function body({ at, partAt = {} }) {
  const done = new Set();
  const src = (req) => {
    if (req.pass === 'aimed') { const u = req.aim && partAt[`${req.aim.x},${req.aim.y}`]; if (u && !done.has(u)) { done.add(u); return { unit: u, source: 'tap' }; } return null; }
    if (!isNear(req.hero, at.x, at.z, STRIKE.nearM)) return null;
    const u = nextUnit(ORDER, done); if (!u) return null; done.add(u); return { unit: u, source: 'strike' };
  };
  return { done, src };
}

test('the NEXT pass: attacking without aiming cuts the six units in order, then nothing', () => {
  setHeroLocator(() => ({ x: 0, z: 0 }));
  const b = body({ at: { x: 2, z: 1 } }), leave = registerStrikeSource(b.src);
  try {
    const cut = [];
    for (let i = 0; i < 8; i++) cut.push(strikeCut(null)?.unit ?? null);
    assert.deepEqual(cut, [...ORDER, null, null], 'head, arms, legs, waist, then the body is done');
    assert.deepEqual(ORDER.slice().sort(), ['arm_left', 'arm_right', 'head', 'leg_left', 'leg_right', 'torso_waist']);
  } finally { leave(); }
});

test('the AIMED pass: the part under the point is cut first, the rest follow in order', () => {
  setHeroLocator(() => ({ x: 0, z: 0 }));
  const b = body({ at: { x: 2, z: 1 }, partAt: { '10,20': 'leg_right' } }), leave = registerStrikeSource(b.src);
  try {
    assert.equal(strikeCut({ x: 10, y: 20 }).unit, 'leg_right', 'aimed at a leg: that leg');
    assert.equal(strikeCut({ x: 10, y: 20 }).unit, 'head', 'the leg is gone: aimed again at it, the next unit instead');
    assert.equal(strikeCut({ x: 300, y: 300 }).unit, 'arm_left', 'a point on nothing: the next unit');
    assert.equal(strikeCut(null).unit, 'arm_right');
  } finally { leave(); }
});

test('a body further than nearM is not cut by the NEXT pass, but an aimed tap on it still is', () => {
  setHeroLocator(() => ({ x: 0, z: 0 }));
  const far = body({ at: { x: STRIKE.nearM + 5, z: 0 }, partAt: { '5,5': 'arm_left' } }), leave = registerStrikeSource(far.src);
  try {
    assert.equal(strikeCut(null), null, 'out of reach: an attack press cuts nothing');
    assert.equal(strikeCut({ x: 1, y: 1 }), null);
    assert.equal(strikeCut({ x: 5, y: 5 }).unit, 'arm_left', 'the tap on the part, as it has always been');
  } finally { leave(); }
  setHeroLocator(null);
  const lone = body({ at: { x: 1, z: 1 } }), leave2 = registerStrikeSource(lone.src);
  try { assert.equal(strikeCut(null), null, 'no hero yet: nobody is near'); } finally { leave2(); }
});

test('a tap is one cut however many ragdolls listen to it', () => {
  setHeroLocator(() => ({ x: 0, z: 0 }));
  const a = body({ at: { x: 1, z: 0 } }), b = body({ at: { x: 1, z: 1 } }), la = registerStrikeSource(a.src), lb = registerStrikeSource(b.src);
  try {
    // each ragdoll's pointerup handler calls strikeOnce with the same event time: the first runs, the rest see the key taken
    const first = strikeOnce(1234.5, { x: 1, y: 1 }), second = strikeOnce(1234.5, { x: 1, y: 1 });
    assert.equal(first.unit, 'head');
    assert.equal(second, null);
    assert.equal(a.done.size + b.done.size, 1);
    assert.ok(strikeOnce(1300, { x: 1, y: 1 }), 'the next tap is a new key');
  } finally { la(); lb(); }
});

// Early cuts (Dom 2026-10-29): a kill stays 'dying' ~2.6 s; an attack press then cut nothing. The press is kept ONCE (cut.strike.pendingS) and replayed when the body freezes.
// A stand-in body with the ragdoll's contract: its sources cut only once `frozen`; its dying source says it is near and not yet frozen.
function dyingBody(at) {
  const b = body({ at }), state = { frozen: false };
  const src = (req) => (state.frozen ? b.src(req) : null);
  return { ...b, state, src, dying: (hero) => !state.frozen && isNear(hero, at.x, at.z, STRIKE.nearM) };
}

test('early cuts: the row validates and a press during the dying phase is replayed once when the body freezes', () => {
  assert.ok(STRIKE.pendingS > 0 && Number.isFinite(STRIKE.pendingS), 'pendingS is a data row');
  const bad = structuredClone(PHYSICS); bad.cut.strike.pendingS = 'soon';
  assert.match(validateFile('physics', bad).join('|'), /strike\.pendingS/);
  setHeroLocator(() => ({ x: 0, z: 0 })); setPendingWindow(STRIKE.pendingS);
  const b = dyingBody({ x: 1, z: 0 }), l1 = registerStrikeSource(b.src), l2 = registerDyingSource(b.dying);
  try {
    assert.equal(strikeCut(null, 100), null, 'dying: nothing to cut yet');
    assert.equal(strikePending(), true, 'the press is kept');
    assert.equal(strikeCut(null, 100.5), null); assert.equal(strikeCut(null, 101), null);   // more presses while dying: still ONE kept press
    assert.equal(strikeReplay(101.5), null, 'still dying: replay does nothing');
    b.state.frozen = true;
    assert.equal(strikeReplay(102).unit, 'head', 'frozen: the kept press cuts, once');
    assert.equal(strikePending(), false);
    assert.equal(strikeReplay(102.1), null, 'no second replay: no double cut');
    assert.deepEqual([...b.done], ['head']);
    assert.equal(strikeCut(null, 103).unit, 'arm_left', 'a fresh press after: one cut per press');
  } finally { l1(); l2(); setPendingWindow(0); setHeroLocator(null); }
});

test('early cuts: a kept press expires after pendingS; a far body keeps nothing; the row at 0 keeps nothing; a press that cuts clears the kept one', () => {
  setHeroLocator(() => ({ x: 0, z: 0 }));
  const b = dyingBody({ x: 1, z: 0 }), l1 = registerStrikeSource(b.src), l2 = registerDyingSource(b.dying);
  try {
    setPendingWindow(STRIKE.pendingS);
    strikeCut(null, 0); assert.equal(strikePending(), true);
    b.state.frozen = true;
    assert.equal(strikeReplay(STRIKE.pendingS + 1), null, 'expired: dropped, not replayed');
    assert.equal(strikePending(), false);
    b.state.frozen = false;
    strikeCut(null, 10); b.state.frozen = true;
    assert.equal(strikeCut(null, 10.2).unit, 'head', 'a press on a frozen body cuts at once');
    assert.equal(strikePending(), false, 'and the kept press is gone: no extra cut');
    assert.equal(strikeReplay(10.3), null);
    setPendingWindow(0); b.state.frozen = false; b.done.clear();
    strikeCut(null, 20); assert.equal(strikePending(), false, 'pendingS 0: never kept');
    setPendingWindow(STRIKE.pendingS);
    setHeroLocator(() => ({ x: 50, z: 0 }));
    strikeCut(null, 30); assert.equal(strikePending(), false, 'dying body out of reach: nothing kept');
  } finally { l1(); l2(); setPendingWindow(0); setHeroLocator(null); }
});

test('early cuts: only attack presses reach strikeCut (guard, roll, kick wiring unchanged) and the ragdoll wires the dying source and the per-frame replay', () => {
  const rd = read('../src/fight/ragdoll.ts');
  assert.match(rd, /registerDyingSource\(/); assert.match(rd, /setPendingWindow\(/); assert.match(rd, /strikeReplay\(\)/);
  const r = rig();
  r.els['guard-button'].fire('pointerdown'); r.els['guard-button'].fire('pointerup');
  r.els['dodge-button'].fire('pointerdown'); r.els['dodge-button'].fire('pointerup');
  assert.deepEqual(r.calls, [], 'guard and roll never ask for a strike, so they never keep a press');
});

test('wiring: the page asks for the strike only while the foe is down; the ragdoll joins and its tap goes through the strike; the row off keeps the old tap', () => {
  const main = read('../src/client/main.ts'), rd = read('../src/fight/ragdoll.ts'), scene = read('../src/fight/scene.ts'), input = read('../src/fight/input.ts');
  assert.match(main, /strike: \(aim\) => \{ if \(\(practice\.finish && practice\.finish\.victim === 1\) \|\| \(ZONE && !engaged\)\) strikeCut\(aim\); \}/);
  assert.match(input, /if \(isAttackAction\(next\)\) env\.strike\?\.\(mouseAim\)/, 'every attack press goes through request()');
  assert.match(scene, /setHeroLocator\(/);
  assert.match(rd, /registerStrikeSource\(/);
  assert.match(rd, /strikeOnce\(e\.timeStamp/);
  assert.match(rd, /if \(!strike\?\.on\) \{ this\.tap\(aim\(e\.clientX, e\.clientY\)\); return; \}/, '?the row off: the tap as it was');
});
