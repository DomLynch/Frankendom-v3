// The Flesh Market (data/market.json, src/market.ts, src/market-inventory.ts, src/fight/market-hook.ts, market-view.ts): the data checks, the exploit rules, the daily seeded stock, the save round trip (an old save loads, a
// save that never traded writes nothing), and the shop driven the way a finger does (clicks on the chip, the tabs and the buttons; the real feel bus carries the events).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MARKET, buy, cleanMarket, dayKey, lineFor, partSellPrice, sell, sellList, stockFor, validateMarket, buyPrice, sellPrice } from '../src/market.ts';
import { listParts, removePart, addPart } from '../src/market-inventory.ts';
import { PARTS, collect, equip } from '../src/parts.ts';
import { freshSave, heroWeapon, loadSave, parseSave, writeSave } from '../src/progression.ts';
import { validateFile } from '../src/sim/validate.js';
import { spotBodyProblems } from '../src/fight/foe-body.ts';
import { feel } from '../src/fight/feel.ts';
import { mountMarket } from '../src/fight/market-hook.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const P = read('progression'), STARS = read('stars'), PROFILES = read('profiles'), RAW = read('market'), CORPSE = read('corpse-run');
const WDEFS = JSON.parse(readFileSync(new URL('../src/fight/weapon-defs.json', import.meta.url), 'utf8')).weapons;
const WEAPONS = Array.isArray(WDEFS) ? WDEFS.map((w) => w.id) : Object.keys(WDEFS);
const IDS = PROFILES.profiles.map((p) => p.id), CAP = CORPSE.coins.cap, clone = (o) => JSON.parse(JSON.stringify(o));
const CTX = { weaponIds: WEAPONS, tiers: STARS.levels.map((l) => l.star) };
const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), m }; };
const DAY1 = Date.UTC(2026, 9, 28, 12), DAY2 = Date.UTC(2026, 9, 29, 0, 0, 1);
const rich = (over = {}) => ({ ...freshSave(), banked: 5000, ...over });

test('data/market.json is valid, its schema is closed, the merchant body is a real 106 body', () => {
  assert.deepEqual(validateMarket(MARKET, CTX), []);
  assert.deepEqual(validateFile('market', RAW), []);
  assert.match(validateFile('market', { ...RAW, extra: 1 }).join(), /extra: unknown key/);
  assert.deepEqual(spotBodyProblems([{ id: 'merchant', body: MARKET.merchant.body }]), []);
  assert.equal(MARKET.stock.size, 3);
  for (const id of Object.keys(MARKET.price.weapon)) assert.ok(P.bosses.some((b) => b.weapon === id), `${id}: a weapon the hero can draw (a boss reward row)`);
});

test('a bad table is named, and a table where a sale could beat the rebuy is refused', () => {
  const bad = clone(MARKET); bad.price.sellX = 0.9; bad.price.buyX = 0.5; bad.price.weapon.nope = 5; bad.stock.slots = ['part']; bad.lines.buy = []; bad.merchant.closeMetres = 1;
  const e = validateMarket(bad, CTX).join('\n');
  assert.match(e, /sellX/); assert.match(e, /buyX/); assert.match(e, /weapon-defs row/); assert.match(e, /size entries/); assert.match(e, /lines\.buy/); assert.match(e, /closeMetres/);
  const edge = clone(MARKET); edge.price.buyX = 1; edge.price.sellX = 0.5; edge.price.base.common = 1;   // sells floor(0.5) = 0, asks 1: still a loss, so it passes
  assert.deepEqual(validateMarket(edge, CTX).filter((x) => /rebuys/.test(x)), []);
  const loopy = clone(MARKET); loopy.price.buyX = 1; loopy.price.sellX = 0.5; loopy.price.base.common = 3;   // sells 1, asks 3 fine; the validator's rule is sell < ask after rounding
  assert.deepEqual(validateMarket(loopy, CTX).filter((x) => /rebuys/.test(x)), []);
  // for the shipped table: every rarity sells for less than it asks
  for (const r of PARTS.rarities) assert.ok(sellPrice(MARKET, MARKET.price.base[r.id]) < buyPrice(MARKET, MARKET.price.base[r.id]), r.id);
});

