// The hunt (src/zone/hunters.ts, data/heat.json hunt + tiers, the `hunter` profile, the radar's orange class; hunter port PR 2). Heat scales the waits, the number of hunters and the stars; a hunter is announced,
// arrives behind the hero, walks at him slower than he runs, and once close is an ordinary boss (the zone's own aggro finds it). Everything is rows; nothing here is saved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HEAT, huntOn, addHeat, freshHeat, heatSeconds, heatStar, huntersAllowed, resetHeat, validateHeat } from '../src/heat.ts';
import { freshHunt, hunterSpawns, stepHunt } from '../src/zone/hunters.ts';
import { inAggro, isStanding, kill, tick } from '../src/stubs.ts';
import { RADAR, bossBlips, classOf, validateRadar } from '../src/fight/radar.ts';
import { validateFile } from '../src/sim/validate.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const PROFILES = read('profiles'), STARS = read('stars'), RINGS = read('rings');
const U = HEAT.hunt;
const camp = { id: 'camp', kind: 'gargantua', x: 500, z: 500, aggro: 2.5, leash: 20, respawnSeconds: 40, deadFor: null };
const world = () => [{ ...camp }, ...hunterSpawns(HEAT)];   // one far camp, then the parked hunters (indices 1, 2)
const heatOf = (n) => { const h = freshHeat(); addHeat(h, HEAT, n, 0); return h; };
const hero = { x: 0, z: 0, heading: 0 };
const noFight = () => false;
const run = (hunt, spawns, heat, from, to, dt = 0.5, h = hero, stop = false) => { const seen = []; for (let t = from; t <= to + 1e-9; t += dt) { const n = stepHunt(hunt, spawns, h, heat, t, dt, noFight, HEAT); seen.push({ t, warned: n.warned, arrived: n.arrived, gone: n.gone, index: n.index, star: n.star }); if (stop && n.arrived) break; } return seen; };

test('the table validates (hunter kind is a profile, star levels exist, tiers carry scale, count and stars) and bad rows are named', () => {
  const ids = PROFILES.profiles.map((p) => p.id), levels = STARS.levels.map((l) => l.star), rings = RINGS.rings.map((r) => r.id);
  assert.deepEqual(validateFile('heat', read('heat')), []);
  assert.deepEqual(validateHeat(HEAT, rings, ids, levels), []);
  const patch = (f) => { const d = structuredClone(HEAT); f(d); return validateHeat(d, rings, ids, levels).join(';'); };
  assert.match(patch((d) => { d.hunt.kind = 'ghost'; }), /hunt\.kind/);
  assert.match(patch((d) => { d.tiers[2].stars = [{ stars: 7, chance: 0.1 }]; }), /no data\/stars\.json level/);
  assert.match(patch((d) => { d.tiers[2].stars = [{ stars: 1, chance: 0.7 }, { stars: 2, chance: 0.7 }]; }), /add up past 1/);
  assert.match(patch((d) => { d.tiers[0].timeScale = 0; }), /timeScale/);
  assert.match(patch((d) => { d.tiers[1].hunters = 3; }), /maxHunters/);
  assert.match(patch((d) => { d.hunt.giveUpMetres = 10; }), /giveUpMetres/);
  assert.match(patch((d) => { d.hunt.leash = 2; }), /leash/);
  assert.match(patch((d) => { d.hunt.lines.gone = ' '; }), /lines\.gone/);
  assert.ok(U.speedMetresPerSecond > 3 && U.speedMetresPerSecond < 5.2, 'slower than his run (5.2), faster than his walk (3)');
  assert.equal(PROFILES.profiles.find((p) => p.id === U.kind).opponent, 'executioner', 'the hunter is the Executioner archetype');
});

