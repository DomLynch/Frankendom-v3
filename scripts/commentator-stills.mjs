// The arena commentator at 375 wide on the BUILT game (headless Chromium, software GL; the VPS). Captions in context, through the real paths:
//   1 the fight begins on its own (the opener engages the first boss) -> the fight_start line
//   2 the hero's health is cut to a sliver in the sim -> hero_low (the frame loop sees it)
//   3 the boss's health is cut to a sliver -> boss_low
//   4 a corpse part is cut -> the 'cut' line (the ragdoll's frankendom:cut event)
//   5 the same page with localStorage fd3.commentator = off says nothing
//   node scripts/commentator-stills.mjs <base url> <out dir>      (serve dist/ first: node scripts/serve.mjs <port>)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/commentator-stills.mjs <base url> <out dir>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const phone = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const errors = [];
const open = async (ctx, tag) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(`${tag}: ${e.message}`); console.error(`${tag}: pageerror ${e.message}`); });
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(`${tag}: console ${m.text()}`); console.error(`${tag}: console.error ${m.text()}`); } });
  await page.goto(`${base}/`);
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 180000 });
  return page;
};
const caption = (page) => page.evaluate(() => { const el = document.querySelector('[data-commentator]'); return el ? { text: el.textContent, opacity: el.style.opacity, box: (({ x, y, width, height }) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(width), h: Math.round(height) }))(el.getBoundingClientRect()), said: globalThis.__v3Commentator?.said } : null; });
// a software-GL screenshot takes seconds and the caption lasts 3.4 s: hold it fully shown (no fade) for the shot only; its text, place and size are the page's own
const shot = async (page, name) => {
  const hold = await page.addStyleTag({ content: '.cm-line{opacity:1!important;transition:none!important}' });
  const before = await caption(page);
  await page.screenshot({ path: `${out}/${name}.png` });
  await hold.evaluate((n) => n.remove());
  console.log(name, JSON.stringify(before));
};
const waitLine = (page, ms = 60000) => page.waitForFunction(() => { const el = document.querySelector('[data-commentator]'); return !!el && el.style.opacity === '1' && el.textContent.length > 0; }, null, { timeout: ms });
const gone = (page) => page.waitForFunction(() => document.querySelector('[data-commentator]')?.style.opacity !== '1', null, { timeout: 20000 });

const ctx = await browser.newContext(phone);
const page = await open(ctx, 'main');
await page.waitForFunction(() => globalThis.__v3Zone?.engaged === true, null, { timeout: 120000 });
await waitLine(page); await page.waitForTimeout(450); await shot(page, '1-fight-start');
await gone(page); await page.waitForTimeout(500);
await page.evaluate(() => { globalThis.__low = setInterval(() => { const f = globalThis.__v3Fight?.duel.fighters; if (f) f[0].health = Math.min(f[0].health, 20); }, 50); });
await waitLine(page); await page.waitForTimeout(450); await shot(page, '2-hero-low');
await page.evaluate(() => clearInterval(globalThis.__low)); await gone(page); await page.waitForTimeout(15000);   // the game clock runs slower than the wall clock under software GL: the 4 s gap between lines needs real seconds
await page.evaluate(() => { globalThis.__lowb = setInterval(() => { const f = globalThis.__v3Fight?.duel.fighters; if (f) { f[0].health = f[0].maxHealth; f[1].health = Math.min(f[1].health, Math.floor(f[1].maxHealth * 0.15)); } }, 50); });
await waitLine(page); await page.waitForTimeout(450); await shot(page, '3-boss-low');
await page.evaluate(() => clearInterval(globalThis.__lowb));
await gone(page); await page.waitForTimeout(15000);
await page.evaluate(() => window.dispatchEvent(new CustomEvent('frankendom:cut', { detail: { unit: 'arm_right' } })));   // the ragdoll's own event (cutUnit), as a tap on a corpse part fires it
await waitLine(page); await shot(page, '4-cut');
// the caption must not cover the controls, the radar, the boss bar or the hints: report the rects
const rects = await page.evaluate(() => {
  const r = (q) => { const el = document.querySelector(q); if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }; };
  return { caption: r('[data-commentator]'), bars: r('.combat-hud'), radar: r('[data-radar]'), joystick: r('#joystick'), actions: r('#actions') };
});
console.log('rects', JSON.stringify(rects));
await page.close(); await ctx.close();

const off = await browser.newContext(phone);
await off.addInitScript(() => { try { localStorage.setItem('fd3.commentator', 'off'); } catch { /* blocked */ } });
const quiet = await open(off, 'off');
await quiet.waitForFunction(() => globalThis.__v3Zone?.engaged === true, null, { timeout: 120000 });
await quiet.waitForTimeout(5000);
const quietState = await caption(quiet);
console.log('5-off', JSON.stringify(quietState));
if (quietState?.said) { errors.push('off: a line was said'); }
await browser.close();
if (errors.length) { console.error(`FAIL: ${errors.length} problem(s)`); process.exit(1); }
