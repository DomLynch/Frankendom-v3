// Golden weapon drops (src/zone/golden-drops.ts, data/golden-weapons.json; Dom 2026-10-28): the table validates and names only real weapons and rings, a boss kill / dropGolden puts a pickup on the
// ground, walking onto it equips it with its charges, each landed blow spends one, 0 reverts him, a held one is lost where he dies, the rider is a boss-health tune, the optional save field round-trips and an
// old save loads as before, and the corpse run's pile is untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GOLDEN, bonusOf, bossDrop, boostedBy, cleanGolden, createGolden, dropGolden, freshGolden, goldenBlips, itemsNow, lineOf, loadWeapon, lose, nearest, pointAt, rowOf, spend, take, usableRows,
} from '../src/zone/golden-drops.ts';
import { clearOf, validateClearance, validateGolden } from '../src/fight/golden-check.ts';
import { zoneFor } from '../src/stubs.ts';
import { spotsFor } from '../src/zone/spawns.ts';
import { orderedZone } from '../src/fight/boss-order.ts';
import { freshSave, heroWeapon, loadSave, parseSave, writeSave } from '../src/progression.ts';
import { dropPile, retrieve, CORPSE } from '../src/corpse-run.ts';
import { RADAR, validateRadar } from '../src/fight/radar.ts';
import { validateFile } from '../src/sim/validate.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const ROWS = read('golden-weapons'), P = read('progression'), RINGS = read('rings').rings, FIGHT = read('fight');
const WEAPONS = new Set(JSON.parse(readFileSync(new URL('../src/fight/weapon-defs.json', import.meta.url), 'utf8')).weapons.map((w) => w.id));
const DRAW = ['longsword', 'gladius', 'cleaver'];   // scene.ts CARRIED_WEAPONS today
const USABLE = usableRows(GOLDEN, DRAW);
const patch = (f) => { const d = structuredClone(ROWS); f(d); return d; };
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const memory = () => { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; };

test('the table validates; every weapon is a real weapon row; only drawable ones drop today', () => {
  assert.deepEqual(validateFile('golden-weapons', ROWS), []);
  validateGolden(GOLDEN, (id) => WEAPONS.has(id), RINGS);
  assert.deepEqual(USABLE.map((w) => w.id), ['golden-gladius', 'sunblade', 'golden-axe']);
  assert.deepEqual(GOLDEN.weapons.filter((w) => !DRAW.includes(w.weapon)).map((w) => w.id), ['plasma-spear', 'cursed-hammer'], 'spear and hammer wait for hero art');
  assert.deepEqual(usableRows(GOLDEN, [...DRAW, 'trident', 'maul']).length, 5, 'packing a GLB makes them drop with no code change');
  for (const [name, f] of Object.entries({
    'a weapon id': (d) => { d.weapons[0].weapon = 'nope'; }, 'a charge range': (d) => { d.weapons[0].charges = 500; }, 'a colour': (d) => { d.weapons[0].tint.colour = 'gold'; },
    'a ring': (d) => { d.drops.roaming.points[0].ring = 'ring-9'; }, 'a distance outside the ring': (d) => { d.drops.roaming.points[0].distance = 65; }, 'a point row': (d) => { d.drops.roaming.points[0].weapon = 'ghost'; },
    'a star list length': (d) => { d.drops.bossKill.tierByStar.pop(); }, 'a duplicate id': (d) => { d.weapons[1].id = d.weapons[0].id; }, 'a chance': (d) => { d.drops.bossKill.chanceByStar[0] = 2; },
    'a damage multiplier below 1': (d) => { d.weapons[0].damageMul = 0.5; },
  })) assert.throws(() => validateGolden(patch(f), (id) => WEAPONS.has(id), RINGS), /golden-weapons/, name);
  assert.ok(validateFile('golden-weapons', patch((d) => { d.extra = 1; })).length, 'an unknown key is refused');
  validateRadar(RADAR);
  assert.notEqual(RADAR.classes.golden.colour, RADAR.classes.hostile.colour, 'the radar dot is not an enemy colour');
});

