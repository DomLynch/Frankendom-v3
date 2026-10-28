// The Flesh Market (data/market.json, src/market.ts), 375 wide, on the BUILT dist, driven by real touch input (taps, never a hook call): a save with 400 banked coins, a pair of rare Arachne heads and a bronze trophy is seeded, the
// hero is at the camp (the merchant stands 3.6 m away, so the Trade chip is up from the first frame):
//   <tag>-1-chip       the Trade chip over the merchant
//   <tag>-2-buy        the sheet, Buy tab: three items for the day
//   <tag>-3-bought     after a tap on Buy: coins down, the row reads Sold
//   <tag>-4-sell       the Sell tab: the parts and the trophy with their prices
//   <tag>-5-reload     after a reload: the same three items, the bought one still Sold
// It prints the save and the sheet at each beat and fails on a page error, a console error, a sheet outside the 375 box, or a rule that did not hold (spend, earn, seeded stock, no sell-then-rebuy gain).
//   node scripts/market-stills.mjs <base url> <out dir> <tag>      (on a Mac it uses Metal, elsewhere SwiftShader)
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const [base, out, tag] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/market-stills.mjs <base url> <out dir> <tag>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const PROG = JSON.parse(readFileSync(new URL('../data/progression.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: Number(process.env.DSF ?? 2), isMobile: true, hasTouch: true });
let bad = 0;
const fail = (m) => { bad++; console.error(`${tag} FAIL ${m}`); };
page.on('pageerror', (e) => { bad++; console.error(`pageerror ${e.message}`); });
page.on('console', (m) => { if (m.type() === 'error') { bad++; console.error(`console ${m.text()}`); } });
const shot = (n) => page.screenshot({ path: `${out}/${tag}-${n}.png` });
const seed = { v: 1, kills: { gargantua: 1 }, ladder: ['gargantua'], unlocked: ['gladius'], coins: 0, banked: 400, pile: null, lost: [], parts: { 'arachne:head': { n: 2, star: 1 }, 'gargantua:leg_left': { n: 1, star: 0 } }, trophies: { 1: 1 } };
await page.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, [PROG.key, JSON.stringify(seed)]);
const save = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), PROG.key);
const tap = async (sel) => { const b = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel); if (!b) throw new Error(`nothing to tap: ${sel}`); await page.touchscreen.tap(b[0], b[1]); await page.waitForTimeout(250); };
const rows = () => page.evaluate(() => [...document.querySelectorAll('#flesh-market [data-market=row]')].map((r) => ({ key: r.dataset.key, text: r.textContent, disabled: r.querySelector('button')?.disabled })));
const sheet = () => page.evaluate(() => { const s = document.querySelector('#flesh-market [data-market=sheet]'); if (!s || s.hidden) return null; const r = s.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, banked: document.querySelector('#flesh-market [data-market=banked]')?.textContent, line: document.querySelector('#flesh-market [data-market=line]')?.textContent }; });
await page.goto(`${base}/`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 });
await page.waitForTimeout(3500);
const chipUp = await page.evaluate(() => { const c = document.querySelector('#flesh-market [data-market=chip]'); if (!c || c.hidden) return null; const r = c.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
console.log(`${tag} chip`, JSON.stringify(chipUp));
if (!chipUp) fail('the Trade chip is not up at the camp');
else if (chipUp.h < 44 || chipUp.x < 0 || chipUp.x + chipUp.w > 375) fail('the chip is under 44 px tall or off the 375 box');
await shot('1-chip');
await tap('#flesh-market [data-market=chip]');
const open = await sheet(); console.log(`${tag} sheet`, JSON.stringify(open));
if (!open) fail('a tap on the chip does not open the sheet');
else if (open.x < -0.5 || open.x + open.w > 375.5) fail('the sheet is outside the 375 box');
if (open && !/Banked 400/.test(open.banked ?? '')) fail('the sheet does not show 400 banked coins');
const stock = await rows(); console.log(`${tag} stock`, JSON.stringify(stock));
if (stock.length !== 3) fail('three items for sale');
await shot('2-buy');
const first = stock.find((r) => !r.disabled);
if (!first) fail('nothing affordable to buy'); else {
  const price = Number(/(\d+) coins/.exec(first.text)?.[1]);
  await tap(`#flesh-market [data-market=buy][data-key="${first.key}"]`);
  const s1 = await save(); console.log(`${tag} bought`, JSON.stringify({ banked: s1.banked, market: s1.market, parts: s1.parts }));
  if (s1.banked !== 400 - price) fail(`buying "${first.key}" for ${price} leaves ${s1.banked}, not ${400 - price}`);
  if (!s1.market?.bought?.includes(first.key)) fail('the purchase is not recorded for the day');
  const after = (await rows()).find((r) => r.key === first.key);
  if (!/Sold/.test(after?.text ?? '')) fail('the bought row does not read Sold');
  await shot('3-bought');
}
await tap('#flesh-market [data-market=tab-sell]');
await shot('4-sell');
const sells = await rows(); console.log(`${tag} sells`, JSON.stringify(sells));
const before = (await save()).banked;
const trophy = sells.find((r) => r.key === 'trophy:1');
if (!trophy) fail('the trophy is not for sale'); else {
  const price = Number(/(\d+) coins/.exec(trophy.text)?.[1]);
  await tap('#flesh-market [data-market=sell][data-key="trophy:1"]');
  await tap('#flesh-market [data-market=sell][data-key="trophy:1"]');   // a trophy asks "Sure?" first
  const s2 = await save();
  if (s2.banked !== before + price) fail(`selling the trophy for ${price} leaves ${s2.banked}, not ${before + price}`);
  if (s2.trophies && s2.trophies[1]) fail('the trophy is still in the save');
  if ((s2.market?.soldToday ?? 0) !== price) fail('the day\'s sales total is not recorded');
}
const mid = await save();
await page.reload();
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 });
await page.waitForTimeout(3000);
await tap('#flesh-market [data-market=chip]');
const again = await rows(); console.log(`${tag} reloaded`, JSON.stringify(again));
if (JSON.stringify(again.map((r) => r.key)) !== JSON.stringify(stock.map((r) => r.key))) fail('a reload changed the day\'s stock');
if (first && !/Sold/.test(again.find((r) => r.key === first.key)?.text ?? '')) fail('a reload put the bought item back on sale');
const end = await save();
if (end.banked !== mid.banked) fail('a reload changed the banked coins');
await shot('5-reload');
await browser.close();
console.log(bad ? `${tag} FAILED (${bad})` : `${tag} ok: 0 console errors`);
process.exit(bad ? 1 : 0);
