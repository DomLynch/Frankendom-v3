// Heat (src/heat.ts, data/heat.json, src/fight/heat-hud.ts; Dom 2026-10-28, ported from Armagedom): the rows validate, kills/stars/rings/coins raise it, quiet time cools it, death clears it,
// it never reaches the save, and its HUD is plain DOM text that builds nothing per frame (Armagedom's tally-texture trap).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HEAT, heatOn, addCoins, addHeat, freshHeat, heatText, heatTier, killHeat, onKill, resetHeat, stepHeat, validateHeat } from '../src/heat.ts';
import { mountHeatHud } from '../src/fight/heat-hud.ts';
import { validateFile } from '../src/sim/validate.js';
import { freshSave, parseSave, writeSave } from '../src/progression.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const RING_IDS = read('rings').rings.map((r) => r.id);
const patch = (f) => { const d = structuredClone(HEAT); f(d); return d; };

test('the flag row: default OFF, ?heat=1 shows the line, on: true shows it for all; a bad flag row is refused; the page mounts the HUD only through heatOn', () => {
  assert.equal(HEAT.on, false);
  assert.equal(heatOn(''), false);
  assert.equal(heatOn('?heat=0'), false);
  assert.equal(heatOn('?other=1'), false);
  assert.equal(heatOn(`?${HEAT.query}=${HEAT.value}`), true);
  assert.equal(heatOn('', { ...HEAT, on: true }), true);
  assert.equal(HEAT.query, 'heat'); assert.equal(HEAT.value, '1');
  assert.match(validateHeat(patch((d) => { d.on = 'yes'; }), RING_IDS).join(';'), /heat\.on/);
  assert.match(validateHeat(patch((d) => { d.query = 'Heat!'; }), RING_IDS).join(';'), /heat\.query/);
  assert.match(validateHeat(patch((d) => { d.value = ''; }), RING_IDS).join(';'), /heat\.value/);
  const main = src('src/client/main.ts');
  assert.match(main, /heatHud = ZONE && heatOn\(search\) \? mountHeatHud\(/);   // off = no HUD element, no style
  assert.doesNotMatch(main, /[?&]heat=/);   // the query string lives in the row
});

test('the table validates and a bad row is named', () => {
  assert.deepEqual(validateFile('heat', read('heat')), []);
  assert.deepEqual(validateHeat(HEAT, RING_IDS), []);
  for (const [name, f, re] of [
    ['a ceiling out of range', (d) => { d.maxHeat = 500; }, /maxHeat/],
    ['a ring that is not a ring', (d) => { d.gain.ring['ring-9'] = 1; }, /ring/],
    ['tiers that do not ascend', (d) => { d.tiers[1].minHeat = 1; }, /ascend/],
    ['a first tier above 1', (d) => { d.tiers[0].minHeat = 2; }, /first tier/],
    ['a top tier above the ceiling', (d) => { d.maxHeat = 3; }, /top tier/],
    ['a colour', (d) => { d.hud.colour = 'orange'; }, /colour/],
    ['a decay of zero', (d) => { d.decay.secondsPerMark = 0; }, /secondsPerMark/],
    ['a negative gain', (d) => { d.gain.kill = -1; }, /gain\.kill/],
  ]) assert.match(validateHeat(patch(f), RING_IDS).join(';'), re, name);
});

test('a kill is worth its kill, its stars, its ring and (every 50 coins) a mark', () => {
  assert.equal(killHeat(HEAT, 0, null), 1);
  assert.equal(killHeat(HEAT, 2, null), 3, 'two stars add two');
  assert.equal(killHeat(HEAT, 0, 'ring-2'), 2, 'a ring 2 boss adds the ring row');
  assert.equal(killHeat(HEAT, 1, 'ring-3'), 3);
  assert.equal(killHeat(HEAT, 0, 'ring-1'), 1, 'a ring with no row adds nothing');
  const h = freshHeat();
  for (let i = 0; i < 5; i++) onKill(h, HEAT, i, 0, null, 10);   // five kills of 10 coins: 5 for the kills, 1 for the 50 coins
  assert.equal(h.count, 6);
  assert.equal(h.coinBank, 0);
  addCoins(h, HEAT, 20, 5);
  assert.equal(h.coinBank, 20, 'the remainder waits');
  assert.equal(h.count, 6);
});

test('heat never passes the ceiling, and a non-number adds nothing', () => {
  const h = freshHeat();
  addHeat(h, HEAT, 999, 0);
  assert.equal(h.count, HEAT.maxHeat);
  for (const bad of [0, -3, NaN, undefined]) { const before = h.count; addHeat(h, HEAT, bad, 1); assert.equal(h.count, before); }
});

test('quiet time cools one mark per period, a kill restarts the clock, death clears it all', () => {
  const per = HEAT.decay.secondsPerMark, h = freshHeat();
  addHeat(h, HEAT, 3, 0);
  stepHeat(h, HEAT, per - 1); assert.equal(h.count, 3);
  stepHeat(h, HEAT, per); assert.equal(h.count, 2);
  stepHeat(h, HEAT, per * 2); assert.equal(h.count, 1, 'one more period, one more mark');
  addHeat(h, HEAT, 1, per * 2 + 10);
  stepHeat(h, HEAT, per * 3 + 9); assert.equal(h.count, 2, 'the kill restarted the clock');
  stepHeat(h, HEAT, per * 9); assert.equal(h.count, 0, 'a long rest cools it fully');
  assert.equal(h.lastAt, per * 9, 'at 0 the clock rests at now');
  addHeat(h, HEAT, 4, 5); h.coinBank = 30;
  resetHeat(h, 7);
  assert.deepEqual(h, { count: 0, lastAt: 7, coinBank: 0 });
});

test('tiers: none at 0, then the highest reached; the text names count and tier', () => {
  const h = freshHeat();
  assert.equal(heatTier(h), null); assert.equal(heatText(h), '');
  for (const [n, name] of [[1, 'Noticed'], [2, 'Hunted'], [3, 'Hunted'], [4, 'Marked'], [10, 'Marked']]) { h.count = n; assert.equal(heatTier(h).name, name); assert.equal(heatText(h), `Heat ${n} · ${name}`); }
});

test('session only: the module and the HUD name no storage, and the save string is the same with heat running', () => {
  for (const f of ['src/heat.ts', 'src/fight/heat-hud.ts']) assert.doesNotMatch(src(f), /localStorage|sessionStorage|indexedDB|writeSave|fetch\(|sendBeacon/, `${f} touches no storage or network`);
  const main = src('src/client/main.ts');
  assert.doesNotMatch(main, /writeSave\([^)]*\bheat\b/, 'heat is never handed to the save');
  const before = JSON.stringify(freshSave());
  const h = freshHeat(); onKill(h, HEAT, 1, 2, 'ring-2', 10);
  assert.equal(JSON.stringify(freshSave()), before);
  const store = new Map(), ls = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const P = read('progression'); writeSave(ls, P, freshSave());
  const saved = [...store.values()][0];
  onKill(h, HEAT, 2, 1, null, 10);
  assert.equal(JSON.stringify(parseSave(saved, P)), JSON.stringify(parseSave(saved, P)));
  assert.ok(!/heat/i.test(saved), 'no heat key in the save');
});

test('production-build traps: no canvas or texture in the heat code, no default-parameter optional call', () => {
  for (const f of ['src/heat.ts', 'src/fight/heat-hud.ts']) {
    const s = src(f);
    assert.doesNotMatch(s, /canvas|CanvasTexture|getContext|new T\./i, `${f} draws nothing`);
    assert.doesNotMatch(s, /=\s*[\w.]+\?\.\(/, `${f}: no default parameter that is an optional call`);
    assert.doesNotMatch(s, /\([^)]*=\s*[\w.]+\?\.[\w.]*\(/, `${f}: no default-parameter optional-call chain`);
  }
});

test('the HUD is plain DOM text, written only when the count changes (300 frames, no new element, no new write)', () => {
  let created = 0, writes = 0;
  const make = () => { created++; const el = { style: {}, dataset: {}, setAttribute() {}, remove() {}, set textContent(v) { writes++; this._t = v; }, get textContent() { return this._t; } }; return el; };
  const doc = { createElement: make, body: { append() {} }, head: { append() {} } };
  const hud = mountHeatHud(doc, HEAT), h = freshHeat();
  const base = created;
  for (let i = 0; i < 300; i++) hud.update(h);
  assert.equal(created, base, 'nothing is built while there is no heat');
  addHeat(h, HEAT, 2, 0);
  hud.update(h);
  const made = created, wrote = writes;
  assert.equal(made, base + 1, 'one line, made when the heat first shows');
  for (let i = 0; i < 300; i++) hud.update(h);
  assert.equal(created, made); assert.equal(writes, wrote, '300 frames at the same count write nothing');
  addHeat(h, HEAT, 2, 1); hud.update(h);
  assert.equal(writes, wrote + 1);
  resetHeat(h, 2); hud.update(h);
  assert.equal(writes, wrote + 2, 'death empties the line');
});
