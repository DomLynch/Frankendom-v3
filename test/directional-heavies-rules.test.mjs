// V3 directional heavies everywhere a heavy (or stab) rule applies (review of PR #10): sound, the AI's reads, the sim's shaft-guard break, whiff hang and stop-hit,
// the sandbox rows, the camera's parry nudge and the HUD's refused shake. Every rule asks move-rows.ts (heavyOf / strikeOf / isHeavyMove / isStabMove) or duel.ts
// (heavyBlow / guardBreaker), never a hand list; V1's moves answer themselves, so no V1 fight changes (Gate 0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIRECTIONAL_HEAVY_IDS, heavyOf, strikeOf, isHeavyMove, isStabMove, isDirectionalHeavy } from '../src/fight/move-rows.ts';
import { OPPONENTS, RULES, weaponOf } from '../src/fight/moves.ts';
import { initialDuel, stepDuel, idleIntent, guardBreaker, heavyBlow } from '../src/fight/duel.ts';
import { decide, initialAi } from '../src/fight/ai.ts';
import { cuesFor } from '../src/fight/sound/cues.ts';
import { refusedButton } from '../src/fight/combat.ts';   // hud.ts's `refused` asks it (hud.ts itself loads three.js via stubs.ts, which node cannot here)

const IDS = ['heavy_right', 'heavy_left', 'heavy_thrust'];
const V1_MOVES = ['light_right', 'light_left', 'heavy_overhead', 'thrust', 'riposte', 'slash_riposte', 'heavy_riposte', 'heavy_counter', 'critical', 'kick', 'skill_cleave'];

test('helpers: a directional heavy weighs as the overhead and strikes as its blade; every V1 move answers itself', () => {
  assert.deepEqual(DIRECTIONAL_HEAVY_IDS, IDS);
  for (const id of IDS) { assert.equal(heavyOf(id), 'heavy_overhead'); assert.equal(isHeavyMove(id), true); assert.equal(isDirectionalHeavy(id), true); }
  assert.deepEqual(IDS.map(strikeOf), ['light_right', 'light_left', 'thrust']);
  assert.deepEqual(IDS.map(isStabMove), [false, false, true]);
  for (const m of V1_MOVES) { assert.equal(heavyOf(m), m); assert.equal(strikeOf(m), m); assert.equal(isDirectionalHeavy(m), false); }
  assert.deepEqual(V1_MOVES.filter(isHeavyMove), ['heavy_overhead']);
  assert.deepEqual(V1_MOVES.filter(isStabMove), ['thrust']);
  assert.equal(isHeavyMove(null), false); assert.equal(isStabMove(undefined), false);
});

test('sound: a directional heavy swings and hits as the heavy; the heavy stab kills with the stab, the side heavies with the cut', () => {
  const names = (events) => cuesFor(events).map((c) => c.name);
  const at = (o) => ({ tick: 1, actor: 0, target: 1, ...o });
  for (const id of ['heavy_overhead', ...IDS]) {
    assert.ok(names([at({ type: 'AttackStarted', move: id })]).includes('whoosh_heavy'), `${id} swing`);
    assert.ok(names([at({ type: 'Hit', move: id, damage: 18, location: 'torso' })]).includes('hit_heavy'), `${id} hit`);
  }
  assert.ok(names([at({ type: 'AttackStarted', move: 'light_right' })]).includes('whoosh_light'), 'a light still swings light');
  const kill = (move) => names([at({ type: 'Hit', move, damage: 40, location: 'torso' }), at({ type: 'Killed', move, location: 'torso' })]);
  assert.ok(kill('heavy_thrust').includes('flesh_stab') && !kill('heavy_thrust').includes('flesh_cut'), 'heavy stab kill');
  assert.ok(kill('thrust').includes('flesh_stab'), 'thrust kill');
  for (const id of ['heavy_right', 'heavy_left', 'heavy_overhead']) assert.ok(kill(id).includes('flesh_cut') && !kill(id).includes('flesh_stab'), `${id} kill`);
});

