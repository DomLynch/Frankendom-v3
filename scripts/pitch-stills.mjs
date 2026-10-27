// Stills for the zone camera pitch (data/fight.json camera.pitch), 375 x 812: for each query ('' = the default page, 'pitch=low', ...) the ready idle view, a heavy mid-fight view
// and the view after the hero strafes round (the horizon and the skyline band show). Waits for the skyline strip to land when the tree has one (src/fight/skyline.ts).
//   node scripts/pitch-stills.mjs <base url> <out dir> [query ...]      (headless Chromium; on a Mac it uses Metal, elsewhere SwiftShader)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/pitch-stills.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const pause = (page, ms) => page.waitForTimeout(ms);
for (const query of queries.length ? queries : ['']) {
  const tag = query ? query.replace(/[^a-z0-9]+/gi, '-') : 'default';
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error(`${tag}: pageerror ${e.message}`));
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 180000 });
  await pause(page, 4000);
  await page.screenshot({ path: `${out}/${tag}-ready.png` });
  await page.keyboard.down('KeyW'); await pause(page, 900); await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyG'); await pause(page, 450);
  await page.screenshot({ path: `${out}/${tag}-heavy.png` });
  await pause(page, 1500);
  await page.keyboard.down('KeyD'); await pause(page, 3500); await page.keyboard.up('KeyD');
  await pause(page, 600);
  await page.screenshot({ path: `${out}/${tag}-round.png` });
  await page.close();
  console.log(`${tag}: done`);
}
await browser.close();