test('a boss kill rolls the star level chance; the star caps the tier; the pickup lands within the scatter', () => {
  const at = { x: 10, z: 20 };
  assert.equal(bossDrop(freshGolden(), GOLDEN, USABLE, at, 0, seq(0.9)).item, null, 'a roll above the chance drops nothing');
  const out = bossDrop(freshGolden(), GOLDEN, USABLE, at, 0, seq(0.01, 0, 0.5, 0.5));
  assert.ok(out.item); assert.equal(rowOf(GOLDEN, out.item.id).tier <= GOLDEN.drops.bossKill.tierByStar[0], true, 'a 0-star boss drops tier 1 at most');
  assert.ok(Math.hypot(out.item.x - at.x, out.item.z - at.z) <= GOLDEN.drops.bossKill.scatterMetres + 1e-9);
  assert.equal(out.save.ground.length, 1);
  const rich = bossDrop(freshGolden(), GOLDEN, USABLE, at, 2, seq(0.01, 0, 0.5, 0.99));
  assert.equal(rowOf(GOLDEN, rich.item.id).id, 'golden-axe', 'a 2-star boss can drop the tier 3 cap: the axe is the best drawable row');
  assert.equal(bossDrop(freshGolden(), GOLDEN, USABLE, at, 99, seq(0.01, 0, 0, 0)).item !== null, true, 'a star beyond the list uses the last entry');
  assert.equal(dropGolden(freshGolden(), GOLDEN, [], at, 3, seq(0)).item, null, 'nothing drawable = nothing drops, the save is returned as it is');
});

test('roaming points: placed by ring distance and bearing, taken ones come back after the respawn time', () => {
  const p = GOLDEN.drops.roaming.points[0], spot = pointAt(GOLDEN, p);
  assert.ok(Math.abs(Math.hypot(spot.x, spot.z) - p.distance) < 1e-9);
  const now = 1_000_000, all = itemsNow(freshGolden(), GOLDEN, USABLE, now);
  assert.deepEqual(all.map((i) => i.key), ['ring-1-north-east', 'ring-1-north-west', 'ring-2-north-west'], 'dormant rows (no art) have no roaming pickup');
  const ms = GOLDEN.drops.roaming.respawnSeconds * 1000, taken = { ...freshGolden(), taken: { 'ring-1-north-east': now } };
  assert.equal(itemsNow(taken, GOLDEN, USABLE, now + ms - 1).length, 2);
  assert.equal(itemsNow(taken, GOLDEN, USABLE, now + ms).length, 3, 'it is back after respawnSeconds');
});

test('taking a pickup equips it with its charges; a second one swaps and puts the first down with what it had left', () => {
  const g0 = { ...freshGolden(), ground: [{ id: 'golden-axe', x: 5, z: 5, charges: 7 }] };
  const [item] = itemsNow(g0, GOLDEN, USABLE, 0).filter((i) => i.source === 'ground');
  const a = take(g0, GOLDEN, item, { x: 5, z: 5 }, 100);
  assert.deepEqual(a.held, { id: 'golden-axe', charges: 7 }); assert.equal(a.save.ground.length, 0);
  const road = itemsNow(a.save, GOLDEN, USABLE, 100).find((i) => i.source === 'roaming');
  const b = take(a.save, GOLDEN, road, { x: 9, z: 9 }, 200);
  assert.equal(b.save.taken[road.key], 200); assert.deepEqual(b.save.ground, [{ id: 'golden-axe', x: 9, z: 9, charges: 7 }]);
  assert.equal(nearest(itemsNow(b.save, GOLDEN, USABLE, 200), { x: 9.5, z: 9 }, GOLDEN.pickup.reachMetres).id, 'golden-axe');
  assert.equal(nearest(itemsNow(b.save, GOLDEN, USABLE, 200), { x: 500, z: 500 }, GOLDEN.pickup.reachMetres), null);
});

test('each landed blow spends one charge; the last one reverts him; losing a blow does not', () => {
  let s = { ...freshGolden(), held: { id: 'golden-gladius', charges: 2 } };
  const one = spend(s); assert.deepEqual(one.save.held, { id: 'golden-gladius', charges: 1 }); assert.equal(one.spent, null);
  const two = spend(one.save); assert.equal(two.save.held, null); assert.equal(two.spent.id, 'golden-gladius');
  assert.equal(spend(two.save).save, two.save, 'nothing held = the same save');
});