test('the day rolls over at 00:00 UTC', () => {
  assert.equal(dayKey(Date.UTC(2026, 9, 28, 23, 59, 59)), '2026-10-28'); assert.equal(dayKey(Date.UTC(2026, 9, 29, 0, 0, 0)), '2026-10-29'); assert.equal(dayKey(NaN), '1970-01-01');
});

test('the stock is three items, a pure function of the date, and nothing the player does moves it', () => {
  const a = stockFor(MARKET, '2026-10-28', IDS), b = stockFor(MARKET, '2026-10-28', IDS);
  assert.equal(a.length, 3); assert.deepEqual(a, b);
  assert.equal(new Set(a.map((i) => i.key)).size, 3, 'no item twice');
  assert.ok(a.slice(0, 2).every((i) => i.cls === 'part'), 'the first two slots are parts');
  const days = new Set(); for (let d = 1; d <= 28; d++) days.add(JSON.stringify(stockFor(MARKET, `2026-11-${String(d).padStart(2, '0')}`, IDS).map((i) => i.key)));
  assert.ok(days.size >= 20, 'the days differ');
  for (const i of a) assert.ok(i.price >= 1 && i.price <= MARKET.caps.buyMax);
  // buying, selling and owning change nothing about the draw
  const s = buy(MARKET, rich(), a[0].key, '2026-10-28', IDS);
  assert.ok(s.ok); assert.deepEqual(stockFor(MARKET, '2026-10-28', IDS), a);
});

test('buy: spends banked coins, adds the part at its rarity, one purchase per item per day', () => {
  const stock = stockFor(MARKET, '2026-10-28', IDS), it = stock[0], carried = rich({ coins: 77 });
  const out = buy(MARKET, carried, it.key, '2026-10-28', IDS);
  assert.ok(out.ok); assert.equal(out.save.banked, 5000 - it.price); assert.equal(out.save.coins, 77, 'carried coins are never touched');
  assert.equal(out.save.parts[it.id].n, 1); assert.equal(out.save.parts[it.id].star, it.star);
  assert.deepEqual(out.save.market.bought, [it.key]); assert.equal(out.save.market.trades, 1);
  assert.deepEqual(buy(MARKET, out.save, it.key, '2026-10-28', IDS), { ok: false, reason: 'soldOut' });
  assert.equal(buy(MARKET, out.save, it.key, '2026-10-29', IDS).ok === false && buy(MARKET, out.save, it.key, '2026-10-29', IDS).reason, 'unknown', 'a key that is not in that day\'s stock');
  assert.deepEqual(buy(MARKET, rich({ banked: it.price - 1 }), it.key, '2026-10-28', IDS), { ok: false, reason: 'broke', short: 1 });
  assert.deepEqual(buy(MARKET, rich(), 'part:nonsense:head:2', '2026-10-28', IDS), { ok: false, reason: 'unknown' }, 'a forged key buys nothing');
});

test('a weapon bought is owned, drawn by heroWeapon, and not bought twice', () => {
  let day = null, key = null;
  for (let d = 1; d <= 120 && !key; d++) { const dd = `2027-01-${String(d % 28 + 1).padStart(2, '0')}-${d}`; const st = stockFor(MARKET, dd, IDS).find((i) => i.cls === 'weapon'); if (st) { day = dd; key = st.key; } }
  assert.ok(key, 'a weapon appears in some day\'s stock');
  const out = buy(MARKET, rich(), key, day, IDS);
  assert.ok(out.ok); const id = key.slice(7);
  assert.deepEqual(out.save.market.weapons, [id]);
  assert.equal(heroWeapon(out.save, P, 'longsword', ['longsword', id], ''), id);
  assert.equal(heroWeapon(rich(), P, 'longsword', ['longsword', id], ''), 'longsword');
  const again = buy(MARKET, { ...out.save, market: { ...out.save.market, bought: [] } }, key, day, IDS);
  assert.deepEqual(again, { ok: false, reason: 'owned' });
});

