// V3 directional heavies (move-defs.json `directional`, V2 PR #60): hold STRIKE + slide = a heavy cut to that side or a heavy stab. Not in V1, so Gate 0 has no V1
// reference for them; test/gate0/v3-gate0.test.mjs pins their replays. This file checks the rule itself: same stats as the weapon's overhead heavy, the side a guard
// must mirror to block them, the counter windows unchanged, the borrowed sweeps landing, and the input's slide mapping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTIONAL_HEAVIES } from '../src/fight/move-rows.ts';
import { WEAPONS, WEAPONS86, OPPONENTS, weaponOf } from '../src/fight/moves.ts';
import { initialDuel, stepDuel, idleIntent, legal, guardOf, timing } from '../src/fight/duel.ts';
import { poseAge, TRAIL_FROM } from '../src/fight/combat.ts';
import { blowKind } from '../src/fight/sandbox-rules.ts';
import { bladeAge } from '../src/fight/blade.ts';
import { heavySlide, DIRECTIONAL_HEAVY, HEAVY_GRACE_MS, HEAVY_HOLD_MS, STAB_SLIDE_PX } from '../src/fight/input.ts';

const IDS = ['heavy_right', 'heavy_left', 'heavy_thrust'];
const SIDE = { heavy_right: 'right', heavy_left: 'left', heavy_thrust: 'thrust' };

test('the rows: three directional heavies, each the overhead heavy of the same weapon with its own side, chaining as the overhead does', () => {
  assert.deepEqual(DIRECTIONAL_HEAVIES.map((d) => d.id), IDS);
  for (const table of [WEAPONS, WEAPONS86]) for (const [wid, w] of Object.entries(table)) for (const d of DIRECTIONAL_HEAVIES) {
    const m = w.moves[d.id], from = w.moves[d.from], path = w.paths[d.id], look = w.paths[d.blade];
    const { id, direction, path: p, chainPath, chained, chain, windup, ...stats } = m;
    const { id: _i, direction: _d, path: _p, chainPath: fromChainPath, chained: fromChained, chain: fromChain, windup: fromWindup, ...fromStats } = from;
    assert.deepEqual(stats, fromStats, `${wid} ${d.id}: every stat is the overhead's`);
    assert.equal(windup, Math.round(fromWindup * d.windupFactor), `${wid} ${d.id}: wind-up`);
    assert.deepEqual([id, direction, p, chain], [d.id, SIDE[d.id], d.id, fromChain], `${wid} ${d.id}`);
    assert.deepEqual(chained, fromChained && { ...fromChained, windup: Math.round(fromChained.windup * d.windupFactor) }, `${wid} ${d.id}: chained timing`);
    assert.equal(chainPath, fromChained && fromChainPath ? `${d.id}_chain` : null, `${wid} ${d.id}: chain path`);
    assert.deepEqual(path, { clip: look.clip, source: look.source, windup, active: from.active, recovery: from.recovery, blade: d.blade }, `${wid} ${d.id} path`);
    if (chainPath) {
      const fc = w.paths[fromChainPath];
      assert.deepEqual(w.paths[chainPath], { clip: look.clip, source: look.source, windup: Math.round(fc.windup * d.windupFactor), active: fc.active, recovery: fc.recovery, blade: d.blade }, `${wid} ${d.id} chain path`);
    }
    for (const [mid, mv] of Object.entries(w.moves)) if (mv.chain)
      assert.equal(mv.chain.follow.includes(d.id), mv.chain.follow.includes(d.from), `${wid} ${mid}: follows ${d.id} exactly when it follows ${d.from}`);
  }
});

// A light, then a heavy press inside the light's chain window: the attack the press starts (chained or not, and its wind-up).
function afterLight(wid, light, action) {
  let d = initialDuel(OPPONENTS.veteran, wid);
  const window = weaponOf(wid).moves[light].chain?.window ?? 1;
  d = { ...d, fighters: [{ ...d.fighters[0], phase: 'ready', age: 0, move: null, stamina: 1000, lastMove: light, chain: window }, d.fighters[1]] };
  const f = stepDuel(d, [it({ action }), it()]).fighters[0];
  return { phase: f.phase, move: f.move, chained: f.chained, windup: f.chained ? weaponOf(wid).moves[f.move].chained.windup : weaponOf(wid).moves[f.move].windup };
}
test('a light then a directional heavy inside the chain window starts chained, with the wind-up light then overhead has', () => {
  let chainedSeen = 0;
  for (const wid of Object.keys(WEAPONS)) for (const light of ['light_right', 'light_left']) {
    const overhead = afterLight(wid, light, 'heavy');
    assert.deepEqual([overhead.phase, overhead.move], ['attack', 'heavy_overhead'], `${wid} ${light} then heavy`);
    if (overhead.chained) chainedSeen++;
    for (const id of ['heavy_right', 'heavy_thrust', 'heavy_left']) {
      const dir = afterLight(wid, light, id);
      assert.deepEqual([dir.phase, dir.move, dir.chained, dir.windup], ['attack', id, overhead.chained, overhead.windup], `${wid} ${light} then ${id}`);
    }
  }
  assert.ok(chainedSeen > 0, 'some weapon chains a light into its overhead');
  assert.equal(afterLight('longsword', 'light_right', 'heavy_right').chained, true, 'the longsword chains light_right into heavy_right');
});

