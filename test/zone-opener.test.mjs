// The zone opener (V1's `openers`, data/respawn.json openers, src/zone/spawns.ts openerReach, wired in src/client/main.ts zoneStep): a lone Pitborn aggroes a newcomer
// who stands still, after delaySeconds. The rule is pure, so the whole story is walked here; the page's wiring is pinned by reading main.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zoneFor } from '../src/zone/zone-rows.ts';
import { OPENERS, inAggro, kill, leashed, openerLeashLift, openerOn, openerReach, spotsFor, tick, validateOpeners } from '../src/zone/spawns.ts';
import { initialState } from '../src/fight/sim.ts';
import { playScaleFor, setPlayScale } from '../src/fight/play-radius.ts';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const ZONE = zoneFor(''), ROWS = read('../data/respawn.json'), FIGHT = read('../data/fight.json');
setPlayScale(playScaleFor(FIGHT.opponent, Infinity));   // the circle the page fights in (main.ts fresh()): the newcomer's mark is z 2, not the full-size 4
const spawns = () => spotsFor(ZONE).map((s) => ({ ...s, deadFor: null }));
const hero = () => initialState();   // the pit's mark: where a newcomer stands

test('the default is pinned: on, 5 s, one spawn (the yard Pitborn), ?opener=off; every number in range', () => {
  assert.deepEqual({ ...OPENERS, about: undefined }, { about: undefined, on: true, delaySeconds: 5, count: 1, reachMetres: 2, spawns: ['yard-pitborn'], query: 'opener', off: 'off' });
  assert.doesNotThrow(() => validateOpeners(OPENERS, spotsFor(ZONE)));
  assert.ok(OPENERS.delaySeconds >= ROWS.limits.delaySeconds[0] && OPENERS.delaySeconds <= ROWS.limits.delaySeconds[1]);
  assert.equal(openerOn(''), true); assert.equal(openerOn('?x=1'), true);
  assert.equal(openerOn('?opener=off'), false, 'the off switch');
  assert.equal(openerOn('?postkill=v1&opener=on'), true);
  assert.equal(openerOn('', { ...OPENERS, on: false }), false, 'the row off');
});

test('bad opener rows are refused: delay or count out of range, no spawn, a spawn the zone does not have', () => {
  const spots = spotsFor(ZONE), bad = (o) => () => validateOpeners({ ...OPENERS, ...o }, spots);
  assert.throws(bad({ delaySeconds: 0 }), /delaySeconds/); assert.throws(bad({ delaySeconds: 999 }), /delaySeconds/); assert.throws(bad({ delaySeconds: NaN }), /delaySeconds/);
  assert.throws(bad({ count: 0 }), /count/); assert.throws(bad({ count: 9 }), /count/);
  assert.throws(bad({ spawns: [] }), /no spawn/); assert.throws(bad({ spawns: ['nobody'] }), /no spawn of the zone/);
});

test('the opener spawn can reach a newcomer at the mark: inside its leash plus the reach (the mark is 6 m from the north Pitborn, just beyond the plain 5 m leash)', () => {
  const s = spawns().find((x) => x.id === OPENERS.spawns[0]), d = Math.hypot(s.x - hero().x, s.z - hero().z);
  assert.ok(d > s.leash, 'beyond the plain leash: why the fight\'s leash is lifted');
  assert.ok(d <= s.leash + OPENERS.reachMetres);
  assert.equal(leashed(s, hero()), true); assert.equal(leashed(s, hero(), OPENERS.reachMetres), false);
});

test('before N nobody is in aggro; at N the opener spawn (only it) reaches him; the other two wait', () => {
  const s = spawns(), at = hero();
  assert.equal(inAggro(openerReach(s, OPENERS, 0, at), at), -1);
  assert.equal(inAggro(openerReach(s, OPENERS, OPENERS.delaySeconds - 0.01, at), at), -1, 'a hair before N');
  const due = openerReach(s, OPENERS, OPENERS.delaySeconds, at);
  assert.equal(due[inAggro(due, at)].id, 'yard-pitborn', 'at N it is the engagement the page already plays');
  assert.deepEqual(due.map((x) => x.aggro).slice(1), s.map((x) => x.aggro).slice(1), 'the other spawns keep their aggro');
  assert.equal(inAggro(openerReach(s, OPENERS, 99, at), at), 0);
});

