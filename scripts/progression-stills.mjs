// Progression and saving at 375 wide, headless (VPS Chromium, software GL). One context so the save really persists across a reload:
//   1 fresh page, kill the first boss (Gargantua) -> the discreet "Unlocked: Gladius" line + the localStorage key
//   2 reload with that save -> the hero holds the gladius, the bosses meet the raised scales
//   3 ?save=off after a save -> today's game (longsword, no raised scales, nothing read or written)
//   4 storage that throws on every read and write -> the page plays, the kill still lands, no page error
//   5 a seeded save with Gargantua + Arachne down -> the cleaver in his hand (the shipped Pitborn file)
//   node scripts/progression-stills.mjs <base url> <out dir>
import { mkdirSync } from 'node:fs';
import { launchBrowser, waitPlayable } from './lib/browser.mjs';

const [base, out] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/progression-stills.mjs <base url> <out dir>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const KEY = 'frankendom.v3.progress';
const browser = await launchBrowser({ angle: 'swiftshader', chromeEnv: null });
const errors = [];
const open = async (ctx, query = '', tag = 'page') => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(`${tag}: ${e.message}`); console.error(`${tag}: pageerror ${e.message}`); });
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await waitPlayable(page, { timeout: 180000 });
  await page.waitForTimeout(1500);
  return page;
};
const sim = (page) => page.evaluate((key) => {
  const f = globalThis.__v3Fight?.duel.fighters, line = document.querySelector('[data-unlock]');
  let saved = 'blocked'; try { saved = localStorage.getItem(key); } catch { /* blocked */ }
  return { heroWeapon: f?.[0].weapon, foeMaxHealth: f?.[1].maxHealth, foeAttack: f?.[1].sheet?.attack, line: line ? { text: line.textContent, opacity: line.style.opacity } : null, saved, drawn: Object.keys(globalThis.__weaponShapes ?? {}) };
}, KEY);
const killFirst = async (page) => {
  await page.waitForFunction(() => globalThis.__v3Zone?.engaged === true, null, { timeout: 120000 });
  await page.evaluate(() => { globalThis.__kill = setInterval(() => { const k = (c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })); const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1); k('KeyC', 'keydown'); k('KeyC', 'keyup'); if (globalThis.__v3Fight.finish) clearInterval(globalThis.__kill); }, 100); });
  await page.waitForFunction(() => !!globalThis.__v3Fight?.finish, null, { timeout: 180000 });
  await page.waitForTimeout(1200);
};
const shot = async (page, name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log(`${name}: ${JSON.stringify(await sim(page))}`); };
const phone = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

// 1 + 2 + 3: one context, the save carried between pages
const ctx = await browser.newContext(phone);
let page = await open(ctx, '', '1-fresh');
console.log('0-fresh', JSON.stringify(await sim(page)));
await shot(page, '0-fresh-ready');
await killFirst(page);
await shot(page, '1-first-kill-unlock-line');
await page.close();
page = await open(ctx, '', '2-reload');
await shot(page, '2-reload-with-save');
await page.close();
page = await open(ctx, 'save=off', '3-save-off');
await shot(page, '3-save-off-after-a-save');
await page.close();
await ctx.close();

// 4: storage that throws
const blocked = await browser.newContext(phone);
await blocked.addInitScript(() => {
  const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
  Object.defineProperty(window, 'localStorage', { get: boom, configurable: true });
});
page = await open(blocked, '', '4-blocked');
await killFirst(page);
await shot(page, '4-blocked-storage-first-kill');
await page.close();
await blocked.close();

// 5: a seeded save, Gargantua and Arachne down
const seeded = await browser.newContext(phone);
await seeded.addInitScript(([key]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ v: 1, kills: { gargantua: 1, arachne: 1 }, ladder: ['gargantua', 'arachne'], unlocked: ['gladius', 'cleaver'] })); }, [KEY]);
page = await open(seeded, '', '5-cleaver');
await page.keyboard.down('KeyW'); await page.waitForTimeout(900); await page.keyboard.up('KeyW');
await page.keyboard.press('KeyG'); await page.waitForTimeout(450);
await shot(page, '5-seeded-cleaver-heavy');
await page.close();
await seeded.close();

await browser.close();
console.log(errors.length ? `PAGE ERRORS: ${errors.join(' | ')}` : 'no page errors');
process.exit(errors.length ? 1 : 0);
