// Star bosses (data/stars.json) at 375 wide, headless (software GL), on the BUILT dist: a 0-star Gargantua against a 2-star one (the roll forced through the page's own hook, globalThis.__v3Stars.force: no URL switch),
// the HUD name with its gold stars, the foe's health, the ragdoll dying without a page error.
//   node scripts/star-stills.mjs <base url> <out dir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/star-stills.mjs <base url> <out dir>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const phone = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const open = async (query, tag) => {
  const ctx = await browser.newContext(phone), page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(`${tag}: pageerror ${e.message}`); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: console ${m.text()}`); });
  await page.goto(`${base}/?${query}`);
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  return page;
};
const read = (page) => page.evaluate(() => {
  const f = globalThis.__v3Fight?.duel.fighters, name = document.getElementById('opponent-name');
  return { stars: globalThis.__v3Stars?.of(), foeMaxHealth: f?.[1].maxHealth, foeHealth: f?.[1].health, nameHtml: name?.innerHTML, nameText: name?.textContent, starColour: name?.querySelector('.opponent-stars')?.style.color ?? null, engaged: globalThis.__v3Zone?.engaged };
});
const engage = (page) => page.waitForFunction(() => globalThis.__v3Zone?.engaged === true, null, { timeout: 120000 });
const shot = async (page, name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log(`${name}: ${JSON.stringify(await read(page))}`); };

// 0-star: the first fight, as before
{
  const page = await open('save=off', '0star');
  await engage(page); await page.waitForTimeout(2500); await shot(page, 'gargantua-0star');
  await page.context().close();
}
// 2-star: the same spawn forced to two stars
{
  const page = await open('save=off', '2star');
  const ok = await page.evaluate(() => globalThis.__v3Stars.force('yard-pitborn', 2));
  console.log(`force yard-pitborn 2 -> ${ok}`);
  await engage(page); await page.waitForTimeout(2500); await shot(page, 'gargantua-2star');
  await page.evaluate(() => { globalThis.__kill = setInterval(() => { const k = (c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })); const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1); k('KeyC', 'keydown'); k('KeyC', 'keyup'); if (globalThis.__v3Fight.finish) clearInterval(globalThis.__kill); }, 100); });
  await page.waitForFunction(() => !!globalThis.__v3Fight?.finish, null, { timeout: 180000 });
  await page.waitForTimeout(2500); await shot(page, 'gargantua-2star-dying');
  await page.waitForTimeout(3000); await shot(page, 'gargantua-2star-corpse');
  await page.context().close();
}
// 1-star for the record
{
  const page = await open('save=off', '1star');
  await page.evaluate(() => globalThis.__v3Stars.force('yard-pitborn', 1));
  await engage(page); await page.waitForTimeout(2500); await shot(page, 'gargantua-1star');
  await page.context().close();
}
await browser.close();
console.log(errors.length ? `ERRORS (${errors.length}):\n${errors.join('\n')}` : 'console errors: 0');
process.exit(errors.length ? 1 : 0);