test('the reach stops at the leash: a hero who wandered beyond it is left alone; count caps how many open', () => {
  const s = spawns(), far = { x: s[0].x + s[0].leash + OPENERS.reachMetres + 1, z: s[0].z };
  assert.equal(inAggro(openerReach(s, OPENERS, 99, far), far), -1);
  const two = openerReach(s, { ...OPENERS, count: 1, spawns: ['pit-pitborn-east', 'yard-pitborn'] }, 99, hero());
  assert.equal(two.filter((x, i) => x.aggro !== s[i].aggro).length, 1, 'count 1: only the first listed');
  assert.equal(two[1].aggro > s[1].aggro, true);
  const both = openerReach(s, { ...OPENERS, count: 2, spawns: ['pit-pitborn-east', 'yard-pitborn'] }, 99, hero());
  assert.equal(both.filter((x, i) => x.aggro !== s[i].aggro).length, 2);
});

test('a dead opener spawn does not reach; after its respawn the rule would reach again (the page spends the clock instead: no re-arm)', () => {
  let s = kill(spawns(), 0);
  assert.equal(inAggro(openerReach(s, OPENERS, 99, hero()), hero()), -1, 'dead: not standing');
  s = tick(s, 999).spawns;
  assert.ok(inAggro(openerReach(s, OPENERS, 99, hero()), hero()) >= 0, 'pure rule: standing and idle past N reaches');
});

test('the leash lift is the opener fight\'s alone: an opener spawn gets reachMetres, any other boss gets none', () => {
  const s = spawns();
  assert.equal(openerLeashLift(s[0]), OPENERS.reachMetres, 'the yard Pitborn');
  assert.equal(openerLeashLift(s[1]), 0, 'a normal aggro on another boss after the delay: no lift');
  assert.equal(openerLeashLift(s[2]), 0);
  assert.equal(openerLeashLift(undefined), 0);
  assert.equal(openerLeashLift(s[0], { ...OPENERS, spawns: [] }), 0);
  assert.equal(leashed(s[1], { x: s[1].x + s[1].leash + 0.5, z: s[1].z }, openerLeashLift(s[1])), true, 'so that boss resets at its plain leash');
});

test('the page sets the lift only from the spawn in aggro and clears it on every reset (hand-over, leash reset, respawn)', () => {
  const main = readFileSync(new URL('../src/client/main.ts', import.meta.url), 'utf8');
  assert.match(main, /openerLift = openerLeashLift\(spawns\[near\]\);/);
  assert.doesNotMatch(main, /openerLift = OPENERS\.reachMetres/);
  const rematch = main.slice(main.indexOf('function rematch('), main.indexOf('const hand = '));
  assert.match(rematch, /openerLift = 0;/, 'rematch is what hand() and the leash reset call');
});

test('the page wires it once: the clock runs when the assets are ready, any engagement/kill/death spends it, ?opener=off and ?postkill=v1 start spent', () => {
  const main = readFileSync(new URL('../src/client/main.ts', import.meta.url), 'utf8');
  assert.match(main, /openerSpent = !ZONE \|\| !openerOn\(search\)/);
  assert.match(main, /if \(engaged\) openerSpent = true;/);
  assert.match(main, /leashed\(spawns\[current\]!, hero, openerLift\)/);
  assert.match(main, /if \(practice\.finish\) \{ openerSpent = true; openerLift = 0; \}/);
  assert.match(main, /if \(!openerSpent && assetsReady\) openerIdle \+= dt;/);
  assert.match(main, /inAggro\(openerSpent \? spawns : openerReach\(spawns, OPENERS, openerIdle, hero\), hero\)/);
});
