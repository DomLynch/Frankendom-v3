// Stills for the skyline PR: at 375x812 (the phone fight camera): ready idle, mid-fight (a heavy swing) and a view round the horizon (the hero strafes round
// the boss so the camera turns); then the same ready and round views in landscape (812x375) and on a desktop window (1280x720), where the horizon is on screen.
//   node scripts/skyline-stills.mjs <base url> <out dir> [query ...]      ('' = the default page; 'sky=v1' = the flat sky)
// Headless Chromium; on a Mac it uses Metal, elsewhere SwiftShader. Waits for the strip to land (the row's load delay + fade) before the picture.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/skyline-stills.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const pause = (page, ms) => page.waitForTimeout(ms);
const VIEWS = [['phone', 375, 812, 3, true], ['land', 812, 375, 2, true], ['desk', 1280, 720, 1, false]];
for (const query of queries.length ? queries : ['']) {
  const tag = query ? query.replace(/[^a-z0-9]+/gi, '-') : 'default';
  for (const [view, w, h, dpr, mobile] of VIEWS) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
    page.on('pageerror', (e) => console.error(`${tag}: pageerror ${e.message}`));
    await page.goto(`${base}/${query ? `?${query}` : ''}`);
    await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 180000 });
    await pause(page, 4000);
    await page.screenshot({ path: `${out}/${tag}-${view}-ready.png` });
    if (view === 'phone') {
      await page.keyboard.down('KeyW'); await pause(page, 900); await page.keyboard.up('KeyW');
      await page.keyboard.press('KeyG'); await pause(page, 450);
      await page.screenshot({ path: `${out}/${tag}-${view}-heavy.png` });
      await pause(page, 1500);
    }
    await page.keyboard.down('KeyD'); await pause(page, 3500); await page.keyboard.up('KeyD');
    await pause(page, 600);
    await page.screenshot({ path: `${out}/${tag}-${view}-round.png` });
    await page.close();
    console.log(`${tag} ${view}: done`);
  }
}
await browser.close();
