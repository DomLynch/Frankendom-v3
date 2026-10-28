// ROLL and GUARD are never gated on a fight (Dom 2026-10-28: "outside of combat (open world, desert exploring, no fight active) I cannot ROLL or GUARD; these must always be available").
// Three places the hero stands with no fight on: before the first aggro (the sword away, the sim's 'sheathed'), the kill's ceremony and the walk after a kill. Each is driven here through
// the REAL input layer (src/fight/input.ts with a faked DOM: the keyboard and the touch buttons) into the same quantizeIntent + stepPractice / stepFreeRoam the page runs, and the fight's own
// rules are checked unchanged: stamina cost, roll length, exhaustion, no swing out of a roll, the fight's rolls identical to the zone's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OPPONENTS, opponentAt } from '../src/fight/moves.ts';
import { initialPractice, project, stepPractice, accepts } from '../src/fight/combat.ts';
import { initialState } from '../src/fight/sim.ts';
import * as play from '../src/fight/play-radius.ts';
import { zoneFor } from '../src/zone/zone-rows.ts';
import { WORLD, poseAt, spotsFor, zoneDuel } from '../src/zone/spawns.ts';
import { RULES } from '../src/fight/rules.ts';
import { createInput } from '../src/fight/input.ts';
import { quantizeIntent } from '../src/fight/record.ts';
import { FREE_MOVES, freeHud, isFreeAction, startFreeRoam, stepFreeRoam, validateFreeMoves } from '../src/fight/free-roam.ts';
import { roamStep } from '../src/fight/zone-loop.ts';
import { legal, stepDuel, idleIntent } from '../src/fight/duel.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const FIGHT = JSON.parse(read('../data/fight.json')), ROWS = JSON.parse(read('../data/respawn.json')), ZONE = zoneFor('');
play.setPlayScale(WORLD.pitScale);
const body = opponentAt(OPPONENTS[FIGHT.opponent], FIGHT.level);
const made = () => initialPractice(7, body, FIGHT.weapon, FIGHT.skill);
const zoned = () => { const p = made(), [A] = spotsFor(ZONE); return project(zoneDuel(p.duel, poseAt({ x: A.x + 6, z: A.z + 1 }, A, play.OPEN_RADIUS, ROWS.spawn.minDistance, initialState())), p.ai, p); };

// The page's input layer on fake DOM: elements are event targets; `step()` is one sim tick of main.ts (intent -> quantizeIntent -> stepPractice -> consumed).
function fake() {
  const handlers = {};
  return {
    handlers, dataset: {}, style: {}, offsetWidth: 0,
    addEventListener: (t, f) => { (handlers[t] ??= []).push(f); },
    fire(t, e = {}) { for (const f of handlers[t] ?? []) f({ button: 0, pointerId: 1, preventDefault() {}, ...e }); },
    setPointerCapture() {}, setAttribute() {}, click() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 50, height: 50 }),
  };
}
function rig(start, { walking = () => false } = {}) {
  const els = {}, win = fake();
  let now = 0, practice = start;
  const controls = createInput({
    element: (id) => (els[id] ??= fake()), window: win, now: () => now, matchMedia: () => ({ matches: false }), innerWidth: () => 375,
    paused: () => false, ready: () => true, practice: () => practice, quiet: () => {}, walking,
  });
  const key = (code, type = 'keydown') => win.fire(type, { code });
  return {
    els, key, controls, win,
    get practice() { return practice; },
    set practice(p) { practice = p; },
    tick(n = 1) {
      for (let i = 0; i < n; i++) {
        now += 1000 / 60; controls.promoteDodge(now);
        const it = controls.intent();
        const duelIntent = quantizeIntent({ move: { x: it.x, z: it.z, yaw: 0, run: it.run }, action: it.action, guard: it.guard, guardDirection: it.guardDirection ?? undefined, held: it.held, lock: false, cancel: it.cancel });
        practice = stepPractice(practice, duelIntent);
        controls.consumed(practice.events);
      }
    },
  };
}
const hero = (r) => r.practice.duel.fighters[0];