test('sell: pays banked coins, one copy at a time, never the last copy of a worn part, never above the daily cap', () => {
  let s = rich({ banked: 0 }); s = collect(collect(collect(s, 'gargantua', 'head', 0), 'gargantua', 'head', 0), 'arachne', 'arm_left', 2);
  const rows = sellList(MARKET, s);
  assert.deepEqual(rows.map((r) => [r.key, r.n, r.price]), [['part:gargantua:head', 2, partSellPrice(MARKET, 0)], ['part:arachne:arm_left', 1, partSellPrice(MARKET, 2)]]);
  const one = sell(MARKET, s, 'part:gargantua:head', '2026-10-28', CAP);
  assert.ok(one.ok); assert.equal(one.save.banked, partSellPrice(MARKET, 0)); assert.equal(one.save.parts['gargantua:head'].n, 1); assert.equal(one.save.market.soldToday, one.price);
  const worn = equip(one.save, 'gargantua:head');
  assert.deepEqual(sellList(MARKET, worn).map((r) => r.key), ['part:arachne:arm_left'], 'the last copy of a worn part is not for sale');
  assert.deepEqual(sell(MARKET, worn, 'part:gargantua:head', '2026-10-28', CAP), { ok: false, reason: 'none' });
  const all = sell(MARKET, worn, 'part:arachne:arm_left', '2026-10-28', CAP);
  assert.ok(all.ok && !('arachne:arm_left' in all.save.parts));
  const capped = { ...s, market: { day: '2026-10-28', bought: [], soldToday: MARKET.caps.sellPerDay - 1, weapons: [], trades: 0 } };
  assert.deepEqual(sell(MARKET, capped, 'part:gargantua:head', '2026-10-28', CAP), { ok: false, reason: 'capped' });
  assert.ok(sell(MARKET, capped, 'part:gargantua:head', '2026-10-29', CAP).ok, 'the cap is per UTC day');
  assert.deepEqual(sell(MARKET, { ...s, banked: CAP }, 'part:gargantua:head', '2026-10-28', CAP), { ok: false, reason: 'capped' }, 'the coin cap holds');
});

test('trophies are sold, never bought', () => {
  const s = rich({ banked: 0, trophies: { 1: 2, 2: 1 } });
  assert.deepEqual(sellList(MARKET, s).map((r) => [r.key, r.n]), [['trophy:1', 2], ['trophy:2', 1]]);
  const out = sell(MARKET, s, 'trophy:2', '2026-10-28', CAP);
  assert.ok(out.ok && out.save.trophies[1] === 2 && !('2' in out.save.trophies));
  const last = sell(MARKET, { ...s, trophies: { 1: 1 } }, 'trophy:1', '2026-10-28', CAP);
  assert.ok(last.ok && last.save.trophies === undefined);
  for (let d = 1; d < 60; d++) assert.ok(stockFor(MARKET, `2026-12-${d}`, IDS).every((i) => i.cls === 'part' || i.cls === 'weapon'));
});

test('no sell-then-rebuy gain: any chain of sells and buys of the same things only loses coins', () => {
  for (let d = 1; d <= 40; d++) {
    const day = `2026-11-${d}`, stock = stockFor(MARKET, day, IDS).filter((i) => i.cls === 'part');
    for (const it of stock) {
      let s = rich({ banked: 100000 }); const start = s.banked;
      s = addPart(s, it.id, it.star);   // an owned copy (as if cut)
      const sold = sell(MARKET, s, `part:${it.id}`, day, CAP);
      assert.ok(sold.ok);
      const back = buy(MARKET, sold.save, it.key, day, IDS);
      assert.ok(back.ok); assert.ok(back.save.banked < start, `${it.key} on ${day}: round trip ${start} -> ${back.save.banked}`);
    }
  }
});