test('the hunt flag row: default OFF, ?hunt=1 runs it (alone, without ?heat=1), hunt.on: true runs it for all; a bad flag row is refused; the page parks hunters only through HUNT_ON; the stills pass both flags', () => {
  assert.equal(HEAT.hunt.on, true);   // ON for players (Dom 2026-10-30; rollback = hunt.on false)
  assert.equal(huntOn(''), true);
  const dark = { ...HEAT, hunt: { ...HEAT.hunt, on: false } };
  assert.equal(huntOn('', dark), false);
  assert.equal(huntOn('?hunt=0', dark), false);
  assert.equal(huntOn('?heat=1', dark), false);
  assert.equal(huntOn(`?${HEAT.hunt.query}=${HEAT.hunt.value}`, dark), true);
  const bad = (f) => { const d = structuredClone(HEAT); f(d); return validateHeat(d, RINGS.rings.map((r) => r.id), PROFILES.profiles.map((p) => p.id), STARS.levels.map((l) => l.star)).join(';'); };
  assert.match(bad((d) => { d.hunt.on = 1; }), /hunt\.on/);
  assert.match(bad((d) => { d.hunt.query = 'Hunt!'; }), /hunt\.query/);
  assert.match(bad((d) => { d.hunt.value = ''; }), /hunt\.value/);
  const main = readFileSync(new URL('../src/client/main.ts', import.meta.url), 'utf8');
  assert.match(main, /const HUNT_ON = ZONE && huntOn\(search\)/);
  assert.match(main, /\.\.\.\(HUNT_ON \? hunterSpawns\(HEAT\) : \[\]\)/);   // off = no parked slot in the spawn list
  assert.match(main, /const hunt = HUNT_ON \? freshHunt\(/);               // off = no chase, no hunter dot
  assert.match(readFileSync(new URL('../scripts/hunt-stills.mjs', import.meta.url), 'utf8'), /\?heat=1&hunt=1/);
});

test('heat scales the hunt: waits shrink with the tier (never under the floor), one hunter then two (never past the cap), stars only at the top tier', () => {
  assert.equal(heatSeconds(freshHeat(), 60), 60, 'no heat, the base wait');
  assert.equal(heatSeconds(heatOf(1), 60), 45); assert.equal(heatSeconds(heatOf(2), 60), 30); assert.equal(heatSeconds(heatOf(4), 60), 21);
  assert.equal(heatSeconds(heatOf(4), 20), 15, 'never under hunt.minSeconds');
  assert.equal(heatSeconds(heatOf(4), 10), 10, 'never above the base wait');
  assert.deepEqual([0, 1, 2, 3, 4, 10].map((n) => huntersAllowed(heatOf(n))), [0, 1, 2, 2, 2, 2]);
  for (let n = 0; n < 200; n++) { assert.equal(heatStar(heatOf(1), n), 0); assert.equal(heatStar(heatOf(3), n), 0); }
  const top = Array.from({ length: 2000 }, (_, n) => heatStar(heatOf(5), n)), count = (s) => top.filter((x) => x === s).length;
  assert.deepEqual(top, Array.from({ length: 2000 }, (_, n) => heatStar(heatOf(5), n)), 'deterministic: same arrival, same star');
  assert.ok(count(1) > 300 && count(1) < 500, `about 20 % one star (${count(1)})`);
  assert.ok(count(2) > 50 && count(2) < 150, `about 5 % two stars (${count(2)})`);
});

test('the slots are parked boss rows: dead, never respawn on their own timer, in the zone list after the camps', () => {
  const list = world();
  assert.equal(list.length, 1 + U.maxHunters);
  for (const s of list.slice(1)) { assert.equal(s.kind, U.kind); assert.equal(isStanding(s), false); }
  assert.deepEqual(list.slice(1).map((s) => s.id), ['hunter-1', 'hunter-2']);
  const out = tick(list, 100000);
  assert.deepEqual(out.due, [], 'a day of seconds later nothing stood again by itself');
});

test('a hunt with heat: quiet, then announced, then arrives behind him and walks at him; no heat, no hunter', () => {
  const spawns = world(), hunt = freshHunt(1, HEAT), heat = heatOf(1);
  const seen = run(hunt, spawns, heat, 0, 200);
  const first = seen.find((s) => s.warned), arrive = seen.find((s) => s.arrived);
  assert.ok(first, 'announced');
  assert.ok(first.t >= 45 && first.t < 46, `first announcement after the tier-scaled arrival delay (${first.t})`);
  assert.ok(arrive.t - first.t >= U.warningSeconds && arrive.t - first.t < U.warningSeconds + 1, 'it arrives warningSeconds later');
  assert.equal(seen.filter((s) => s.arrived).length >= 1, true);
  const cold = world(), huntCold = freshHunt(1, HEAT);
  assert.ok(run(huntCold, cold, freshHeat(), 0, 500).every((s) => !s.warned && !s.arrived), 'no heat, nothing comes');
});

test('it arrives BEHIND him at the spawn distance, on the hero\'s heading, and closes at its row speed', () => {
  const spawns = world(), hunt = freshHunt(1, HEAT), heat = heatOf(1), h = { x: 10, z: 20, heading: Math.PI / 2 };
  const seen = run(hunt, spawns, heat, 0, 60, 0.5, h, true);
  const arrived = seen.find((s) => s.arrived), s0 = spawns[arrived.index];
  assert.ok(Math.abs(Math.hypot(s0.x - h.x, s0.z - h.z) - U.spawnDistanceMetres) < U.speedMetresPerSecond * 0.5 + 1e-6, 'one step in already at most');
  assert.ok(s0.x < h.x, 'behind: he faces +x (heading pi/2), so it arrives at -x');
  const before = Math.hypot(spawns[arrived.index].x - h.x, spawns[arrived.index].z - h.z);
  stepHunt(hunt, spawns, h, heat, 100, 1, noFight, HEAT);
  const after = Math.hypot(spawns[arrived.index].x - h.x, spawns[arrived.index].z - h.z);
  assert.ok(Math.abs(before - after - U.speedMetresPerSecond) < 1e-6, `closes ${U.speedMetresPerSecond} m in a second (${before - after})`);
  assert.equal(isStanding(spawns[arrived.index]), false, 'still a walker, not yet a boss for the zone');
  assert.equal(inAggro(spawns, h), -1, 'the zone finds nothing while it walks');
});

test('close enough it STANDS and the zone\'s own aggro finds it (the 1v1 hand-over); it is not a hunter any more once killed, and the next one waits', () => {
  const spawns = world(), hunt = freshHunt(1, HEAT), heat = heatOf(1);
  const arrived = run(hunt, spawns, heat, 0, 60, 0.5, hero, true).find((s) => s.arrived), i = arrived.index;
  let t = arrived.t;
  while (!isStanding(spawns[i]) && t < 200) { t += 0.5; heat.lastAt = t; stepHunt(hunt, spawns, hero, heat, t, 0.5, noFight, HEAT); }
  assert.ok(isStanding(spawns[i]), 'it reached him and stands');
  assert.equal(inAggro(spawns, hero), i, 'the zone\'s aggro hands the fight over');
  assert.equal(hunt.slots.find((s) => s.index === i).engaged, true);
  const killed = kill(spawns, i); spawns.splice(0, spawns.length, ...killed);
  stepHunt(hunt, spawns, hero, heat, t + 0.5, 0.5, noFight, HEAT);
  assert.equal(hunt.slots.find((s) => s.index === i).engaged, false);
  assert.ok(hunt.nextAt >= t + 0.5 + heatSeconds(heat, U.respawnDelaySeconds), 'the next waits the (scaled) respawn delay');
});

test('the cap holds: one hunter at tier 1, two at tier 2, never a third; a second never stands where the first is', () => {
  const spawns = world(), hunt = freshHunt(1, HEAT), heat = heatOf(2);
  for (let t = 0; t < 400; t += 0.5) { heat.lastAt = t; stepHunt(hunt, spawns, hero, heat, t, 0.01, noFight, HEAT); }   // dt tiny so they never close: all arrivals stay walking
  assert.equal(hunt.slots.filter((s) => s.chasing || s.warnedAt !== null).length, 2);
  const one = world(), huntOne = freshHunt(1, HEAT), h1 = heatOf(1);
  for (let t = 0; t < 400; t += 0.5) { h1.lastAt = t; stepHunt(huntOne, one, hero, h1, t, 0.01, noFight, HEAT); }
  assert.equal(huntOne.slots.filter((s) => s.chasing || s.warnedAt !== null).length, 1);
  assert.equal(HEAT.hunt.maxHunters, 2);
});

test('a camp where it would arrive holds it back until the way is clear; losing him past the give-up distance sends it away; losing the heat sends every hunter away', () => {
  const spawns = world(), hunt = freshHunt(1, HEAT), heat = heatOf(1);
  spawns[0] = { ...camp, x: -U.spawnDistanceMetres, z: 0 };   // a standing camp exactly where a hunter would arrive (heading 0: the arrival is at z = -45; move the camp there)
  spawns[0] = { ...camp, x: 0, z: -U.spawnDistanceMetres };
  const seen = run(hunt, spawns, heat, 0, 80);
  assert.ok(seen.some((s) => s.warned), 'announced');
  assert.ok(!seen.some((s) => s.arrived), 'but it keeps waiting while a camp stands there');
  spawns[0] = { ...camp };
  assert.ok(run(hunt, spawns, heat, 80.5, 90).some((s) => s.arrived), 'the way is clear: it arrives');
  const i = hunt.slots.find((s) => s.chasing).index;
  const far = { x: spawns[i].x + U.giveUpMetres + 5, z: spawns[i].z, heading: 0 };
  const lost = stepHunt(hunt, spawns, far, heat, 100, 0.5, noFight, HEAT);
  assert.equal(lost.gone, true); assert.equal(hunt.slots.find((s) => s.index === i).chasing, false);
  const spawns2 = world(), hunt2 = freshHunt(1, HEAT), heat2 = heatOf(1);
  assert.ok(run(hunt2, spawns2, heat2, 0, 60, 0.01).some((s) => s.arrived));
  resetHeat(heat2, 61);
  stepHunt(hunt2, spawns2, hero, heat2, 61, 0.5, noFight, HEAT);
  assert.ok(hunt2.slots.every((s) => !s.chasing && s.warnedAt === null && !s.engaged), 'no heat: they all lose him');
  assert.equal(hunt2.armed, false, 'and the clock re-arms for the next time');
});

test('a standing hunter that fights him is kept even with no heat; one he got away from is parked', () => {
  const spawns = world(), hunt = freshHunt(1, HEAT), heat = heatOf(1);
  hunt.slots[0].engaged = true; spawns[1] = { ...spawns[1], deadFor: null, x: 0, z: 1 };
  resetHeat(heat, 1);
  stepHunt(hunt, spawns, hero, heat, 1, 0.5, (i) => i === 1, HEAT);
  assert.equal(isStanding(spawns[1]), true, 'in a fight with him: left alone');
  stepHunt(hunt, spawns, hero, heat, 2, 0.5, noFight, HEAT);
  assert.equal(isStanding(spawns[1]), false, 'no fight, no heat: parked');
});

test('the radar: the hunter has its own orange class; a parked or killed one shows no dim dot; a standing one shows as a hunter', () => {
  validateRadar(RADAR);
  assert.equal(RADAR.classes.hunter.colour, '#ff8a1f'); assert.equal(RADAR.kinds[U.kind], 'hunter');
  const spawns = world(), out = [];
  bossBlips(RADAR, spawns, () => undefined, (x, z, c) => out.push(c));
  assert.deepEqual(out, ['hostile'], 'only the camp: the parked hunters draw nothing');
  spawns[1] = { ...spawns[1], deadFor: null };
  out.length = 0; bossBlips(RADAR, spawns, () => undefined, (x, z, c) => out.push(c));
  assert.deepEqual(out, ['hostile', 'hunter']);
  assert.equal(classOf(RADAR, 'gargantua', true), 'dead', 'the camps keep their dim dead dot');
});

test('the page wires it: slots appended to the spawn list, one step per frame, drawn as copies, on the radar; the hunt never touches the save', () => {
  const main = src('src/client/main.ts');
  assert.match(main, /hunterSpawns\(HEAT\)/); assert.match(main, /huntStep\(dt\);/); assert.match(main, /\.concat\(chasers\(\)\)/); assert.match(main, /emit\(spawns\[slot\.index\]!\.x, spawns\[slot\.index\]!\.z, 'hunter'\)/);
  assert.doesNotMatch(src('src/zone/hunters.ts'), /localStorage|writeSave|fetch\(|Math\.random|performance\.now|Date\.now/, 'session only, deterministic, no clock of its own');
  assert.doesNotMatch(src('src/zone/hunters.ts'), /=\s*[\w.]+\?\.\(/, 'no default-parameter optional call');
});