test('before the first aggro: the roll button and key move the sword-away hero with the roll clip, at the fight\'s own cost and length', () => {
  const r = rig(zoned());
  assert.equal(hero(r).phase, 'sheathed', 'nothing has drawn: no fight is on');
  assert.equal(accepts(r.practice, 'dodge'), true, 'the HUD button reads enabled (hud.ts ok[3])');
  const from = { x: hero(r).body.x, z: hero(r).body.z }, stamina = hero(r).stamina;
  r.key('KeyW'); r.key('KeyE'); r.key('KeyE', 'keyup');   // forward + roll, as the keyboard sends it
  r.tick(1);
  assert.equal(hero(r).phase, 'roll', 'the press rolls (not refused)');
  assert.ok(hero(r).stamina <= stamina - RULES.rollCost + 1, 'RULES.rollCost leaves the pool');
  r.tick(RULES.roll - 2);
  const moved = Math.hypot(hero(r).body.x - from.x, hero(r).body.z - from.z);
  assert.ok(moved > 1, `the roll travels (${moved.toFixed(2)} m)`);
  assert.equal(hero(r).phase, 'roll');
  r.tick(4);
  assert.equal(hero(r).phase, 'sheathed', 'the roll ends with the sword away again, no fight started');
  assert.equal(r.practice.finish, null);
});

test('before the first aggro: a tap on the touch ROLL button rolls; the step back (tap with no stick) steps', () => {
  const r = rig(zoned());
  r.els['dodge-button'].fire('pointerdown', { pointerId: 9 });   // no stick: the tap is the step back
  r.tick(1);
  assert.equal(hero(r).phase, 'backstep');
  r.els['dodge-button'].fire('pointerup', { pointerId: 9 });
  r.tick(RULES.backstep.ticks + 2);
  assert.equal(hero(r).phase, 'sheathed');
  // held past HOLD_MS it grows into the roll (promoteDodge)
  r.tick(40);
  r.els['dodge-button'].fire('pointerdown', { pointerId: 10 });
  r.tick(1);
  assert.equal(hero(r).phase, 'backstep');
  r.tick(15);
  assert.equal(hero(r).phase, 'roll', 'a held step becomes the roll');
});

test('before the first aggro: GUARD raises on the touch button and the Q key, and releases', () => {
  const r = rig(zoned());
  r.els['guard-button'].fire('pointerdown', { pointerId: 3 });
  r.tick(2);
  assert.equal(hero(r).phase, 'guard', 'the thumb on GUARD raises it');
  r.tick(40);
  assert.equal(hero(r).phase, 'guard', 'held, it stays up');
  r.els['guard-button'].fire('pointerup', { pointerId: 3 });
  r.tick(6);
  assert.equal(hero(r).phase, 'sheathed', 'released, the sword goes away again');
  r.key('KeyQ');
  r.tick(40);
  assert.equal(hero(r).phase, 'guard');
  r.key('KeyQ', 'keyup');
  r.tick(6);
  assert.equal(hero(r).phase, 'sheathed');
});

test('no swing comes out of a free roll or guard before the draw, and the draw still works afterwards; a heavy from the sheath stays refused', () => {
  const r = rig(zoned());
  r.key('KeyW'); r.key('KeyE'); r.key('KeyE', 'keyup'); r.key('KeyW', 'keyup');
  r.tick(1);
  assert.equal(hero(r).phase, 'roll');
  assert.equal(legal({ ...hero(r) }, 'light'), false, 'a swing out of the roll waits for the draw');
  r.tick(RULES.roll + 3);
  assert.equal(hero(r).phase, 'sheathed');
  assert.equal(legal(hero(r), 'light'), true, 'the draw is the light press, as before');
  assert.equal(legal(hero(r), 'heavy'), false, 'sheathed heavy is refused, as before');
});