test('the shaft-guard rule: every heavy blow breaks a heavyBreaks guard (V1 keyed it on the overhead, i.e. its heavy class), a scutum stops them all', () => {
  const w = weaponOf('longsword'), shaft = { heavyBreaks: true, stopsHeavy: false }, plain = { heavyBreaks: false, stopsHeavy: false };
  for (const id of ['heavy_overhead', 'heavy_riposte', 'heavy_counter', 'critical', ...IDS]) {
    assert.equal(heavyBlow(w.moves[id]), true, id);
    assert.equal(guardBreaker(shaft, w.moves[id], false), true, `${id} vs a shaft`);
    assert.equal(guardBreaker(plain, w.moves[id], false), w.moves[id].breaksGuard, `${id} vs a blade guard, uncharged: only its own breaksGuard`);
  }
  for (const id of ['light_right', 'light_left', 'thrust', 'riposte', 'kick']) assert.equal(guardBreaker(shaft, w.moves[id], false), w.moves[id].breaksGuard, `${id} vs a shaft: only its own breaksGuard`);
  for (const id of IDS) assert.equal(guardBreaker(plain, w.moves[id], true), true, `${id} charged`);
});

// The player walks in on a standing warden, then throws `action`; `warden(i)` is the warden's intent on tick i of the 90 after the press.
const it = (o = {}) => ({ ...idleIntent(), ...o });
function setup(stop = 1.4, edit) {
  let d = initialDuel(OPPONENTS.veteran);
  d = stepDuel(d, [it({ action: 'light' }), it({ action: 'light' })]);
  for (let i = 0; i < 60; i++) d = stepDuel(d, [it(), it()]);
  for (let i = 0; i < 300; i++) {
    const [a, b] = d.fighters;
    if (Math.hypot(a.body.x - b.body.x, a.body.z - b.body.z) < stop) break;
    d = stepDuel(d, [it({ move: { x: 0, z: -1, yaw: 0, run: false } }), it()]);
  }
  return edit ? edit(d) : d;
}
function exchange(d, action, warden = () => it(), ticks = 90) {
  const events = [], states = [];
  for (let i = 0; i <= ticks; i++) { d = stepDuel(d, [i === 0 ? it({ action }) : it(), warden(i)]); events.push(...d.events); states.push(d); }
  return { events: events.filter((e) => e.actor === 0 || e.target === 0), states };
}
const outcome = (events) => events.find((e) => ['Hit', 'Blocked', 'Parried', 'GuardBroken', 'AttackMissed'].includes(e.type) && e.move !== 'kick');
const withGuard = (profile) => (d) => ({ ...d, fighters: [d.fighters[0], { ...d.fighters[1], guardProfile: { ...d.fighters[1].guardProfile, ...profile } }] });

test('sim: a shaft guard on the right side is broken by an uncharged directional heavy, held against the lights; a scutum holds them', () => {
  const guards = { heavy_right: 'left', heavy_left: 'right', heavy_thrust: null, heavy: 'overhead', light_right: 'left', thrust: null };
  for (const [action, side] of Object.entries(guards)) {
    const hold = () => it({ guard: true, ...(side ? { guardDirection: side } : {}) });
    const settle = (d) => { for (let i = 0; i < 20; i++) d = stepDuel(d, [it(), hold()]); return d; };
    const shaft = outcome(exchange(settle(setup(1.4, withGuard({ heavyBreaks: true }))), action, hold).events);
    assert.equal(shaft?.type, action.startsWith('heavy') ? 'GuardBroken' : 'Blocked', `${action} vs a shaft guard`);
    const scutum = outcome(exchange(settle(setup(1.4, withGuard({ heavyBreaks: true, stopsHeavy: true }))), action, hold).events);
    assert.equal(scutum?.type, 'Blocked', `${action} vs a scutum`);
  }
});

test('sim: a whiffed heavy stab hangs at full extension as the thrust does; the side heavies do not', () => {
  for (const action of ['thrust', 'heavy_thrust', 'heavy_right', 'heavy_left', 'heavy']) {
    const { states } = exchange(setup(9), action);
    const missed = states.findIndex((s) => s.events.some((e) => e.type === 'AttackMissed' && e.actor === 0));
    assert.ok(missed >= 0, `${action} misses from afar`);
    const stall = states[missed].fighters[0].stall;
    assert.equal(stall, isStabMove(action) ? RULES.stopHit.whiff : 0, `${action} whiff hang`);
  }
});