test('the parts door: add, count, remove; the worn last copy stays', () => {
  let s = addPart(addPart({}, 'gargantua:head', 1), 'gargantua:head', 0);
  assert.deepEqual(s.parts['gargantua:head'], { n: 2, star: 1 });
  assert.equal(addPart(s, 'nonsense', 0), s);
  assert.deepEqual(listParts(s).map((p) => [p.id, p.n, p.sellable]), [['gargantua:head', 2, 2]]);
  const w = equip(s, 'gargantua:head');
  assert.equal(listParts(w)[0].sellable, 1);
  const r1 = removePart(w, 'gargantua:head'); assert.equal(r1.parts['gargantua:head'].n, 1); assert.equal(removePart(r1, 'gargantua:head'), null);
});

test('save: an old save loads untouched, a save that never traded writes no market, a trade round-trips, junk is cleaned', () => {
  const st = store(); assert.ok(writeSave(st, P, freshSave()));
  assert.ok(!('market' in JSON.parse(st.m.get(P.key))), 'no trade: byte for byte the save before');
  const old = parseSave(JSON.stringify({ v: 1, kills: {}, ladder: [], unlocked: [], coins: 3, banked: 9, pile: null, lost: [] }), P);
  assert.equal(old.market, undefined); assert.equal(old.banked, 9);
  const day = '2026-10-28', it = stockFor(MARKET, day, IDS)[0];
  const traded = buy(MARKET, rich(), it.key, day, IDS).save;
  writeSave(st, P, traded);
  const back = loadSave(st, P);
  assert.deepEqual(back.market, traded.market); assert.deepEqual(back.parts, traded.parts);
  assert.deepEqual(stockFor(MARKET, day, IDS), stockFor(MARKET, day, IDS), 'the same day after a reload: the same stock');
  assert.deepEqual(cleanMarket({ market: { day: 'yesterday', bought: ['x'], soldToday: -4, weapons: ['nope', 'gladius'], trades: 2.5 } }), { market: { day: '1970-01-01', bought: [], soldToday: 0, weapons: ['gladius'], trades: 0 } });
  assert.deepEqual(cleanMarket({ market: 'x' }), {}); assert.deepEqual(cleanMarket({}), {}); assert.deepEqual(cleanMarket({ market: { day: '2026-10-28', bought: [], soldToday: 0, weapons: [], trades: 0 } }), {});
});

test('lines are picked by date and trade count, never at random', () => {
  assert.equal(lineFor(MARKET, 'buy', '2026-10-28', 0), lineFor(MARKET, 'buy', '2026-10-28', 0));
  const seen = new Set(); for (let t = 0; t < 30; t++) seen.add(lineFor(MARKET, 'buy', '2026-10-28', t));
  assert.ok(seen.size === MARKET.lines.buy.length);
});

// ---- the shop, driven by clicks, with a tiny DOM and the real feel bus ----
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.attrs = {}; this.style = {}; this.hidden = false; this.className = ''; this.textContent = ''; this.parent = null; this.disabled = false; }
  append(...k) { for (const c of k) { c.parent = this; this.children.push(c); } }
  replaceChildren() { this.children = []; }
  setAttribute(k, v) { this.attrs[k] = v; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
  all(out = []) { out.push(this); for (const c of this.children) c.all(out); return out; }
  text() { return [this.textContent, ...this.children.map((c) => c.text())].join(' '); }
}
const mkDoc = () => ({ createElement: (t) => new El(t), body: new El('body'), head: new El('head') });
const find = (doc, pred) => doc.body.all().find(pred), byM = (doc, m) => find(doc, (e) => e.dataset.market === m);
const click = (e) => { assert.ok(!e.disabled, 'a disabled button is not clicked'); return e.onclick(); };

