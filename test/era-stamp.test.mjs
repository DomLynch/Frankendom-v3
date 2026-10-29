// The era stamp in the fight record (audit C, 2026-10-29; src/fight/era-flags.ts, rows in src/fight/era-flags-defs.json, the record's second flag byte bit 2). The replay-equals-live
// behaviour itself is test/era-replay.test.mjs; this file pins the stamp: the data row, the bytes, the refusals, and that a replay sets and then restores the flags.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ERA_FLAGS, eraByte, eraIds, eraStamp, underEra } from '../src/fight/era-flags.ts';
import { PAGE_ERA } from '../src/fight/era-rows.ts';
import { FIRST_ERA_VERSION, RECORD_VERSION, createRecorder, packRecord, unpackRecord } from '../src/fight/record.ts';
import { playScaleFor, setLateNotice, setPlayScale } from '../src/fight/play-radius.ts';
import { setStab } from '../src/fight/stab-rule.ts';
import { setStanceRows } from '../src/fight/stance-era.ts';
import { KNOCK_SIM, setKnockSim } from '../src/fight/knock-sim.ts';
import { SPECIAL_PACE, setSpecialPace } from '../src/fight/special-pace.ts';
import { SPECIAL_TERMS, setSpecialTerms } from '../src/fight/special-terms.ts';
import { HERO_NO_MANA, setHeroNoMana } from '../src/fight/hero-mana.ts';
import { KNOCK_ROUND, setKnockRound } from '../src/fight/knock-round.ts';

const IDS = ['knock-sim', 'special-pace', 'special-terms', 'hero-mana', 'knock-round'];
const off = () => { setKnockSim(null); setSpecialPace(null); setSpecialTerms(null); setHeroNoMana(false); setKnockRound(false); };
afterEach(off);
const live = () => { setPlayScale(playScaleFor('veteran', RECORD_VERSION)); setLateNotice(true); setStab(true); setStanceRows(true); };
const meta = { build: 't', opponent: 'veteran', weapon: 'longsword', skill: null, level: 1, seed: 7 };
const finish = (m) => { const r = createRecorder(m); r.push({ move: { x: 0, z: 0, yaw: 0, run: false }, action: null, guard: false, lock: false }); return r.finish('abandoned'); };
const flagsNow = () => ({ knockSim: KNOCK_SIM, specialPace: SPECIAL_PACE, specialTerms: SPECIAL_TERMS, heroNoMana: HERO_NO_MANA, knockRound: KNOCK_ROUND });

test('the data row lists exactly the five flags the sim reads, one bit each, in order', () => {
  assert.deepEqual(ERA_FLAGS.map((f) => f.id), IDS);
  assert.deepEqual(ERA_FLAGS.map((f) => f.bit), [0, 1, 2, 3, 4]);
  assert.equal(new Set(ERA_FLAGS.map((f) => f.bit)).size, ERA_FLAGS.length);
});

test('eraByte / eraIds round-trip every subset; zero, an unknown bit and an unknown id are refused', () => {
  for (let m = 1; m < 1 << IDS.length; m++) { const ids = eraIds(m); assert.equal(eraByte(ids), m); }
  assert.throws(() => eraIds(0), /unknown era flags/);
  assert.throws(() => eraIds(1 << 5), /unknown era flags/);
  assert.throws(() => eraIds(0xff), /unknown era flags/);
  assert.throws(() => eraByte(['nope']), /unknown era flag/);
});

test('eraStamp reads what is on now (none = undefined), in bit order', () => {
  off(); assert.equal(eraStamp(), undefined);
  setHeroNoMana(true); setKnockRound(true); assert.deepEqual(eraStamp(), ['hero-mana', 'knock-round']);
  underEra(IDS, PAGE_ERA, () => assert.deepEqual(eraStamp(), IDS));
  assert.deepEqual(eraStamp(), ['hero-mana', 'knock-round'], 'underEra put the ambient flags back');
});

test('a record with no flag on is written exactly as before: no era, no flag bit, and a stamped one is longer by exactly the era byte', () => {
  live(); off();
  const plain = finish(meta); assert.equal(plain.era, undefined);
  const bytes = packRecord(plain);
  setHeroNoMana(true);
  const stamped = finish(meta); assert.deepEqual(stamped.era, ['hero-mana']);
  assert.equal(packRecord(stamped).length, bytes.length + 1, 'the second flag byte (v53+) is already there; the era byte is the one extra');
  assert.equal(unpackRecord(bytes).era, undefined);
});