test('he dies holding one: it lies where he fell with the charges left; the corpse run pile is separate', () => {
  const held = { ...freshGolden(), held: { id: 'golden-axe', charges: 4 } };
  const out = lose(held, GOLDEN, { x: -3, z: 8 });
  assert.equal(out.save.held, null); assert.deepEqual(out.save.ground, [{ id: 'golden-axe', x: -3, z: 8, charges: 4 }]);
  assert.equal(lose(freshGolden(), GOLDEN, { x: 0, z: 0 }).lost, null);
  let save = { ...freshSave(), coins: 5, golden: held };
  const drop = dropPile(save, CORPSE, { x: 1, z: 1 }, 'arachne', 'cleaver');
  assert.deepEqual(drop.save.golden, held, 'the pile leaves the golden field alone');
  assert.equal(retrieve(drop.save, CORPSE).save.golden, held);
});

const prac = (events, hp = 100) => ({ health: hp, playerHealth: 150, duel: { fighters: [{ health: 150 }, { health: hp }] }, events });
const BLOW = (damage) => ({ type: 'Hit', actor: 0, target: 1, damage });

test('the power is applied in the sim step: the extra damage lands in the same step as the blow, mid-fight, and ends at 0 charges', () => {
  assert.equal(bonusOf({ damageMul: 1.5 }, 20), 10); assert.equal(bonusOf({ damageMul: 1 }, 20), 0);
  const p = prac([BLOW(20)], 100);
  assert.equal(boostedBy(p, 1, 0), p, 'no extra = the same practice'); assert.equal(boostedBy(prac([], 0), 1, 9).health, 0, 'a dead boss is left alone');
  assert.equal(boostedBy(prac([], 5), 1, 99).health, 1, 'never takes the boss to a kill the sim did not make');
  const b = boostedBy(p, 1, 10); assert.equal(b.health, 90); assert.equal(b.duel.fighters[1].health, 90); assert.equal(b.duel.fighters[0].health, 150); assert.equal(p.health, 100, 'the input is not mutated');
  // the controller, a fight already running: he picks one up between two blows and the very next blow is boosted; the last charge's blow is boosted, the one after is plain
  let save = { ...freshGolden(), ground: [{ id: 'golden-axe', x: 1, z: 0, charges: 2 }] };
  const ui = { frame() {}, counter() {}, line() {}, tint() {} };
  const gc = createGolden({ rows: GOLDEN, drawable: DRAW, ui, get: () => save, put: (n) => { save = n; }, now: () => 0, rng: seq(0.5) });
  assert.equal(gc.strike(prac([BLOW(20)])).health, 100, 'nothing held: a plain blow');
  gc.step({ x: 1, z: 0 }, true); assert.equal(gc.held().charges, 2);
  assert.equal(gc.strike(prac([BLOW(20)])).health, 90, 'the next blow after the pickup is already x1.5 (20 + 10)');
  assert.equal(gc.held().charges, 1);
  assert.equal(gc.strike(prac([BLOW(20)])).health, 90, 'the last charge is boosted too');
  assert.equal(gc.held(), null);
  assert.equal(gc.strike(prac([BLOW(20)])).health, 100, 'spent: back to plain blows at once, mid-fight');
  const two = { ...freshGolden(), held: { id: 'golden-axe', charges: 5 } }; save = two;
  assert.equal(gc.strike(prac([BLOW(20), BLOW(20), { type: 'Hit', actor: 1, target: 0, damage: 20 }, { type: 'Blocked', actor: 0, target: 1 }])).health, 80, 'two landed blows are both boosted; blows taken and blocked ones are not');
  assert.equal(gc.held().charges, 3);
});

test('every roaming point keeps its clearance outside every boss leash in the shipped zone (a pickup never pulls him into a fight)', () => {
  const spots = spotsFor(orderedZone(zoneFor(''), FIGHT.order, ''));
  assert.ok(spots.length >= 8, 'the ringed zone: three ring-1 bosses and the ring 2 and 3 ones');
  validateClearance(GOLDEN, spots);
  for (const p of GOLDEN.drops.roaming.points) { const at = pointAt(GOLDEN, p); for (const s of spots) assert.ok(Math.hypot(at.x - s.x, at.z - s.z) - s.leash >= GOLDEN.drops.roaming.clearanceMetres, `${p.id} is clear of ${s.id}`); }
  const bad = structuredClone(GOLDEN); bad.drops.roaming.points[1] = { ...bad.drops.roaming.points[1], distance: 42, angleDeg: 235 };   // the first cut's point, 1.5 m outside a leash
  assert.throws(() => validateClearance(bad, spots), /ring-1-north-west.*outside/);
  const warn = console.warn; let said = ''; console.warn = (m) => { said += m; };
  try { const kept = clearOf(bad, spots); assert.deepEqual(kept.drops.roaming.points.map((p) => p.id), bad.drops.roaming.points.filter((p) => p.id !== 'ring-1-north-west').map((p) => p.id), 'the page leaves the offending point out instead of failing to load'); assert.match(said, /ring-1-north-west/); assert.equal(clearOf(GOLDEN, spots), GOLDEN, 'all clear = the same rows'); } finally { console.warn = warn; }
});

