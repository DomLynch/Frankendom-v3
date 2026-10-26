// 375-wide stills of the duel, headless (VPS Chromium; software GL is fine for a picture, not for timings).
//   node scripts/stills.mjs <base url> <out dir> [query ...]
// For each query ('' = the default page) it writes <tag>-ready.png (art in; with start=v1, before Fight), <tag>-heavy.png (a heavy mid-swing) and
// <tag>-guard-walk.png (guard held while backing off), tag = the query or 'default'. Keys are V1's (input.ts): F light, G heavy, Q guard, S back.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/stills.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const pause = (page, ms) => page.waitForTimeout(ms);
for (const query of queries.length ? queries : ['']) {
  const tag = query ? query.replace(/[^a-z0-9]+/gi, '-') : 'default';
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error(`${tag}: pageerror ${e.message}`));
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 120000 });
  await pause(page, 1500);
  await page.screenshot({ path: `${out}/${tag}-ready.png` });
  // The fight starts by itself (src/auto-start.ts); only ?start=v1 still waits for the Fight press that draws.
  if (/(^|&)start=v1\b/.test(query)) await page.click('#attack-button');
  await pause(page, 2500);
  await page.keyboard.down('KeyW'); await pause(page, 900); await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyG'); await pause(page, 450);
  await page.screenshot({ path: `${out}/${tag}-heavy.png` });
  await pause(page, 1500);
  await page.keyboard.down('KeyQ'); await pause(page, 300); await page.keyboard.down('KeyS'); await pause(page, 900);
  await page.screenshot({ path: `${out}/${tag}-guard-walk.png` });
  await page.keyboard.up('KeyS'); await page.keyboard.up('KeyQ');
  await page.close();
  console.log(`${tag}: done`);
}
await browser.close();
