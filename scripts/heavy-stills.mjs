// Directional heavies stills, 375 wide, with the phone's gesture: hold STRIKE past input.heavy-hold-ms, then slide right / left / up inside the grace (or lift: V1's
// heavy). For each query and each heavy it shoots 350/600/850 ms after the heavy fires, one fresh page per still: <tag>-<plain|right|left|thrust>-<ms>.png.
//   node scripts/heavy-stills.mjs <base url> <out dir> [query ...]     (CHROME=<path> picks the browser; on a Mac it uses Metal, elsewhere SwiftShader)
// Run on the Mac GPU when its load is under 12: a loaded VPS's software GL falls behind the wall clock and the moments drift (2026-10-26).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/heavy-stills.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const pause = (page, ms) => page.waitForTimeout(ms);
const HEAVIES = [['plain', null], ['right', [30, 0]], ['left', [-30, 0]], ['thrust', [0, -30]]];   // the slide after the hold, px
const HOLD_MS = 260, AT = [350, 600, 850];   // HOLD_MS: past input.heavy-hold-ms (220), inside its grace (100); AT: ms after the heavy fires
for (const query of queries.length ? queries : ['']) {
  const tag = query ? query.replace(/[^a-z0-9]+/gi, '-') : 'default';
  for (const [name, slide] of HEAVIES) for (const at of AT) {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    page.on('pageerror', (e) => console.error(`${tag}: pageerror ${e.message}`));
    await page.goto(`${base}/${query ? `?${query}` : ''}`);
    await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 120000 });
    await pause(page, 1000);
    await page.click('#attack-button');   // Fight: draw
    await pause(page, 1500);
    await page.waitForFunction(() => !/Drawing/.test(document.body.innerText), null, { timeout: 30000 });
    await pause(page, 800);
    await page.keyboard.down('KeyW'); await pause(page, 900); await page.keyboard.up('KeyW');   // close in
    await pause(page, 200);
    const box = await page.locator('#attack-button').boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y); await page.mouse.down(); await pause(page, HOLD_MS);
    if (slide) await page.mouse.move(x + slide[0], y + slide[1], { steps: 3 });
    await page.mouse.up();
    await pause(page, at);
    await page.screenshot({ path: `${out}/${tag}-${name}-${at}.png` });
    await page.close();
    console.log(`${tag} ${name} ${at}: done`);
  }
}
await browser.close();