test('createRecorder stamps the live flags at fight start and the stamp round-trips through pack and unpack', () => {
  live(); setKnockSim(PAGE_ERA.knockSim()); setSpecialPace(PAGE_ERA.specialPace()); setSpecialTerms(PAGE_ERA.specialTerms()); setHeroNoMana(PAGE_ERA.heroNoMana()); setKnockRound(PAGE_ERA.knockRound());
  const rec = finish(meta);
  assert.deepEqual(rec.era, IDS); assert.ok(rec.v >= FIRST_ERA_VERSION);
  assert.deepEqual(unpackRecord(packRecord(rec)).era, IDS);
});

test('an explicit era in the meta wins over the ambient flags; [] means none', () => {
  live(); off();
  assert.deepEqual(finish({ ...meta, era: ['special-pace'] }).era, ['special-pace']);
  setHeroNoMana(true);
  assert.equal(finish({ ...meta, era: [] }).era, undefined);
  assert.throws(() => createRecorder({ ...meta, era: ['nope'] }), /unknown era flag/);
});

test('pack refuses an empty or unknown era; unpack refuses a zero byte, an unknown bit, and the bit on a version that has no flag for it', () => {
  live(); setHeroNoMana(true);
  const rec = finish(meta), bytes = packRecord(rec);
  assert.throws(() => packRecord({ ...rec, era: [] }), /empty era stamp/);
  assert.throws(() => packRecord({ ...rec, era: ['nope'] }), /unknown era flag/);
  assert.throws(() => packRecord({ ...rec, v: 90, era: ['hero-mana'] }), /era flags on a version|cannot pack/);
  // the era byte sits right before the level byte (level u8, seed u32, ticks u32, outcome u8 = 10 bytes) and the 6n tick columns: find it from the end
  const eraAt = bytes.length - 6 * rec.ticks - 10 - 1;
  assert.equal(bytes[eraAt], 1 << ERA_FLAGS.find((f) => f.id === 'hero-mana').bit);
  const zero = bytes.slice(); zero[eraAt] = 0; assert.throws(() => unpackRecord(zero), /unknown era flags/);
  const unknown = bytes.slice(); unknown[eraAt] = 1 << 7; assert.throws(() => unpackRecord(unknown), /unknown era flags/);
  const old = bytes.slice(); old[2] = FIRST_ERA_VERSION - 1; assert.throws(() => unpackRecord(old), /unknown spell flag/);
});

test('underEra sets exactly the stamped flags from the page rows, ignores the ambient ones, and restores them (also on a throw)', () => {
  setSpecialPace(PAGE_ERA.specialPace()); setHeroNoMana(true);
  const before = flagsNow();
  underEra(['knock-sim', 'knock-round'], PAGE_ERA, () => {
    const n = flagsNow();
    assert.ok(n.knockSim && n.knockRound); assert.equal(n.specialPace, null); assert.equal(n.specialTerms, null); assert.equal(n.heroNoMana, false);
  });
  assert.deepEqual(flagsNow(), before);
  assert.throws(() => underEra(['knock-sim'], PAGE_ERA, () => { throw new Error('boom'); }), /boom/);
  assert.deepEqual(flagsNow(), before);
  underEra(undefined, PAGE_ERA, () => assert.deepEqual(flagsNow(), { knockSim: null, specialPace: null, specialTerms: null, heroNoMana: false, knockRound: false }));
  assert.deepEqual(flagsNow(), before);
});

test('a stamped flag the build\'s data rows have off is a refusal, not a silent different fight', () => {
  const rowsOff = { ...PAGE_ERA, specialPace: () => null, knockRound: () => false };
  assert.throws(() => underEra(['special-pace'], rowsOff, () => 0), /special-pace.*rows have it off/);
  assert.throws(() => underEra(['knock-round'], rowsOff, () => 0), /knock-round.*rows have it off/);
  assert.deepEqual(flagsNow(), { knockSim: null, specialPace: null, specialTerms: null, heroNoMana: false, knockRound: false }, 'nothing is left set after the refusal');
});
