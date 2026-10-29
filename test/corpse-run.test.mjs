// The corpse run (src/corpse-run.ts, data/corpse-run.json; Dom 2026-10-28, Valheim style, no URL flag): coins earned per boss kill, a pile where the hero fell, its retrieval, the replacement by a second death,
// the lingering boss, the save round trip (corrupt saves included), and that a fresh game is the game before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CORPSE, atCamp, bank, carriedSave, cleanCorpse, cleanPile, coinsFor, dropPile, earn, inReach, lineOf, lingerSpot, markerAlpha, regain, retrieve, validateCorpseRun } from '../src/corpse-run.ts';
import { freshSave, heroWeapon, loadSave, parseSave, recordKill, writeSave } from '../src/progression.ts';
import { RADAR, pileBlip, validateRadar } from '../src/fight/radar.ts';
import { validateFile } from '../src/sim/validate.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const P = read('progression'), FIGHT = read('fight'), ROWS = read('corpse-run'), PROFILES = read('profiles');
const IDS = PROFILES.profiles.map((p) => p.id);
const memory = () => { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; };
const patch = (f) => { const d = structuredClone(ROWS); f(d); return d; };
const CAMP = { x: 0, z: 0 };
const withCoins = (n, weaponBoss = null) => { let s = freshSave(); for (let i = 0; i < n; i++) s = earn(s, CORPSE, 'gargantua'); if (weaponBoss) s = recordKill(s, weaponBoss, P).save; return s; };

test('the table validates and every value is a row: no coin currency existed, a boss kill pays 10', () => {
  assert.deepEqual(validateFile('corpse-run', ROWS), []);
  validateCorpseRun(ROWS, IDS);
  assert.deepEqual(Object.keys(ROWS.coins.perBoss), P.bosses.map((b) => b.id));
  assert.equal(coinsFor(CORPSE, 'arachne'), 10);
  assert.equal(coinsFor(CORPSE, 'unlisted'), CORPSE.coins.perKill, 'a boss with no row of its own pays the common one');
  for (const [name, f] of Object.entries({
    'a range': (d) => { d.linger.seconds = 5000; }, 'a colour': (d) => { d.marker.colour = 'gold'; }, 'a boss id': (d) => { d.coins.perBoss.ghost = 5; },
    'an empty line': (d) => { d.pile.line = ' '; }, 'a reach beyond the leash': (d) => { d.pile.reachMetres = 9; d.linger.leashRadius = 5; }, 'a version': (d) => { d.version = 0; },
  })) assert.throws(() => validateCorpseRun(patch(f), IDS), /corpse-run/, name);
  validateRadar(RADAR);
  assert.equal(RADAR.classes.pile.colour, '#ffd34a', 'the radar has a pile class');
});

test('a boss kill pays coins, carried (unbanked) until the hero stands at camp', () => {
  let s = earn(earn(freshSave(), CORPSE, 'gargantua'), CORPSE, 'arachne');
  assert.deepEqual([s.coins, s.banked], [20, 0]);
  assert.equal(atCamp(CORPSE, CAMP, { x: 4, z: 0 }), true); assert.equal(atCamp(CORPSE, CAMP, { x: 6, z: 0 }), false);
  const out = bank(s, CORPSE); s = out.save;
  assert.deepEqual([s.coins, s.banked, out.coins], [0, 20, 20]);
  assert.equal(bank(s, CORPSE).save, s, 'nothing carried = the same save');
  const rich = { ...freshSave(), coins: CORPSE.coins.cap }; assert.equal(earn(rich, CORPSE, 'gargantua').coins, CORPSE.coins.cap, 'capped');
});