test('the fight is untouched: outside the zone a sheathed hero is still refused; in a drawn fight the zone hero rolls exactly as the plain one', () => {
  const plain = rig(made());
  assert.equal(accepts(plain.practice, 'dodge'), false);
  plain.key('KeyW'); plain.key('KeyE'); plain.key('KeyE', 'keyup'); plain.tick(3);
  assert.equal(hero(plain).phase, 'sheathed', 'the single fight and Gate 0 never see the free hero');
  assert.ok(!('free' in hero(plain)));
  const ready = (p) => ({ ...p, duel: { ...p.duel, fighters: [{ ...p.duel.fighters[0], phase: 'ready', stamina: 100 }, p.duel.fighters[1]] } });
  const a = rig(ready(zoned())), b = rig(ready(made()));
  for (const r of [a, b]) { r.key('KeyW'); r.key('KeyE'); r.key('KeyE', 'keyup'); r.tick(RULES.roll + 4); }
  const strip = (f) => ({ ...f, free: undefined, body: { ...f.body, x: 0, z: 0 } });
  assert.deepEqual(strip(hero(a)).phase, strip(hero(b)).phase);
  assert.equal(hero(a).stamina, hero(b).stamina, 'stamina rules unchanged');
});

test('a free roll still obeys exhaustion and the stamina cost: too tired, it is refused', () => {
  const p = zoned();
  const tired = { ...p, duel: { ...p.duel, fighters: [{ ...p.duel.fighters[0], stamina: RULES.rollCost - 1 }, p.duel.fighters[1]] } };
  assert.equal(legal(tired.duel.fighters[0], 'dodge'), false);
  const spent = { ...p.duel.fighters[0], exhausted: true };
  assert.equal(legal(spent, 'dodge'), false);
  assert.equal(legal(spent, 'parry'), false);
});

// ---- after a kill: the walk -------------------------------------------------------------------------------------------------------------------------------------------------------
const killed = () => { const p = zoned(), [h, f] = p.duel.fighters; return project({ ...p.duel, fighters: [{ ...h, phase: 'ready' }, { ...f, health: 0 }] }, p.ai, p); };
const wall = ROWS.postKill.walkRadiusMetres ?? play.OPEN_RADIUS;
const intentOf = (o = {}) => quantizeIntent({ move: { x: 0, z: 0, yaw: 0, run: false }, action: null, guard: false, lock: false, ...o });

test('the walk after a kill: idle it is exactly roamStep, the walking hero rolls and steps with the roll clip, travels and gets his sword-away back', () => {
  const k = killed(), start = { ...k.duel.fighters[0].body };
  let free = startFreeRoam(k.duel, wall), roam = start;
  const stick = { move: { x: 0, z: -1, yaw: 0, run: false } };
  let plain = start;
  for (let i = 0; i < 30; i++) {
    const s = stepFreeRoam(free, roam, intentOf(stick), wall);
    plain = roamStep(plain, stick.move, k.duel.fighters[1].body, wall);
    free = s.free; roam = s.body;
  }
  assert.deepEqual(roam, plain, 'idle, the walk is the zone loop\'s roamStep to the bit');
  const stamina = free.duel.fighters[0].stamina;
  let s = stepFreeRoam(free, roam, intentOf({ ...stick, action: 'dodge' }), wall);
  assert.equal(s.free.duel.fighters[0].phase, 'roll');
  assert.ok(s.free.duel.fighters[0].stamina < stamina);
  const before = roam; free = s.free; roam = s.body;
  for (let i = 0; i < RULES.roll - 1; i++) { s = stepFreeRoam(free, roam, intentOf(stick), wall); free = s.free; roam = s.body; }
  assert.ok(Math.hypot(roam.x - before.x, roam.z - before.z) > 1.5, 'the roll carries him');
  for (let i = 0; i < 4; i++) { s = stepFreeRoam(free, roam, intentOf(stick), wall); free = s.free; roam = s.body; }
  assert.equal(free.duel.fighters[0].phase, 'ready', 'back to the walk');
  assert.equal(freeHud(free).dodge, free.duel.fighters[0].stamina >= RULES.backstep.cost);
});

