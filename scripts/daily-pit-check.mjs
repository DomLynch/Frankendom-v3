// The Daily Pit on the BUILT game at 375 wide, headless Chromium, through the real input layer (real clicks on the real button, real KeyboardEvents for the fight). One context, so the save really persists
// across the reloads the button makes. The clock is pinned per page (Date.now only; frames still run) so a fixed UTC day gives a fixed boss and modifier.
//   1 start button + card (today's boss, twist, attempts)        2 Fight -> the page reloads INTO the daily: one boss, the banner, half health for Double damage
//   3 a win: the result screen, the DOM event, the record in the save   4 Try again -> a defeat: score 0, the best is kept   5 attempts spent: the card has no Fight button
//   6 the UTC rollover (23:59:59.9 -> 00:00:00.1): new day, new attempts   7 an old save with no daily field loads   8 zero page errors, zero console errors
//   node scripts/daily-pit-check.mjs <base url> <out dir>          (npm run build, then node scripts/serve.mjs 8733; playwright from the machine)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickFor, scoreOf } from '../src/daily-pit.ts';

const [base, out] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/daily-pit-check.mjs <base url> <out dir>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const D = JSON.parse(readFileSync(new URL('../data/daily-pit.json', import.meta.url), 'utf8'));
const PROG = JSON.parse(readFileSync(new URL('../data/progression.json', import.meta.url), 'utf8'));
const PROFILES = JSON.parse(readFileSync(new URL('../data/profiles.json', import.meta.url), 'utf8'));
const nameOf = (id) => PROFILES.profiles.find((p) => p.id === id).name;
const DAY1 = '2026-03-01', DAY2 = '2026-03-02';   // gargantua + Double damage, then the next UTC day
const at = (iso) => Date.parse(iso);
const pick1 = pickFor(D, DAY1), pick2 = pickFor(D, DAY2);
assert.deepEqual([pick1.boss, pick1.modifier.id], ['gargantua', 'double-damage']);

