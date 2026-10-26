// V3 directional heavies (move-defs.json `directional`, V2 PR #60): hold STRIKE + slide = a heavy cut to that side or a heavy stab. Not in V1, so Gate 0 has no V1
// reference for them; test/gate0/v3-gate0.test.mjs pins their replays. This file checks the rule itself: same stats as the weapon's overhead heavy, the side a guard
// must mirror to block them, the counter windows unchanged, the borrowed sweeps landing, and the input's slide mapping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTIONAL_HEAVIES } from '../src/fight/move-rows.ts';
import { WEAPONS, WEAPONS86, OPPONENTS } from '../src/fight/moves.ts';
import { initialDuel, stepDuel, idleIntent, legal } from '../src/fight/duel.ts';
import { bladeAge } from '../src/fight/blade.ts';
import { heavySlide, DIRECTIONAL_HEAVY, HEAVY_GRACE_MS, HEAVY_HOLD_MS, STAB_SLIDE_PX } from '../src/fight/input.ts';

const IDS = ['heavy_right', 'heavy_left', 'heavy_thrust'];
const SIDE = { heavy_right: 'right', heavy_left: 'left', heavy_thrust: 'thrust' };

test('the rows: three directional heavies, each the overhead heavy of the same weapon with its own side and no chain', () => {
  assert.deepEqual(DIRECTIONAL_HEAVIES.map((d) => d.id), IDS);
  for (const table of [WEAPONS, WEAPONS86]) for (const [wid, w] of Object.entries(table)) for (const d of DIRECTIONAL_HEAVIES) {
    const m = w.moves[d.id], from = w.moves[d.from], path = w.paths[d.id], look = w.paths[d.blade];
    const { id, direction, path: p, chainPath, chained, chain, windup, ...stats } = m;
    const { id: _i, direction: _d, path: _p, chainPath: _c, chained: _ch, chain: _chn, windup: fromWindup, ...fromStats } = from;
    assert.deepEqual(stats, fromStats, `${wid} ${d.id}: every stat is the overhead's`);
    assert.equal(windup, Math.round(fromWindup * d.windupFactor), `${wid} ${d.id}: wind-up`);
    assert.deepEqual([id, direction, p, chainPath, chained, chain], [d.id, SIDE[d.id], d.id, null, null, null], `${wid} ${d.id}`);
    assert.deepEqual(path, { clip: look.clip, source: look.source, windup, active: from.active, recovery: from.recovery, blade: d.blade }, `${wid} ${d.id} path`);
  }
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

test('undefended, each directional heavy lands as hard as the overhead (its borrowed sweep reaches)', () => {
  const overhead = outcome(exchange('heavy'));
  assert.equal(overhead.type, 'Hit');
  for (const id of IDS) {
    const o = outcome(exchange(id));
    assert.equal(o?.type, 'Hit', id);
    assert.equal(o.move, id);
    assert.equal(o.damage, overhead.damage, `${id} deals the overhead's damage`);
  }
});

test('a raised guard on that side blocks it (the guard mirrors the cut, as for the lights); another side does not', () => {
  const blocks = { heavy_right: 'left', heavy_left: 'right', heavy_thrust: null };   // null: the straight guard, the stab's side
  for (const id of IDS) for (const guard of [null, 'left', 'right', 'overhead', 'low']) {
    const o = outcome(exchange(id, guard));
    assert.equal(o?.type, guard === blocks[id] ? 'Blocked' : 'Hit', `${id} against a ${guard ?? 'straight'} guard`);
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