test('the walk after a kill: GUARD raises while held, releases, and the buttons read enabled', () => {
  const k = killed();
  let free = startFreeRoam(k.duel, wall), roam = k.duel.fighters[0].body;
  assert.equal(accepts(k, 'parry'), false, 'the finished fight takes no guard: the free hero does');
  assert.deepEqual(freeHud(free), { dodge: true, guard: true, guarding: false });
  for (let i = 0; i < 20; i++) { const s = stepFreeRoam(free, roam, intentOf({ guard: true }), wall); free = s.free; roam = s.body; }
  assert.equal(free.duel.fighters[0].phase, 'guard');
  assert.equal(freeHud(free).guarding, true);
  for (let i = 0; i < 8; i++) { const s = stepFreeRoam(free, roam, intentOf({}), wall); free = s.free; roam = s.body; }
  assert.equal(free.duel.fighters[0].phase, 'ready');
});

test('the real input layer on the walk: with the hero standing, ROLL and GUARD presses reach the page even though the finished fight accepts none', () => {
  const r = rig(killed(), { walking: () => true });
  r.key('KeyW'); r.key('KeyE'); r.key('KeyE', 'keyup');
  const it = r.controls.intent();
  assert.equal(it.action, 'dodge', 'the roll press is taken');
  r.controls.consumed([]);
  r.els['guard-button'].fire('pointerdown', { pointerId: 4 });
  assert.equal(r.controls.intent().guard, true);
  const idle = rig(killed());   // not walking (a dead hero): the finished fight's gate stands
  idle.key('KeyE'); idle.key('KeyE', 'keyup');
  assert.equal(idle.controls.intent().action, null);
  // a free press never lets a swing through
  const swing = rig(killed(), { walking: () => true });
  swing.key('KeyF');
  assert.equal(swing.controls.intent().action, null);
});

test('the row: always on (no URL flag), the three free presses, a bad row throws', () => {
  assert.deepEqual([...FREE_MOVES.actions], ['dodge', 'backstep', 'parry']);
  assert.equal(isFreeAction('dodge') && isFreeAction('backstep') && isFreeAction('parry'), true);
  assert.equal(isFreeAction('light') || isFreeAction('heavy') || isFreeAction('kick') || isFreeAction(null), false);
  assert.equal('query' in ROWS.freeMoves || 'off' in ROWS.freeMoves, false, 'no new URL flag');
  assert.throws(() => validateFreeMoves({ actions: [] }), /non-empty/);
  assert.throws(() => validateFreeMoves({ actions: ['light'] }), /not one of/);
});

test('the page wires it: the kill ceremony ends on a roll or guard press, the walk steps the free hero, the HUD and the pose follow him', () => {
  const main = read('../src/client/main.ts'), hud = read('../src/fight/hud.ts');
  assert.match(main, /isFreeAction\(duelIntent\.action\)/, 'a roll or guard press ends the ceremony as the stick does');
  assert.match(main, /stepFreeRoam\(freeRoam, roam, duelIntent, ZONE!\.walkRadius\)/);
  assert.match(main, /walking: \(\) => heroStands\(\)/);
  assert.match(main, /free: freeHud\(freeRoam\)/);
  assert.match(hud, /view\.free \? view\.free\.dodge : ok\[3\]/);
});

test('a hero on the sheath who is hit mid free-roll is out of it cleanly (no stuck flag blocking his swing)', () => {
  const p = zoned();
  let duel = p.duel;
  const roll = stepDuel(duel, [{ move: { x: 0, z: 1, yaw: 0, run: false }, action: 'dodge', guard: false, lock: false }, idleIntent()]);
  assert.equal(roll.fighters[0].phase, 'roll');
  assert.equal(roll.fighters[0].unsheathed, true);
  const hurt = { ...roll, fighters: [{ ...roll.fighters[0], phase: 'hurt', age: 0, stun: 5 }, roll.fighters[1]] };
  let d = hurt;
  for (let i = 0; i < 12; i++) d = stepDuel(d, [idleIntent(), idleIntent()]);
  assert.ok(!d.fighters[0].unsheathed, 'the flag is gone once he is out of the move');
  assert.equal(legal(d.fighters[0], 'light'), true);
});
