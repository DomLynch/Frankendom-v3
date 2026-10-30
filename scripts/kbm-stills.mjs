// Keyboard + mouse and the landscape layout (data/input.json, src/fight/kbm.ts), stills at any viewport. Headless Chromium, software GL on the VPS (--use-angle=swiftshader).
//   node scripts/kbm-stills.mjs <base url> <out dir> <tag> <WxH> <touch|desktop> [query]
// touch: a phone (isMobile, hasTouch, 2x); desktop: a plain window with a mouse and keyboard (1x). Shots: <tag>-1-ready (the scene settled), <tag>-2-fight (a few seconds on, a key held so the layout is read
// with a fight under way), and with kbm on desktop <tag>-3-click (a left click on the arena: a strike). Prints the page errors (must be 0), the layout attribute and the boxes of the HUD parts.
import { mkdirSync } from 'node:fs';
import { launchBrowser, waitPlayable } from './lib/browser.mjs';

const [base, out, tag, size, kind, query = ''] = process.argv.slice(2);
if (!base || !out || !tag || !/^\d+x\d+$/.test(size ?? '') || !['touch', 'desktop'].includes(kind)) { console.error('usage: node scripts/kbm-stills.mjs <base url> <out dir> <tag> <WxH> <touch|desktop> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const [width, height] = size.split('x').map(Number), errors = [];
const browser = await launchBrowser({ glArgsEnv: true });
const page = await browser.newPage(kind === 'touch' ? { viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width, height }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console ${m.text()}`); });
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await waitPlayable(page, { timeout: 240000 });
await page.waitForTimeout(3000);
const shoot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${tag}-${name}.png`, timeout: 300000 }); };   // software GL at a desktop size can take longer than the default 30 s for one frame
const report = (label) => page.evaluate((label) => {
  const r = (sel) => { const b = document.querySelector(sel)?.getBoundingClientRect(); return b && b.width ? [b.left, b.top, b.right, b.bottom].map((v) => Math.round(v)) : null; };
  const h = document.documentElement;
  return `${label}: layout=${h.dataset.layout ?? '-'} kbm=${h.dataset.kbm ?? '-'} hud=${JSON.stringify(r('.combat-hud'))} joystick=${JSON.stringify(r('#joystick'))} actions=${JSON.stringify(r('#actions'))} radar=${JSON.stringify(r('[data-radar]'))} world=${JSON.stringify(r('#world'))}`;
}, label);
if (kind === 'desktop') { await page.mouse.move(width / 2, height / 2); await page.keyboard.down('KeyW'); await page.waitForTimeout(250); await page.keyboard.up('KeyW'); }
console.log(await report(`${tag} ready`));
await shoot('1-ready');
if (kind === 'desktop') await page.keyboard.down('KeyW'); else await page.touchscreen.tap(width * 0.8, height * 0.4);
await page.waitForTimeout(6000);
if (kind === 'desktop') await page.keyboard.up('KeyW');
console.log(await report(`${tag} later`));
await shoot('2-fight');
if (kind === 'desktop') { await page.mouse.click(width * 0.5, height * 0.45); await page.waitForTimeout(150); console.log(`${tag}: after click ${JSON.stringify(await page.evaluate(() => globalThis.__v3Fight?.duel.fighters[0].phase))}`); await shoot('3-click'); }
console.log(`${tag}: page errors ${errors.length}${errors.length ? ' ' + JSON.stringify(errors.slice(0, 5)) : ''}`);
await browser.close();