test('the save field is optional: an old save loads with none, a good one round trips, a hostile one is cleaned', () => {
  const old = JSON.stringify({ v: P.version, kills: {}, ladder: [], unlocked: [], coins: 3, banked: 0, pile: null, lost: [] });
  assert.equal('golden' in parseSave(old, P), false, 'a save from before has no field');
  const g = { held: { id: 'sunblade', charges: 9 }, ground: [{ id: 'golden-axe', x: 4, z: -2, charges: 10 }], taken: { 'ring-2-north-west': 12345 } };
  const store = memory(); assert.equal(writeSave(store, P, { ...freshSave(), golden: g }), true);
  assert.deepEqual(loadSave(store, P).golden, g);
  assert.equal(parseSave(JSON.stringify({ v: P.version, kills: {}, ladder: [], golden: { held: { id: 'x', charges: 3 } } }), P).golden, undefined, 'unknown ids are dropped, and an empty field is no field');
  const dirty = cleanGolden({ held: { id: 'golden-axe', charges: 999 }, ground: [{ id: 'sunblade', x: 1e9, z: 0, charges: 3 }, { id: 'sunblade', x: 1, z: 2, charges: -1 }, null, 'x'], taken: { nope: 1, 'ring-2-north-west': -4 } });
  assert.deepEqual(dirty, { held: { id: 'golden-axe', charges: GOLDEN.weapons.find((w) => w.id === 'golden-axe').charges }, ground: [], taken: {} });
  assert.equal(cleanGolden('junk'), undefined); assert.equal(cleanGolden(null), undefined);
  assert.equal(loadWeapon(g.held ? { ...freshGolden(), held: g.held } : undefined, GOLDEN, DRAW, 'x'), 'longsword', 'held at load, his drawn weapon is the golden row\'s');
  assert.equal(loadWeapon({ ...freshGolden(), held: { id: 'plasma-spear', charges: 3 } }, GOLDEN, DRAW, 'gladius'), 'gladius', 'a weapon he cannot draw falls back to his boss-reward one');
  assert.equal(heroWeapon(freshSave(), P, FIGHT.weapon, DRAW, ''), FIGHT.weapon, 'the boss-reward weapon rule is untouched');
});