test('bladeAge maps wind-up onto wind-up, active onto active, recovery onto recovery', () => {
  const own = { windup: 32, active: 5, recovery: 31 }, baked = { windup: 20, active: 8, recovery: 22 };
  assert.equal(bladeAge(0, own, baked), 0);
  assert.equal(bladeAge(32, own, baked), 20);
  assert.equal(bladeAge(37, own, baked), 28);
  assert.equal(bladeAge(68, own, baked), 50);
  assert.equal(bladeAge(16, own, baked), 10);
});

// A plain duel: both draw, the player walks in, the warden stands (guarding as told), the player throws `action`; the events of the next 90 ticks.
const it = (o = {}) => ({ ...idleIntent(), ...o });
function exchange(action, guard, before) {
  let d = initialDuel(OPPONENTS.veteran);
  d = stepDuel(d, [it({ action: 'light' }), it({ action: 'light' })]);
  for (let i = 0; i < 60; i++) d = stepDuel(d, [it(), it()]);
  for (let i = 0; i < 300; i++) {
    const [a, b] = d.fighters;
    if (Math.hypot(a.body.x - b.body.x, a.body.z - b.body.z) < 1.4) break;
    d = stepDuel(d, [it({ move: { x: 0, z: -1, yaw: 0, run: false } }), it()]);
  }
  const warden = () => it(guard === undefined ? {} : { guard: true, ...(guard ? { guardDirection: guard } : {}) });
  for (let i = 0; i < 20; i++) d = stepDuel(d, [it(), warden()]);
  if (before) d = before(d);
  const events = [];
  d = stepDuel(d, [it({ action }), warden()]); events.push(...d.events);
  for (let i = 0; i < 90; i++) { d = stepDuel(d, [it(), warden()]); events.push(...d.events); }
  return events.filter((e) => e.actor === 0 || e.target === 0);
}
const outcome = (events) => events.find((e) => ['Hit', 'Blocked', 'Parried', 'GuardBroken', 'AttackMissed'].includes(e.type) && e.move !== 'kick');

test('undefended, each directional heavy lands as hard as the overhead (its borrowed sweep reaches); the heavy stab pierces armour as the thrust does', () => {
  const overhead = outcome(exchange('heavy'));
  assert.equal(overhead.type, 'Hit');
  for (const id of IDS) {
    const o = outcome(exchange(id));
    assert.equal(o?.type, 'Hit', id);
    assert.equal(o.move, id);
    if (id !== 'heavy_thrust') assert.equal(o.damage, overhead.damage, `${id} deals the overhead's damage`);
    else {   // the overhead's numbers, but a stab: its blow kind is the thrust's (sandbox-rules-defs.json blowKinds), so the warden's armour takes less of it than of the cut
      assert.equal(blowKind('longsword', id), blowKind('longsword', 'thrust'));
      assert.ok(o.damage >= overhead.damage, `${id}: ${o.damage} vs the overhead's ${overhead.damage}`);
    }
  }
});

test('a raised guard on that side meets it (the guard mirrors the cut, as for the lights); another side does not', () => {
  const blocks = { heavy_right: 'left', heavy_left: 'right', heavy_thrust: null };   // null: the straight guard, the stab's side
  // The veteran's trident is a shaft guard (heavyBreaks): every heavy breaks it, the directional ones as the overhead does (duel.ts heavyBlow); a blade guard would block.
  const met = guardOf(initialDuel(OPPONENTS.veteran).fighters[1]).heavyBreaks ? 'GuardBroken' : 'Blocked';
  assert.equal(met, 'GuardBroken', 'the veteran holds a shaft guard');
  assert.equal(outcome(exchange('heavy', 'overhead'))?.type, met, 'the overhead into the overhead guard');
  for (const id of IDS) for (const guard of [null, 'left', 'right', 'overhead', 'low']) {
    const o = outcome(exchange(id, guard));
    assert.equal(o?.type, guard === blocks[id] ? met : 'Hit', `${id} against a ${guard ?? 'straight'} guard`);
  }
});