test('death drops the carried coins and the carried weapon as ONE pile where he fell; banked coins are safe', () => {
  let s = withCoins(3, 'gargantua'); s = bank(s, CORPSE).save; s = earn(s, CORPSE, 'arachne');
  assert.deepEqual([s.coins, s.banked], [10, 30]);
  const out = dropPile(s, CORPSE, { x: 7.5, z: -3 }, 'arachne', 'gladius');
  assert.deepEqual(out.pile, { v: 1, x: 7.5, z: -3, coins: 10, weapon: 'gladius', boss: 'arachne' });
  assert.deepEqual([out.save.coins, out.save.banked, out.save.pile], [0, 30, out.pile]);
  assert.equal(out.replaced, null);
  assert.deepEqual(carriedSave(out.save).unlocked, [], 'the weapon in the pile is not his until retrieved');
  assert.equal(heroWeapon(carriedSave(out.save), P, FIGHT.weapon, ['longsword', 'gladius'], ''), FIGHT.weapon, 'a reload with a pile draws the fight row weapon');
  const bare = dropPile({ ...freshSave() }, CORPSE, { x: 1, z: 1 }, 'arachne', null);
  assert.equal(bare.pile, null, 'carrying nothing leaves no pile'); assert.deepEqual(bare.save, freshSave());
  const coinsOnly = dropPile(withCoins(1), CORPSE, { x: 1, z: 1 }, 'pitborn', null);
  assert.equal(coinsOnly.pile.weapon, null, 'the fight row weapon is never dropped');
});

test('walking over the pile gives everything back; out of reach changes nothing', () => {
  const dropped = dropPile(withCoins(2, 'arachne'), CORPSE, { x: 10, z: 10 }, 'arachne', 'cleaver').save;
  assert.equal(inReach(CORPSE, dropped.pile, { x: 10, z: 12.5 }), false);
  assert.equal(inReach(CORPSE, dropped.pile, { x: 10, z: 11.5 }), true);
  const got = retrieve(dropped, CORPSE);
  assert.deepEqual([got.coins, got.weapon, got.save.pile, got.save.coins], [20, 'cleaver', null, 20]);
  assert.deepEqual(carriedSave(got.save).unlocked, ['cleaver']);
  assert.equal(retrieve(got.save, CORPSE).save, got.save, 'no pile = nothing happens');
  assert.equal(lineOf(CORPSE.pile.lineWeapon, { coins: 20, weapon: 'Cleaver' }), 'Recovered 20 coins and the Cleaver');
});

test('a second death replaces the pile: the older coins are gone, its weapon is lost until that boss falls again (the Valheim rule)', () => {
  const first = dropPile(withCoins(2, 'gargantua'), CORPSE, { x: 5, z: 5 }, 'gargantua', 'gladius').save;
  const second = dropPile(earn(first, CORPSE, 'pitborn'), CORPSE, { x: -8, z: 2 }, 'pitborn', null);
  assert.deepEqual(second.pile, { v: 1, x: -8, z: 2, coins: 10, weapon: null, boss: 'pitborn' });
  assert.deepEqual(second.replaced, first.pile);
  assert.deepEqual(second.save.lost, ['gladius']);
  assert.deepEqual(carriedSave(second.save).unlocked, [], 'the lost weapon stays out of his hand');
  assert.equal(retrieve(second.save, CORPSE).coins, 10, 'only the newer pile can be retrieved');
  const back = regain(second.save, 'gladius');
  assert.equal(back.regained, true); assert.deepEqual(carriedSave(back.save).unlocked, ['gladius']);
  assert.equal(regain(back.save, 'gladius').regained, false);
  assert.equal(dropPile(first, CORPSE, { x: 0, z: 0 }, 'pitborn', null).save.pile, first.pile, 'a death with nothing to drop leaves the old pile where it lies');
});

test('the killer lingers at the pile: its spot moves there with the row leash; its other fields are untouched', () => {
  const spot = { id: 'a', kind: 'arachne', x: 30, z: -40, aggro: 9, leash: 14, respawnSeconds: 60 };
  const l = lingerSpot(CORPSE, spot, { x: 5, z: 6 });
  assert.deepEqual(l, { ...spot, x: 5, z: 6, leash: CORPSE.linger.leashRadius });
  assert.deepEqual(spot, { id: 'a', kind: 'arachne', x: 30, z: -40, aggro: 9, leash: 14, respawnSeconds: 60 }, 'the zone row spot is not mutated');
});