test('sim: the heavy stab is a stop-hit into a swing; the side heavies are a plain counter-hit', () => {
  const swinging = (d) => ({ ...d, fighters: [d.fighters[0], { ...d.fighters[1], phase: 'attack', move: 'heavy_overhead', age: 0, charge: 0, stamina: 1000 }] });
  const into = (action) => {
    let d = setup(1.4);
    const id = action === 'heavy' ? 'heavy_overhead' : action, lead = weaponOf(d.fighters[0].weapon).moves[id].windup - 2;
    d = stepDuel(d, [it({ action }), it()]);
    for (let i = 0; i < lead; i++) d = stepDuel(d, [it({ held: false }), it()]);
    return outcome(exchange(swinging(d), null, () => it(), 20).events);
  };
  const right = into('heavy_right'), stab = into('heavy_thrust');
  assert.equal(right?.type, 'Hit', 'heavy right lands'); assert.equal(stab?.type, 'Hit', 'heavy stab lands');
  assert.equal(right.counter, true); assert.equal(stab.counter, true);
  assert.ok(stab.damage > right.damage, `the stop-hit (x${RULES.stopHit.damage}) out-hits the counter (x${RULES.counter.damage}): ${stab.damage} vs ${right.damage}`);
});

test('AI: the player\'s directional heavies count as heavies in its habits, and the heavy stab is a tell', () => {
  const profile = OPPONENTS.veteran.profiles.normal;
  const seen = (move) => {
    const d = initialDuel(OPPONENTS.veteran);
    const duel = { ...d, fighters: [{ ...d.fighters[0], phase: 'attack', move, age: 0 }, d.fighters[1]] };
    return decide(duel, 1, initialAi(), profile).ai.habits;
  };
  for (const id of ['heavy_overhead', ...IDS]) assert.deepEqual([seen(id).heavies, seen(id).thrusts], [1, 0], id);
  assert.deepEqual([seen('thrust').heavies, seen('thrust').thrusts], [0, 1]);
  const ai = readFileSync(new URL('../src/fight/ai.ts', import.meta.url), 'utf8');
  assert.match(ai, /isTell\(opponent\.move\)/, 'the tell reaction asks isTell (thrust, the heavy stab, the tell skills)');
  assert.match(ai, /heavyBlow\(move\)/, 'the brace asks the sim\'s heavyBlow');
  assert.match(ai, /guardBreaker\(guardOf\(self\), move, charging\(opponent\)\)/, 'the unblockable read asks the sim\'s guardBreaker');
});

test('sandbox rows: the heavy stab pierces, the maul and warhammer commit every heavy, each heavy throws its side\'s lane', () => {
  const defs = JSON.parse(readFileSync(new URL('../src/fight/sandbox-rules-defs.json', import.meta.url), 'utf8'));
  const kind = (move) => defs.blowKinds.find((r) => r.weapon === '*' && r.move === move)?.kind;
  assert.equal(kind('heavy_thrust'), kind('thrust'));
  for (const w of ['maul', 'warhammer']) {
    const base = defs.commit.find((r) => r.weapon === w && r.move === 'heavy_overhead');
    for (const id of IDS) assert.equal(defs.commit.find((r) => r.weapon === w && r.move === id)?.windup, base.windup, `${w} ${id}`);
  }
  const lane = (move) => defs.missileLanes.find((r) => r.move === move);
  const heavy = lane('heavy_overhead');
  for (const id of IDS) {
    assert.equal(lane(id)?.lane, lane(strikeOf(id)).lane, `${id} lane`);
    assert.equal(lane(id)?.mult, heavy.mult, `${id} mult`);
  }
});

// camera-kick.ts imports three.js (via clash-sparks.ts), which node cannot load here: the rule is read from its source, the helper it asks is run.
test('camera: a parried heavy left nudges the way a parried left cut does', () => {
  const src = readFileSync(new URL('../src/fight/camera-kick.ts', import.meta.url), 'utf8');
  assert.match(src, /case 'Parried': return \{[^}]*side: strikeOf\(event\.move\) === 'light_left' \? -0\.02 : 0\.02,/);
  assert.deepEqual(['light_left', 'heavy_left', 'light_right', 'heavy_right', 'heavy_thrust'].map((m) => strikeOf(m) === 'light_left'), [true, true, false, false, false]);
});

test('HUD: a refused heavy press of any direction shakes the HEAVY button', () => {
  for (const a of ['heavy', ...IDS]) assert.equal(refusedButton(a), 'heavy', a);
  assert.deepEqual(['thrust', 'kick', 'light', 'light_left', 'dodge', 'backstep', 'parry'].map(refusedButton), ['thrust', 'kick', 'attack', 'attack', 'dodge', 'dodge', 'guard']);
});