test('inside a counter or punish window a directional press is that window\'s heavy, as V1\'s heavy is', () => {
  const cases = [['counterWindow', 'heavy_counter'], ['punish', 'heavy_riposte'], ['critical', 'critical']];
  for (const [field, move] of cases) for (const id of IDS) {
    const started = exchange(id, undefined, (d) => ({ ...d, fighters: [{ ...d.fighters[0], [field]: 10 }, d.fighters[1]] })).find((e) => e.type === 'AttackStarted' && e.actor === 0);
    assert.equal(started?.move, move, `${id} with ${field}`);
  }
});

test('legal exactly when the overhead heavy is', () => {
  const d = initialDuel(OPPONENTS.veteran), f = d.fighters[0];
  for (const id of IDS) for (const stamina of [0, 34, 35, 100]) for (const phase of ['sheathed', 'ready', 'guard', 'roll'])
    assert.equal(legal({ ...f, stamina, phase }, id), legal({ ...f, stamina, phase }, 'heavy'), `${id} at ${phase} ${stamina}`);
});

test('input: the slide picks the heavy, the rows are on, the grace is a row', () => {
  assert.equal(DIRECTIONAL_HEAVY, true);
  assert.equal(HEAVY_GRACE_MS, 100);
  assert.equal(HEAVY_HOLD_MS, 220);
  const s = STAB_SLIDE_PX;
  assert.equal(heavySlide(0, -s), 'heavy_thrust');
  assert.equal(heavySlide(-s, 0), 'heavy_left');
  assert.equal(heavySlide(s, 0), 'heavy_right');
  assert.equal(heavySlide(-s, -s / 4), 'heavy_left');
  assert.equal(heavySlide(s / 4, -s), 'heavy_thrust');
});

// The drawn hold (review of PR #10): view only. A held directional heavy is DRAWN at its row's holdPoseAge (blade cocked), not the chamber's crouch; the sim's
// ages, charge and contact tick are the overhead's, and released, the drawn age rejoins the sim's (no snap back, monotonic) by the tick the trail turns on.
test('held: drawn at holdPoseAge, the sim untouched, no snap on release, the trail and contact frames unchanged', () => {
  const hold = 40;
  const run = (action) => {
    let d = initialDuel(OPPONENTS.veteran);
    d = { ...d, fighters: [{ ...d.fighters[0], phase: 'ready', age: 0, move: null, stamina: 1000 }, d.fighters[1]] };
    const ticks = [];
    for (let t = 0; t < 70; t++) {
      d = stepDuel(d, [it({ action: t === 0 ? action : null, held: t < hold }), it()]);
      const f = d.fighters[0];
      if (f.phase !== 'attack') break;
      ticks.push({ age: f.age, charge: f.charge, charged: f.charged, drawn: poseAge(f), windup: timing(f).windup, chamber: weaponOf(f.weapon).moves[f.move].chamber });
    }
    return ticks;
  };
  const overhead = run('heavy');
  for (const t of overhead) assert.equal(t.drawn, t.age, 'the overhead draws its own age');
  for (const id of IDS) {
    const ticks = run(id), row = DIRECTIONAL_HEAVIES.find((d) => d.id === id);
    const toContact = (list) => list.slice(0, list.findIndex((t) => t.age >= t.windup) + 1).map(({ age, charge, charged }) => ({ age, charge, charged }));   // after contact the stab's own rules may hold it
    assert.deepEqual(toContact(ticks), toContact(overhead), `${id}: the sim's clock to contact is the overhead's`);
    const parked = ticks.filter((t) => t.charge >= row.holdBlendTicks && t.age === t.chamber);
    assert.ok(parked.length > 10, `${id}: parked long enough to see`);
    for (const t of parked) assert.equal(t.drawn, row.holdPoseAge, `${id}: held at the cocked pose`);
    for (let i = 1; i < ticks.length; i++) {
      assert.ok(ticks[i].drawn >= ticks[i - 1].drawn || ticks[i].charge === ticks[i - 1].charge + 1, `${id} tick ${i}: the drawn age never runs back once released`);
      assert.ok(ticks[i].drawn - ticks[i - 1].drawn <= 2, `${id} tick ${i}: no jump forward (${ticks[i - 1].drawn} -> ${ticks[i].drawn})`);
    }
    for (const t of ticks) if (t.age >= TRAIL_FROM * t.windup) assert.equal(t.drawn, t.age, `${id} age ${t.age}: trail on, drawn = sim`);
  }
});
