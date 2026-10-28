// Frankendom parts (data/parts.json, src/fight/parts-hook.ts), 375 wide, on the BUILT game, through real taps (Playwright touchscreen): the hero kills the foe (held at 1 hp), the corpse freezes, three parts
// are cut by a plain tap on them (no Take button), then the ☰ button is tapped, a part is equipped by a tap, the page is reloaded and the menu is read again (the save kept it).
//   node scripts/parts-stills.mjs <base url> <out dir> <tag> [query]       stills: <tag>-1-closed (button, nothing on the body), <tag>-2-menu, <tag>-3-equipped, <tag>-4-reloaded
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, tag, query = ''] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/parts-stills.mjs <base url> <out dir> <tag> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const TICK = 1000 / 60, CUT_EVERY = 55, MAX_TICKS = 3000, errors = [], UNITS = (process.env.UNITS ?? 'arm_left,leg_right,head').split(',');
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: process.env.GL_ARGS ? process.env.GL_ARGS.split(' ') : ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
let page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console ${m.text()}`); });
const boot = async () => {
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 600000 });
  await page.waitForTimeout(2000);
};
const shoot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: `${out}/${tag}-${name}.png` }); };
const save = () => page.evaluate(() => { try { const j = JSON.parse(localStorage.getItem('frankendom.v3.progress') ?? 'null'); return j && { parts: j.parts ?? null, equipped: j.equipped ?? null }; } catch { return 'bad'; } });
const tapCentre = async (sel) => { const b = await page.locator(sel).first().boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };

await boot();
await page.clock.install();
await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 2000);
const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
const read = () => page.evaluate(() => { const p = globalThis.__v3Fight, [h] = p.duel.fighters; return { hero: h.phase, victim: p.finish?.victim ?? -1, ragdoll: globalThis.__ragdoll?.state }; });
for (let i = 0; i < 240 && /sheathed|draw/.test((await read()).hero); i++) await run(1);
await run(30);
await page.keyboard.down('KeyW');
let killedAt = -1, stickUp = false;
for (let n = 0; n < MAX_TICKS; n++) {
  if (n % CUT_EVERY === 0 && killedAt < 0) { await page.keyboard.down('KeyD'); await page.keyboard.down('KeyF'); await page.keyboard.up('KeyF'); await page.keyboard.up('KeyD'); }
  await run(1);
  const s = await read();
  if (killedAt < 0) {
    const gap = await page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1); return Math.hypot(h.body.x - f.body.x, h.body.z - f.body.z); });
    if (!stickUp && gap < 1.6) { stickUp = true; await page.keyboard.up('KeyW'); }
  }
  if (killedAt < 0 && s.victim === 1) { killedAt = n; await page.keyboard.up('KeyW'); }
  if (killedAt >= 0 && n - killedAt >= 150) break;
}
await page.keyboard.up('KeyW');
console.log(`${tag}: killed at ${killedAt}, ragdoll ${(await read()).ragdoll}`);
await run(80);
const tapUnit = async (u) => {
  const cut = () => page.evaluate(() => (globalThis.__v3Cuts ?? []).map((c) => c.unit));
  if ((await cut()).includes(u)) return console.log(`${tag}: ${u} already cut by the kill`);
  const at = await page.evaluate((u) => { for (let y = 120; y < 700; y += 4) for (let x = 20; x < 360; x += 4) if (globalThis.__ragdoll.probe?.(x, y) === u) return [x, y]; return null; }, u);
  if (at) await page.touchscreen.tap(at[0], at[1]);
  await run(60);
  console.log(`${tag}: tap ${u} at ${at}: cut ${(await cut()).includes(u)}`);
};
for (const u of UNITS) await tapUnit(u);
await run(60);
await shoot('1-closed');
console.log(`${tag}: take-ui present ${await page.evaluate(() => !!document.querySelector('.pk-pill'))}; sheet hidden ${await page.evaluate(() => document.querySelector('[data-frank=sheet]')?.hidden)}; save ${JSON.stringify(await save())}`);
await tapCentre('[data-frank=button]');
await run(2);
console.log(`${tag}: sheet text ${JSON.stringify(await page.evaluate(() => document.querySelector('[data-frank=sheet]').innerText.replace(/\s+/g, ' ').slice(0, 400)))}`);
await shoot('2-menu');
await tapCentre('[data-frank=equip]');
await run(2);
console.log(`${tag}: after Equip ${JSON.stringify((await save())?.equipped)}`);
await shoot('3-equipped');
await page.close();
page = await ctx.newPage();   // a fresh page, real clock, same storage: what a reload sees
page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console ${m.text()}`); });
await boot();
await tapCentre('[data-frank=button]');
await page.waitForTimeout(400);
console.log(`${tag}: reloaded worn ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[data-frank=unequip]')].map((b) => b.closest('[data-part]')?.dataset.part)))}`);
await shoot('4-reloaded');
console.log(`${tag}: errors ${errors.length}${errors.length ? ' ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