const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const phone = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const errors = [];
const ctx = await browser.newContext(phone);
const open = async (query, tag, { ready = true, pin, mode } = {}) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(`${tag}: ${e.message}`); console.error(`${tag}: pageerror ${e.message}`); });
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(`${tag}: console ${m.text()}`); console.error(`${tag}: console.error ${m.text()}`); } });
  // Date.now only: the pinned instant, then real time moving on from it (every frame and timer still runs); `mode`: the session key the button would have set
  await page.addInitScript(({ p, m, key }) => {
    if (p) { const real = Date.now.bind(Date), start = real(); Date.now = () => p + (real() - start); }
    if (m) { try { sessionStorage.setItem(key, m); } catch { /* blocked */ } }
  }, { p: pin ?? 0, m: mode ?? '', key: D.modeKey });
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  if (ready) {
    await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000 });
    await page.waitForTimeout(1200);
  } else await page.waitForFunction(() => !!globalThis.__v3DailyPit, null, { timeout: 60000 });
  return page;
};
const saved = (page) => page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, PROG.key);
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });
// the real input layer: KeyC (kick) through window keydown/keyup as the keyboard layer reads it; the sim's health is nudged only to make the fight short (as scripts/progression-stills.mjs does)
const fightTo = (page, { win }) => page.evaluate((won) => {
  globalThis.__drive = setInterval(() => {
    const k = (c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [h, f] = globalThis.__v3Fight.duel.fighters;
    if (won) { h.health = h.maxHealth; f.health = Math.min(f.health, 1); } else h.health = Math.min(h.health, 1);
    k('KeyC', 'keydown'); k('KeyC', 'keyup');
    if (globalThis.__v3Fight.finish) clearInterval(globalThis.__drive);
  }, 100);
}, win);

// 0 the plain world: the baseline boss health, and the button is there
const pin1 = at(`${DAY1}T12:00:00Z`);
let page = await open('', '0-plain', { pin: pin1 });
const plainHealth = await page.evaluate(() => globalThis.__v3Fight.duel.fighters[1].maxHealth);
assert.ok(plainHealth > 0);
// 1 the start button and the card
assert.equal((await page.textContent('#daily-pit-button')).trim(), D.ui.text.button);
await shot(page, '1-start-button');
await page.click('#daily-pit-button');
const card = await page.textContent('#daily-pit-card');
assert.match(card, new RegExp(nameOf('gargantua'))); assert.match(card, /Double damage/); assert.match(card, /3 of 3 attempts left/); assert.match(card, new RegExp(DAY1));
await shot(page, '2-card');
// 2 Fight: the page reloads INTO the daily
await Promise.all([page.waitForEvent('load'), page.click('#daily-pit-fight')]);
await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000 });
await page.waitForTimeout(1200);
const run = await page.evaluate(() => globalThis.__v3DailyPit.run);
assert.deepEqual([run.date, run.boss, run.modifier.id, run.stars], [DAY1, 'gargantua', 'double-damage', 0]);
assert.equal((await page.textContent('#daily-pit-button')).trim(), D.ui.text.buttonLeave);
assert.match(await page.textContent('#daily-pit-banner'), /Daily Pit · Double damage/);
const dailyHealth = await page.evaluate(() => globalThis.__v3Fight.duel.fighters[1].maxHealth);
assert.ok(Math.abs(dailyHealth - plainHealth * 0.5) <= 1, `double damage: half the health (${dailyHealth} vs ${plainHealth})`);
console.log(`daily boot: ${JSON.stringify({ run: [run.boss, run.modifier.id], plainHealth, dailyHealth })}`);
assert.equal(await page.evaluate((k) => { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw).ladder.length : 0; }, PROG.key), 0, 'nothing from the daily reaches the ladder');
await page.waitForFunction(() => globalThis.__v3Zone?.engaged === true, null, { timeout: 180000 });
await shot(page, '3-fight-banner');
assert.equal((await saved(page)).daily.attempts, 1, 'the attempt is spent at the engage');
// 3 a win
await page.evaluate((ev) => { globalThis.__got = []; window.addEventListener(ev, (e) => globalThis.__got.push(e.detail)); }, D.event);
await fightTo(page, { win: true });
await page.waitForSelector('#daily-pit-result', { timeout: 240000 });
await page.waitForTimeout(500);
await shot(page, '4-result-win');
const got = await page.evaluate(() => globalThis.__got);
assert.equal(got.length, 1, 'the share hook: one DOM event');
const win = got[0];
assert.deepEqual([win.date, win.boss, win.modifier, win.attempt, win.row.won, win.newBest], [DAY1, 'gargantua', 'double-damage', 1, true, true]);
assert.equal(win.row.score, scoreOf(D, { timeSeconds: win.row.timeSeconds, damage: win.row.damage, parts: win.row.parts, won: true }));
const txt = await page.textContent('#daily-pit-result');
assert.match(txt, /Cleared/); assert.match(txt, new RegExp(`Score ${win.row.score}`)); assert.match(txt, /Time/); assert.match(txt, /Damage taken/); assert.match(txt, /Parts cut/);
let s = await saved(page);
assert.deepEqual([s.daily.date, s.daily.attempts, s.daily.best.score, s.daily.bestEver], [DAY1, 1, win.row.score, win.row.score]);
assert.equal(s.ladder.length, 0, 'the daily records no kill on the ladder');
assert.equal(await page.evaluate(() => globalThis.__v3DailyPit.run.boss), 'gargantua');
console.log(`win: ${JSON.stringify(win.row)}`);
// 4 Try again -> a defeat
await Promise.all([page.waitForEvent('load'), page.click('#daily-pit-again')]);
await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000 });
assert.match(await page.textContent('#daily-pit-banner'), /Double damage/);
await page.evaluate((ev) => { globalThis.__got = []; window.addEventListener(ev, (e) => globalThis.__got.push(e.detail)); }, D.event);
await page.waitForFunction(() => globalThis.__v3Zone?.engaged === true, null, { timeout: 180000 });
await fightTo(page, { win: false });
await page.waitForSelector('#daily-pit-result', { timeout: 240000 });
await page.waitForTimeout(500);
await shot(page, '5-result-defeat');
const lost = (await page.evaluate(() => globalThis.__got))[0];
assert.deepEqual([lost.attempt, lost.row.won, lost.row.score, lost.newBest, lost.best.score], [2, false, D.score.min, false, win.row.score]);
assert.match(await page.textContent('#daily-pit-result'), /Defeated/);
s = await saved(page);
assert.deepEqual([s.daily.attempts, s.daily.best.score, s.daily.last.won], [2, win.row.score, false]);
// 5 attempts spent: seed the third, the next load is the plain world and the card has no Fight button
await page.evaluate((k) => { const j = JSON.parse(localStorage.getItem(k)); j.daily.attempts = 3; localStorage.setItem(k, JSON.stringify(j)); }, PROG.key);
await page.close();
page = await open('', '5-spent', { ready: false, pin: pin1, mode: DAY1 });
await page.waitForTimeout(1500);
assert.equal(await page.evaluate(() => globalThis.__v3DailyPit.run), null, 'no attempts left: the session mode is ignored');
assert.equal(await page.locator('#daily-pit-banner').count(), 0);
await page.click('#daily-pit-button');
const spent = await page.textContent('#daily-pit-card');
assert.match(spent, /0 of 3 attempts left/); assert.match(spent, new RegExp(`Best today: ${win.row.score}`)); assert.match(spent, /No attempts left today/);
assert.equal(await page.locator('#daily-pit-fight').count(), 0);
await shot(page, '6-card-spent');
await page.close();
// 6 the UTC rollover
page = await open('', '6a-before', { ready: false, pin: at(`${DAY1}T23:59:59.000Z`) });
assert.equal(await page.evaluate(() => globalThis.__v3DailyPit.date), DAY1);
await page.close();
page = await open('', '6b-after', { ready: false, pin: at(`${DAY2}T00:00:00.100Z`) });
assert.equal(await page.evaluate(() => globalThis.__v3DailyPit.date), DAY2);
await page.click('#daily-pit-button');
const next = await page.textContent('#daily-pit-card');
assert.match(next, /3 of 3 attempts left/); assert.match(next, new RegExp(nameOf(pick2.boss))); assert.match(next, new RegExp(pick2.modifier.name));
assert.match(next, new RegExp(`Best ever: ${win.row.score}`), 'the best ever carries over the rollover');
await page.close();
// 7 an old save with no daily field loads
page = await open('', '7-old-save', { ready: false, pin: pin1 });
await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ v: 1, kills: { gargantua: 1 }, ladder: ['gargantua'], unlocked: ['gladius'], coins: 3, banked: 0, pile: null, lost: [] })), PROG.key);
await page.reload(); await page.waitForFunction(() => !!globalThis.__v3DailyPit, null, { timeout: 60000 });
await page.click('#daily-pit-button');
assert.match(await page.textContent('#daily-pit-card'), /3 of 3 attempts left/);
await page.close();
await ctx.close();
await browser.close();
assert.deepEqual(errors, [], 'zero page errors, zero console errors');
console.log('daily-pit-check: ok');
