// PERF ROW (wall-clock + draw budget): Mac only (a real GPU), run with MAC_HEAVY_OK=1 and load < 12 (check `uptime`) on a built dist/ (npm run build). Never in CI or hfjob. Run: npm run perf:rows
// Frankendom parts, stage 2 wear (data/parts.json wear.budget): the hero with three parts worn (a Minotaur head, Arachne's left arm, Sir Reginald's left leg) against the bare hero, at 375 wide, same page, same
// seconds after the fight is ready: the hero's skinned draws (must stay within budget.skinnedDrawsMax) and the frame time (median of requestAnimationFrame deltas; the worn hero may cost at most
// budget.frameMsMedianExtra over the bare one). Prints one line per case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { collectErrors, launchBrowser, phoneOptions, serveDist, waitPlayable } from '../../scripts/lib/browser.mjs';

const ROWS = JSON.parse(readFileSync(new URL('../../data/parts.json', import.meta.url), 'utf8')), B = ROWS.wear.budget;
const DIST = fileURLToPath(new URL('../../dist', import.meta.url));
const skip = process.env.MAC_HEAVY_OK !== '1' ? 'perf row: set MAC_HEAVY_OK=1 (Mac only, load < 12)' : !existsSync(`${DIST}/index.html`) ? 'perf row: build first (npm run build)' : false;
const FRAMES = Number(process.env.FRAMES ?? 360), LOADOUT = 'pitborn:head,arachne:arm_left,castle-guard:leg_left';

async function measure(server, browser, loadout) {
  const page = await browser.newPage(phoneOptions(2));
  const errors = collectErrors(page);
  await page.goto(`${server.url}/?wear=${loadout}&save=off`);
  await waitPlayable(page, { timeout: 180000 });
  const want = loadout ? loadout.split(',').length : 0;
  await page.waitForFunction((n) => (globalThis.__v3Wear?.info().worn.length ?? 0) >= n, want, { timeout: 90000 });
  for (let i = 0; i < 200 && /sheathed|draw/.test(await page.evaluate(() => globalThis.__v3Fight.duel.fighters[0].phase)); i++) await page.waitForTimeout(100);
  await page.waitForTimeout(3000);
  const out = await page.evaluate((n) => new Promise((resolve) => {
    const dt = []; let last = performance.now();
    const step = (t) => { dt.push(t - last); last = t; if (dt.length < n) requestAnimationFrame(step); else { dt.sort((a, b) => a - b); resolve({ median: dt[dt.length >> 1], p95: dt[Math.floor(dt.length * 0.95)], max: dt[dt.length - 1] }); } };
    requestAnimationFrame(step);
  }), FRAMES);
  const info = await page.evaluate(() => globalThis.__v3Wear.info());
  await page.close();
  assert.deepEqual(errors, []);
  return { ...out, draws: info.draws, worn: info.worn.length };
}

test('a hero wearing three parts: skinned draws within budget and frame time within budget of the bare hero', { skip, timeout: 600000 }, async () => {
  const server = await serveDist(DIST), browser = await launchBrowser({ angle: 'metal', extra: ['--disable-frame-rate-limit', '--disable-gpu-vsync'] });   // vsync off: the frame time is what the frame costs, not the 60 Hz tick
  try {
    const bare = await measure(server, browser, ''), worn = await measure(server, browser, LOADOUT);
    const f = (n) => n.toFixed(2);
    console.log(`parts-wear cost: bare hero ${bare.draws.hero} skinned draws, frame median ${f(bare.median)} ms p95 ${f(bare.p95)} ms | 3 parts ${worn.draws.hero} skinned draws (${worn.draws.wear} worn), frame median ${f(worn.median)} ms p95 ${f(worn.p95)} ms | budget ${B.skinnedDrawsMax} draws, +${B.frameMsMedianExtra} ms`);
    assert.equal(worn.worn, 3); assert.equal(bare.draws.wear, 0);
    assert.ok(worn.draws.hero <= B.skinnedDrawsMax, `${worn.draws.hero} skinned draws over the budget ${B.skinnedDrawsMax}`);
    assert.ok(worn.median - bare.median <= B.frameMsMedianExtra, `median frame +${f(worn.median - bare.median)} ms over the budget +${B.frameMsMedianExtra} ms`);
  } finally { await browser.close(); await server.close(); }
});