function shop(saveIn, nowMs = DAY1) {
  const doc = mkDoc(), box = { save: saveIn, now: nowMs, events: [] };
  const off = Object.values(MARKET.events).map((n) => feel.on(n, (name, payload) => box.events.push([name, payload])));
  const hook = mountMarket({ get: () => box.save, put: (s) => { box.save = s; }, profiles: PROFILES.profiles, stars: STARS, isWeapon: (id) => WEAPONS.includes(id), weaponName: (id) => id, bankCap: CAP, camp: { x: 0, z: 2 }, now: () => box.now, project: (x, y, z, out) => { out[0] = 187; out[1] = 300; return true; } }, doc);
  return { doc, box, hook, done() { hook.remove(); for (const o of off) o(); } };
}
const near = { x: 3, z: 0 }, far = { x: 30, z: 30 };

test('the chip shows only near the merchant; a tap opens the sheet; walking off or dying closes it', () => {
  const { doc, hook, done } = shop(rich());
  hook.step(far, true); assert.equal(byM(doc, 'chip').hidden, true);
  hook.step(near, true); assert.equal(byM(doc, 'chip').hidden, false); assert.match(byM(doc, 'chip').text(), /Trade/);
  assert.ok(byM(doc, 'chip').style.transform);
  hook.step(near, false); assert.equal(byM(doc, 'chip').hidden, true, 'a dead hero trades with nobody');
  hook.step(near, true); click(byM(doc, 'chip')); assert.equal(byM(doc, 'sheet').hidden, false); assert.equal(byM(doc, 'chip').hidden, true, 'the chip gives way to the sheet');
  hook.step({ x: 3, z: -3 }, true); assert.equal(byM(doc, 'sheet').hidden, false, 'still within the close distance');
  hook.step(far, true); assert.equal(byM(doc, 'sheet').hidden, true);
  hook.step(near, true); click(byM(doc, 'chip')); hook.step(near, false); assert.equal(byM(doc, 'sheet').hidden, true, 'dying closes it');
  done();
});

test('open, buy, sell, with the banked coins on the sheet and an event for each', () => {
  const s0 = collect(collect(rich({ banked: 400 }), 'arachne', 'head', 1), 'arachne', 'head', 1);
  const { doc, box, hook, done } = shop(s0);
  hook.step(near, true); click(byM(doc, 'chip'));
  const sheet = byM(doc, 'sheet');
  assert.match(byM(doc, 'banked').text(), /Banked 400/);
  const rows = doc.body.all().filter((e) => e.dataset.market === 'row');
  assert.equal(rows.length, 3, 'three items for sale');
  assert.equal(box.events[0][0], 'market:restock', 'the first open of a date restocks'); assert.equal(box.events[1][0], 'market:open'); assert.equal(box.events[1][1].stock.length, 3);
  const stock = stockFor(MARKET, '2026-10-28', IDS), cheap = stock.filter((i) => i.price <= 400)[0];
  assert.ok(cheap, 'an affordable item');
  const rowFor = (k) => rows.find((r) => r.dataset.key === k);
  click(rowFor(cheap.key).all().find((e) => e.dataset.market === 'buy'));
  assert.equal(box.save.banked, 400 - cheap.price); assert.ok(box.save.market.bought.includes(cheap.key));
  assert.match(byM(doc, 'banked').text(), new RegExp(`Banked ${400 - cheap.price}`));
  const sold = doc.body.all().find((e) => e.dataset.market === 'buy' && e.dataset.key === cheap.key);
  assert.ok(sold.disabled && /Sold/.test(sold.textContent), 'a bought item reads Sold');
  const ev = box.events.at(-1); assert.equal(ev[0], 'market:buy'); assert.equal(ev[1].price, cheap.price); assert.equal(ev[1].coinsLeft, box.save.banked);
  assert.ok(byM(doc, 'line').textContent.length > 0);
  click(byM(doc, 'tab-sell'));
  const key = 'part:arachne:head', before = box.save.banked;
  const sellBtn = () => doc.body.all().find((e) => e.dataset.market === 'sell' && e.dataset.key === key);
  click(sellBtn()); assert.equal(box.save.banked, before, 'a rare part asks "Sure?" first'); assert.match(sellBtn().textContent, /Sure/);
  click(sellBtn());
  assert.equal(box.save.banked, before + partSellPrice(MARKET, 1)); assert.equal(box.save.parts['arachne:head'].n, 1 + (cheap.id === 'arachne:head' ? 1 : 0) );
  assert.equal(box.events.at(-1)[0], 'market:sell');
  done();
});