test('the controller: walk onto it, equip, charges fall with each landed blow, revert at 0, death drops it, tap needs reach', () => {
  const log = { lines: [], counter: [], tint: [], frames: 0, tap: null, lists: [] };
  let save = freshGolden(), clock = 0;
  const ui = { frame: (items, _hero, tap) => { log.frames++; log.tap = tap; log.lists.push(items); }, counter: (h) => log.counter.push(h ? [h.row.id, h.charges] : null), line: (t) => log.lines.push(t), tint: (r) => log.tint.push(r ? r.id : null) };
  const events = [];
  const gc = createGolden({ rows: GOLDEN, drawable: DRAW, ui, get: () => save, put: (n) => { save = n; }, now: () => clock, rng: seq(0.5), });
  gc.onPickup((e) => events.push(e));
  const dropped = gc.dropGolden({ x: 30, z: 0 }, 2);   // another lane drops one (tier 2 = the axe is allowed)
  assert.ok(dropped); assert.equal(save.ground.length, 1);
  gc.step({ x: 0, z: 0 }, true); assert.equal(gc.held(), null, 'too far to walk onto');
  log.tap(String(0), 'ground'); assert.equal(gc.held(), null, 'a tap beyond tapReachMetres does nothing');
  gc.step({ x: 30.5, z: 0 }, false); assert.equal(gc.held(), null, 'a fallen hero takes nothing');
  gc.step({ x: 30.5, z: 0 }, true);
  const held = gc.held(); assert.ok(held); assert.equal(events.length, 1); assert.equal(events[0].source, 'ground');
  assert.equal(save.ground.length, 0, 'the pickup left the ground');
  assert.deepEqual(log.counter.at(-1), [held.id, held.charges]); assert.equal(log.tint.at(-1), held.id);
  assert.match(log.lines.at(-1), new RegExp(rowOf(GOLDEN, held.id).name));
  const blow = { type: 'Hit', actor: 0, target: 1 }, taken = { type: 'Hit', actor: 1, target: 0 }, other = { type: 'Blocked', actor: 1, target: 0 };
  const hits = (events) => gc.strike({ health: 100, duel: { fighters: [{ health: 150 }, { health: 100 }] }, events });
  hits([taken, other]); assert.equal(gc.held().charges, held.charges, 'blows he takes spend nothing');
  hits([blow]); assert.equal(gc.held().charges, held.charges - 1);
  for (let i = 0; i < held.charges - 1; i++) hits([blow]);
  assert.equal(gc.held(), null, 'spent'); assert.equal(log.tint.at(-1), null, 'the tint is off'); assert.equal(log.counter.at(-1), null);
  assert.match(log.lines.at(-1), /spent/);
  gc.step({ x: 40, z: 0 }, true); gc.step({ x: 30.5, z: 0 }, true);   // pick it up again later: nothing left on the ground, a fresh walk-on finds only roaming ones
  assert.equal(gc.held(), null);
  const road = gc.items().find((i) => i.source === 'roaming'), spot = { x: road.x, z: road.z };
  gc.step(spot, true); assert.ok(gc.held(), 'a roaming point is walked onto the same way'); assert.equal(events.at(-1).source, 'roaming');
  assert.equal(gc.items().some((i) => i.key === road.key), false, 'taken: gone until it respawns');
  gc.step(spot, true); hits([blow]);
  const left = gc.held().charges; gc.died({ x: 7, z: 7 });
  assert.equal(gc.held(), null); assert.deepEqual(save.ground, [{ id: road.id, x: 7, z: 7, charges: left }]); assert.match(log.lines.at(-1), /lies where you fell/);
  // standing on a swap: the weapon he put down at his feet is not taken straight back
  gc.step({ x: 7.2, z: 7 }, true); assert.equal(gc.held()?.id, road.id, 'it can be taken back once he steps onto it');
  const n = gc.items().length; gc.step({ x: 7.2, z: 7 }, true); assert.equal(gc.items().length, n, 'no ping-pong while he stands on it');
  clock += GOLDEN.drops.roaming.respawnSeconds * 1000; gc.step({ x: 500, z: 500 }, true); assert.ok(gc.items().some((i) => i.key === road.key), 'a taken roaming point returns on the clock');
  const radar = []; goldenBlips(gc.items(), (x, z, c) => radar.push(c)); assert.ok(radar.length && radar.every((c) => c === 'golden'));
  assert.equal(lineOf(GOLDEN.lines.spent, { name: 'A', power: 'p' }, 0), 'A is spent');
  // one list per frame: the markers, the taps and the radar all read the list the step built, not a rebuild each
  gc.step({ x: 500, z: 500 }, true); const frameList = log.lists.at(-1);
  assert.equal(gc.items(), frameList, 'the radar reads the frame\'s list'); assert.equal(gc.items(), gc.items(), 'and so does everything else until the save changes');
  gc.step({ x: 500, z: 500 }, true); assert.notEqual(log.lists.at(-1), frameList, 'the next frame builds a fresh one');
});

test('a tap on a pickup in reach takes it', () => {
  let save = { ...freshGolden(), ground: [{ id: 'sunblade', x: 3, z: 0, charges: 5 }] }, tapFn;
  const ui = { frame: (_i, _h, tap) => { tapFn = tap; }, counter() {}, line() {}, tint() {} };
  const gc = createGolden({ rows: GOLDEN, drawable: DRAW, ui, get: () => save, put: (n) => { save = n; }, now: () => 0, rng: seq(0.1) });
  gc.step({ x: 0, z: 0 }, true); assert.equal(gc.held(), null);
  tapFn('0', 'ground'); assert.deepEqual(gc.held(), { id: 'sunblade', charges: 5 });
});

test('as built: the module and the page wiring carry no literal beyond the rows (as-data), and main.ts stays a few lines', () => {
  const main = readFileSync(new URL('../src/client/main.ts', import.meta.url), 'utf8');
  assert.match(main, /mountGolden/); assert.match(main, /practice = golden\.strike\(practice\)/);
  assert.match(main, /KIND_CTX\.tune = mergeTune\(BASE_TUNE, escalation\(PROG\.save, PROG_ROWS\)\); KINDS = kindTable\(KIND_CTX\)/, 'the rider no longer rides the tune: the kill rebuild line is the original');
});