test('the save round trip carries the pile, the coins and the lost weapons; a pre-corpse-run save loads with none; corrupt values are dropped, never thrown', () => {
  const st = memory();
  let s = recordKill(withCoins(4), 'gargantua', P).save;
  s = dropPile(s, CORPSE, { x: 3.25, z: -9.5 }, 'gargantua', 'gladius').save; s = { ...s, lost: ['maul'], banked: 77 };
  assert.equal(writeSave(st, P, s), true);
  assert.deepEqual(loadSave(st, P), s);
  assert.deepEqual([...st.m.keys()], [P.key], 'one key, the progression save\'s');
  const old = JSON.stringify({ v: 1, kills: { gargantua: 1 }, ladder: ['gargantua'], unlocked: ['gladius'] });
  assert.deepEqual(parseSave(old, P), { v: 1, kills: { gargantua: 1 }, ladder: ['gargantua'], unlocked: ['gladius'], coins: 0, banked: 0, pile: null, lost: [] });
  const base = { v: 1, kills: { gargantua: 1 }, ladder: ['gargantua'], unlocked: ['gladius'] };
  for (const bad of [{ v: 2, x: 1, z: 1, coins: 5, weapon: null, boss: 'a' }, { v: 1, x: 'a', z: 1, coins: 5, weapon: null, boss: 'a' }, { v: 1, x: 1, z: NaN, coins: 5, weapon: null, boss: 'a' }, { v: 1, x: 1, z: 1, coins: -5, weapon: null, boss: 'a' },
    { v: 1, x: 1, z: 1, coins: 5, weapon: 7, boss: 'a' }, { v: 1, x: 1, z: 1, coins: 5, weapon: null, boss: '' }, { v: 1, x: 1, z: 1, coins: 0, weapon: null, boss: 'a' }, 'pile', 7, null, [], { v: 1, x: 1e9, z: 0, coins: 1, weapon: null, boss: 'a' }]) {
    const got = parseSave(JSON.stringify({ ...base, coins: 5, banked: 'x', pile: bad, lost: ['ok', 3, 'ok', 'Bad Name'] }), P);
    assert.equal(got.pile, null, JSON.stringify(bad)); assert.deepEqual(got.kills, { gargantua: 1 }, 'the rest of the save loads'); assert.deepEqual([got.coins, got.banked, got.lost], [5, 0, ['ok']]);
  }
  for (const raw of ['{not json', '', 'null', '[]', '"s"', JSON.stringify({ ...base, v: 9 })]) assert.deepEqual(parseSave(raw, P), freshSave(), String(raw));
  assert.equal(cleanPile(undefined), null); assert.deepEqual(cleanCorpse({}), { coins: 0, banked: 0, pile: null, lost: [] });
  const refusing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
  assert.deepEqual(loadSave(refusing, P), freshSave()); assert.equal(writeSave(refusing, P, s), false);
  assert.deepEqual(loadSave(null, P), freshSave()); assert.equal(writeSave(null, P, s), false);
});

test('a fresh game is the game before: no coins, no pile, the same weapon, nothing withheld; a kill adds only the coins', () => {
  const f = freshSave();
  assert.equal(carriedSave(f), f, 'the same object: nothing withheld');
  assert.equal(heroWeapon(carriedSave(f), P, FIGHT.weapon, ['longsword'], ''), FIGHT.weapon);
  const killed = recordKill(f, 'gargantua', P);
  const { coins, banked, pile, lost, ...rest } = earn(killed.save, CORPSE, 'gargantua');
  assert.deepEqual(rest, { v: 1, kills: { gargantua: 1 }, ladder: ['gargantua'], unlocked: ['gladius'] }, 'the ladder, kills and unlocks are what they were');
  assert.deepEqual([coins, banked, pile, lost], [10, 0, null, []]);
  assert.equal(recordKill(withCoins(3), 'goblin', P).save.coins, withCoins(3).coins,'a kind that is no ladder boss changes nothing');
});

test('the marker fades as he nears the pile and pulses; the radar shows one gold blip, none without a pile', () => {
  const far = markerAlpha(CORPSE, 20, 0), near = markerAlpha(CORPSE, CORPSE.pile.reachMetres, 0);
  assert.ok(far > 0 && far <= CORPSE.marker.alpha); assert.equal(near, 0);
  assert.ok(markerAlpha(CORPSE, 20, CORPSE.marker.pulseSeconds / 4) > markerAlpha(CORPSE, 20, (CORPSE.marker.pulseSeconds * 3) / 4), 'it pulses');
  const seen = []; pileBlip({ x: 3, z: 4 }, (x, z, c) => seen.push([x, z, c])); pileBlip(null, (x, z, c) => seen.push([x, z, c]));
  assert.deepEqual(seen, [[3, 4, 'pile']]);
});