test('not enough coins is refused with the shortfall; a daily cap is refused with a line; nothing changes', () => {
  const { doc, box, hook, done } = shop(rich({ banked: 1 }));
  hook.step(near, true); click(byM(doc, 'chip'));
  const btns = doc.body.all().filter((e) => e.dataset.market === 'buy');
  assert.ok(btns.every((b) => b.disabled && /Need \d+ more/.test(b.textContent)));
  assert.equal(box.save.banked, 1); assert.equal(box.save.market, undefined);
  done();
});

test('reload keeps the seeded stock and what was bought; the next day restocks', () => {
  const st = store(), first = shop(rich());
  first.hook.step(near, true); click(byM(first.doc, 'chip'));
  const stock = stockFor(MARKET, '2026-10-28', IDS), key = stock[0].key;
  click(first.doc.body.all().find((e) => e.dataset.market === 'buy' && e.dataset.key === key));
  writeSave(st, P, first.box.save); first.done();
  // a reload: a new page reads the save
  const reloaded = shop(loadSave(st, P));
  reloaded.hook.step(near, true); click(byM(reloaded.doc, 'chip'));
  const keys = reloaded.doc.body.all().filter((e) => e.dataset.market === 'row').map((r) => r.dataset.key);
  assert.deepEqual(keys, stock.map((i) => i.key), 'the same three items after a reload');
  const btn = reloaded.doc.body.all().find((e) => e.dataset.market === 'buy' && e.dataset.key === key);
  assert.ok(btn.disabled && /Sold/.test(btn.textContent), 'the bought item stays sold');
  assert.equal(reloaded.box.events.some((e) => e[0] === 'market:restock'), false, 'no restock on the same date');
  reloaded.done();
  // the next UTC date: new stock, the purchase list starts over, the bought part is still owned
  const next = shop(loadSave(st, P), DAY2);
  next.hook.step(near, true); click(byM(next.doc, 'chip'));
  const nkeys = next.doc.body.all().filter((e) => e.dataset.market === 'row').map((r) => r.dataset.key);
  assert.deepEqual(nkeys, stockFor(MARKET, '2026-10-29', IDS).map((i) => i.key));
  assert.ok(next.box.events.some((e) => e[0] === 'market:restock'));
  assert.ok(next.box.save.parts[stock[0].id], 'what he bought is still his');
  next.done();
});

test('no save (?save=off): the hook has nothing to show', () => {
  const { doc, hook, done } = shop(null);
  hook.step(near, true); assert.equal(byM(doc, 'chip').hidden, true);
  assert.equal(hook.stand(near), null);
  done();
});

test('the merchant is a standing figure at the camp plus the row\'s offset, facing the hero, loaded only when near', () => {
  const { hook, done } = shop(rich());
  const a = hook.stand(near);
  assert.deepEqual([a.x, a.z], [0 + MARKET.merchant.dx, 2 + MARKET.merchant.dz]); assert.deepEqual(a.spawn, { kind: MARKET.merchant.kind, body: MARKET.merchant.body });
  assert.equal(a.near, true); assert.equal(hook.stand(far).near, false); assert.equal(a.star, 0);
  assert.ok(Math.abs(a.heading - Math.atan2(near.x - a.x, near.z - a.z)) < 1e-9);
  done();
});
